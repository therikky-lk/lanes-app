const MAX_SOURCE = 20 * 1024 * 1024;
const PHOTO_SIZE = 512;

export async function prepareCommentPhoto(file: File): Promise<string> {
  if (file.size > MAX_SOURCE || (file.type && !/^image\/(?:jpeg|png|webp|gif|avif)$/i.test(file.type))) throw new Error("photo");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const { naturalWidth, naturalHeight } = image;
    if (!naturalWidth || !naturalHeight) throw new Error("photo");
    const scale = PHOTO_SIZE / Math.max(naturalWidth, naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("photo");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.84, 0.68, 0.5]) {
      const result = canvas.toDataURL("image/jpeg", quality);
      if (result.startsWith("data:image/jpeg;base64,") && result.length <= 220_000) return result.split(",")[1];
    }
    throw new Error("photo");
  } finally {
    URL.revokeObjectURL(url);
  }
}
