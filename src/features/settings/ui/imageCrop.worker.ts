import { parseGIF, decompressFrame } from "gifuct-js";
import { GIFEncoder, quantize, applyPalette } from "gifenc";
import { cropDestination, type CropTransform, type CropView } from "./imageCropGeometry";

type Request = { buffer: ArrayBuffer; view: CropView; transform: CropTransform; output: CropView };
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

scope.onmessage = ({ data }) => {
  try {
    const gif = parseGIF(data.buffer);
    const dimensions = { width: gif.lsd.width, height: gif.lsd.height };
    const frames = gif.frames.filter(frame => "image" in frame);
    // Bound decoding cost, even for a small compressed file with huge frames.
    const pixels = frames.reduce((sum, frame) => sum + frame.image.descriptor.width * frame.image.descriptor.height, 0);
    if (!frames.length || frames.length > 1000 || dimensions.width * dimensions.height > 16_000_000 || pixels > 200_000_000) throw new Error("GIF too large");
    const canvas = new OffscreenCanvas(dimensions.width, dimensions.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const output = new OffscreenCanvas(data.output.width, data.output.height);
    const out = output.getContext("2d", { willReadFrequently: true });
    if (!context || !out) throw new Error("Canvas unavailable");
    const patchCanvas = new OffscreenCanvas(1, 1);
    const patchContext = patchCanvas.getContext("2d");
    if (!patchContext) throw new Error("Canvas unavailable");
    const destination = cropDestination(dimensions, data.view, data.transform, data.output);
    const encoder = GIFEncoder();
    for (const frame of frames) {
      const decoded = decompressFrame(frame, gif.gct, true);
      const { dims } = decoded;
      const previous = decoded.disposalType === 3 ? context.getImageData(0, 0, dimensions.width, dimensions.height) : null;
      patchCanvas.width = dims.width; patchCanvas.height = dims.height;
      patchContext.putImageData(new ImageData(new Uint8ClampedArray(decoded.patch), dims.width, dims.height), 0, 0);
      context.drawImage(patchCanvas, dims.left, dims.top);
      out.fillStyle = "#0d0d10";
      out.fillRect(0, 0, data.output.width, data.output.height);
      out.drawImage(canvas, destination.x, destination.y, destination.width, destination.height);
      const rgba = out.getImageData(0, 0, data.output.width, data.output.height).data;
      const palette = quantize(rgba, 256);
      encoder.writeFrame(applyPalette(rgba, palette), data.output.width, data.output.height, {
        palette, delay: decoded.delay || 100, repeat: 0,
      });
      if (decoded.disposalType === 2) context.clearRect(dims.left, dims.top, dims.width, dims.height);
      else if (previous) context.putImageData(previous, 0, 0);
    }
    encoder.finish();
    const bytes = new Uint8Array(encoder.bytes()).buffer;
    scope.postMessage({ bytes }, [bytes]);
  } catch (error) {
    scope.postMessage({ error: error instanceof Error ? error.message : "GIF crop failed" });
  }
};
