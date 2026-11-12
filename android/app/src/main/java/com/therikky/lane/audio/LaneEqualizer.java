package com.therikky.lane.audio;

import androidx.media3.common.C;
import androidx.media3.common.audio.BaseAudioProcessor;
import androidx.media3.common.util.UnstableApi;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Arrays;

@UnstableApi
final class LaneEqualizer extends BaseAudioProcessor {
    // Match the peaking filters and soft knee in the Web Audio player.
    private static final int[] FREQUENCIES = {32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000};
    private static final double Q = 1.4;
    private static final double KNEE = 0.9;
    private static final double HEADROOM = 0.09;
    private static final double PCM_SCALE = 32768;
    private static final float[] FLAT = new float[FREQUENCIES.length];

    // Settings are published on the main thread. Filter state belongs to the audio thread.
    private volatile float[] gains = FLAT;
    private float[] appliedGains;
    private final Band[] bands = new Band[FREQUENCIES.length];
    private final Band[] activeBands = new Band[FREQUENCIES.length];
    private int activeBandCount;
    private boolean hasBoost;

    void setGains(boolean enabled, float[] values) {
        if (!enabled) {
            gains = FLAT;
            return;
        }
        float[] next = Arrays.copyOf(values, FREQUENCIES.length);
        for (int i = 0; i < next.length; i++) {
            next[i] = Float.isFinite(next[i]) ? Math.max(-12f, Math.min(12f, next[i])) : 0f;
        }
        if (!Arrays.equals(gains, next)) gains = next;
    }

    @Override
    protected AudioFormat onConfigure(AudioFormat format) throws UnhandledAudioFormatException {
        if (format.encoding != C.ENCODING_PCM_16BIT) throw new UnhandledAudioFormatException(format);
        return format;
    }

    @Override
    protected void onFlush() {
        Arrays.fill(bands, null);
        Arrays.fill(activeBands, null);
        activeBandCount = 0;
        appliedGains = null;
    }

    @Override
    public void queueInput(ByteBuffer input) {
        // Media3 may pass its shared EMPTY_BUFFER, which the base class also
        // uses as the initial output. A zero-byte put would copy it into itself.
        if (!input.hasRemaining()) return;

        float[] currentGains = gains;
        if (currentGains != appliedGains) applyGains(currentGains);
        ByteBuffer output = replaceOutputBuffer(input.remaining());
        if (activeBandCount == 0) {
            output.put(input);
        } else {
            input.order(ByteOrder.nativeOrder());
            int channels = inputAudioFormat.channelCount;
            while (input.remaining() >= inputAudioFormat.bytesPerFrame) {
                for (int channel = 0; channel < channels; channel++) {
                    double sample = input.getShort() / PCM_SCALE;
                    for (int i = 0; i < activeBandCount; i++) {
                        sample = activeBands[i].process(sample, channel);
                    }
                    double magnitude = Math.abs(sample);
                    if (hasBoost && magnitude > KNEE) {
                        double limited = KNEE - HEADROOM * Math.expm1(-(magnitude - KNEE) / HEADROOM);
                        sample = Math.copySign(limited, sample);
                    }
                    int pcm = (int) Math.round(sample * PCM_SCALE);
                    output.putShort((short) Math.max(Short.MIN_VALUE, Math.min(Short.MAX_VALUE, pcm)));
                }
            }
        }
        output.flip();
    }

    private void applyGains(float[] next) {
        activeBandCount = 0;
        hasBoost = false;
        for (int i = 0; i < FREQUENCIES.length; i++) {
            int frequency = FREQUENCIES[i];
            if (next[i] == 0 || 2 * frequency >= inputAudioFormat.sampleRate) {
                bands[i] = null;
                continue;
            }
            Band band = bands[i];
            if (band == null) {
                band = new Band(inputAudioFormat.channelCount);
                bands[i] = band;
            }
            if (appliedGains == null || next[i] != appliedGains[i]) {
                band.configure(frequency, inputAudioFormat.sampleRate, next[i]);
            }
            activeBands[activeBandCount++] = band;
            hasBoost |= next[i] > 0;
        }
        Arrays.fill(activeBands, activeBandCount, activeBands.length, null);
        appliedGains = next;
    }

    private static final class Band {
        private final double[] z1;
        private final double[] z2;
        private double b0, b1, b2, a2;

        Band(int channels) {
            z1 = new double[channels];
            z2 = new double[channels];
        }

        void configure(int frequency, int sampleRate, double db) {
            double amplitude = Math.pow(10, db / 40);
            double omega = 2 * Math.PI * frequency / sampleRate;
            double alpha = Math.sin(omega) / (2 * Q);
            double a0 = 1 + alpha / amplitude;
            b0 = (1 + alpha * amplitude) / a0;
            b1 = -2 * Math.cos(omega) / a0;
            b2 = (1 - alpha * amplitude) / a0;
            a2 = (1 - alpha / amplitude) / a0;
        }

        double process(double sample, int channel) {
            double filtered = b0 * sample + z1[channel];
            z1[channel] = b1 * (sample - filtered) + z2[channel];
            z2[channel] = b2 * sample - a2 * filtered;
            return filtered;
        }
    }
}
