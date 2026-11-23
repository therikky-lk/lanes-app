const MAX_SOURCE = 20 * 1024 * 1024;
const PHOTO_SIZE = 512;

export async function prepareCommentPhoto(file: File): Promise<string> {
  if (file.size > MAX_SOURCE || (file.type && !/^image\/(?:jpeg|png|webp|gif|avif)$/i.test(file.type))) throw new Error("photo");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const size = Math.min(image.naturalWidth, image.naturalHeight);
    if (!size) throw new Error("photo");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = PHOTO_SIZE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("photo");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, PHOTO_SIZE, PHOTO_SIZE);
    context.drawImage(image, (image.naturalWidth - size) / 2, (image.naturalHeight - size) / 2, size, size, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
    for (const quality of [0.84, 0.68, 0.5]) {
      const result = canvas.toDataURL("image/jpeg", quality);
      if (result.startsWith("data:image/jpeg;base64,") && result.length <= 220_000) return result.split(",")[1];
    }
    throw new Error("photo");
  } finally {
    URL.revokeObjectURL(url);
  }
}
