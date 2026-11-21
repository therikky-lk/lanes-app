import { cropDestination, type CropView, type CropTransform } from "./imageCropGeometry";
export * from "./imageCropGeometry";
export type CropSource = { url: string; image: HTMLImageElement; file: File };

export async function loadCropSource(file: File): Promise<CropSource> {
  if (!file.type.startsWith("image/") || file.size > 20 * 1024 * 1024) throw new Error("Invalid image");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("Empty image");
    return { url, image, file };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

export async function renderCrop(source: CropSource, view: CropView, transform: CropTransform, output: CropView) {
  const dimensions = { width: source.image.naturalWidth, height: source.image.naturalHeight };
  if (source.file.type === "image/gif") {
    const buffer = await source.file.arrayBuffer();
    const worker = new Worker(new URL("./imageCrop.worker.ts", import.meta.url), { type: "module" });
    try {
      const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
        worker.onmessage = (event: MessageEvent<{ bytes?: ArrayBuffer; error?: string }>) => {
          if (event.data.bytes) resolve(event.data.bytes);
          else reject(new Error(event.data.error || "GIF crop failed"));
        };
        worker.onerror = () => reject(new Error("GIF crop failed"));
        worker.postMessage({ buffer, view, transform, output }, [buffer]);
      });
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(new Blob([bytes], { type: "image/gif" }));
      });
    } finally { worker.terminate(); }
  }
  const canvas = document.createElement("canvas");
  canvas.width = output.width; canvas.height = output.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");
  const destination = cropDestination(dimensions, view, transform, output);
  context.fillStyle = "#0d0d10";
  context.fillRect(0, 0, output.width, output.height);
  context.drawImage(source.image, destination.x, destination.y, destination.width, destination.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}
