export type Point = { x: number; y: number };
export type CropView = { width: number; height: number };
export type CropTransform = { zoom: number; offset: Point };
export const MAX_CROP_ZOOM = 4;

export function cropScale(image: CropView, view: CropView) {
  return Math.max(view.width / image.width, view.height / image.height);
}

export function minimumZoom(image: CropView, view: CropView) {
  return Math.min(view.width / image.width, view.height / image.height) / cropScale(image, view);
}

export function clampCrop(image: CropView, view: CropView, transform: CropTransform): CropTransform {
  const zoom = Math.max(minimumZoom(image, view), Math.min(MAX_CROP_ZOOM, transform.zoom));
  const scale = cropScale(image, view) * zoom;
  const maxX = Math.abs(image.width * scale - view.width) / 2;
  const maxY = Math.abs(image.height * scale - view.height) / 2;
  return { zoom, offset: {
    x: Math.max(-maxX, Math.min(maxX, transform.offset.x)),
    y: Math.max(-maxY, Math.min(maxY, transform.offset.y)),
  } };
}

// Keep the point beneath the fingers/cursor stationary while zooming.
export function gestureCrop(image: CropView, view: CropView, start: CropTransform, origin: Point, current: Point, ratio: number) {
  const zoom = Math.max(minimumZoom(image, view), Math.min(MAX_CROP_ZOOM, start.zoom * ratio));
  const scale = zoom / start.zoom;
  return clampCrop(image, view, { zoom, offset: {
    x: current.x - (origin.x - start.offset.x) * scale,
    y: current.y - (origin.y - start.offset.y) * scale,
  } });
}

export function cropDestination(image: CropView, view: CropView, transform: CropTransform, output: CropView) {
  const scale = cropScale(image, view) * transform.zoom;
  const factor = output.width / view.width;
  return {
    x: (view.width / 2 + transform.offset.x - image.width * scale / 2) * factor,
    y: (view.height / 2 + transform.offset.y - image.height * scale / 2) * factor,
    width: image.width * scale * factor,
    height: image.height * scale * factor,
  };
}
