import type { PlaybackStream } from "./playbackStream";
import { downloadAudioBytes } from "@/shared/media/innertube";
import { downloadHlsAudio } from "@/shared/media/soundcloud/soundcloudHls";
import { isStandaloneAudioFile } from "@/shared/storage/audioFormat";
import { isNativeApp } from "@/shared/platform/native";
import { log } from "@/shared/utils/logger";

export async function downloadPlaybackAudio(stream: PlaybackStream, signal: AbortSignal): Promise<Blob | null> {
  if (stream.blob) return stream.blob;
  const startedAt = performance.now();
  const options = {
    contentLength: stream.contentLength,
    signal,
    ...(isNativeApp() ? { concurrency: 1 } : {}),
  };
  const bytes = stream.hls
    ? await downloadHlsAudio(stream.url, options)
    : await downloadAudioBytes(stream.url, options);
  if (!bytes || signal.aborted) return null;
  const mimeType = stream.mimeType || "audio/webm";
  if (!mimeType.startsWith("audio/") && !mimeType.startsWith("video/")) return null;
  if (!isStandaloneAudioFile(bytes.subarray(0, 16))) {
    log("yellow", "download", `not caching: stream is not a standalone audio file`);
    return null;
  }
  log(
    "cyan",
    "download",
    `${Math.round(bytes.byteLength / 1024)} KB in ${Math.round(performance.now() - startedAt)}ms (${stream.contentLength ? "chunked" : "single request"})`,
  );
  return new Blob([bytes], { type: mimeType });
}
