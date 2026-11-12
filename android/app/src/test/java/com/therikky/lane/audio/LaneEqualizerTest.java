package com.therikky.lane.audio;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;

import androidx.media3.common.audio.AudioProcessor;
import org.junit.Test;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;

public class LaneEqualizerTest {
    @Test
    public void sharedEmptyInputDoesNotWriteToItself() {
        LaneEqualizer equalizer = new LaneEqualizer();

        equalizer.queueInput(AudioProcessor.EMPTY_BUFFER);

        assertFalse(equalizer.getOutput().hasRemaining());
    }

    @Test
    public void flatEqualizerStillCopiesPcm() {
        LaneEqualizer equalizer = new LaneEqualizer();
        ByteBuffer input = ByteBuffer.allocateDirect(4).order(ByteOrder.nativeOrder());
        input.putShort((short) 1234).putShort((short) -5678).flip();

        equalizer.queueInput(input);

        assertFalse(input.hasRemaining());
        ByteBuffer output = equalizer.getOutput();
        assertEquals(1234, output.getShort());
        assertEquals(-5678, output.getShort());
        assertFalse(output.hasRemaining());
    }
}
