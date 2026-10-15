/**
 * Project detections from the backend's entire EXIF-corrected JPEG
 * to CameraView's assumed center-cropped (aspect-fill) preview.
 * All dimensions use logical view points except sourceWidth/sourceHeight (pixels).
 */
export type ImageDetection = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type BoxRect = { left: number; top: number; width: number; height: number };

export function projectBoxToCoverPreview(
  box: ImageDetection,
  sourceWidth: number,
  sourceHeight: number,
  previewWidth: number,
  previewHeight: number,
): BoxRect | null {
  const numbers = [box.x1, box.y1, box.x2, box.y2, sourceWidth, sourceHeight, previewWidth, previewHeight];
  if (!numbers.every(Number.isFinite) ||
      sourceWidth <= 0 || sourceHeight <= 0 || previewWidth <= 0 || previewHeight <= 0 ||
      box.x1 < 0 || box.y1 < 0 || box.x2 > 1 || box.y2 > 1 ||
      box.x1 >= box.x2 || box.y1 >= box.y2) return null;

  const scale = Math.max(previewWidth / sourceWidth, previewHeight / sourceHeight);
  const scaledWidth = sourceWidth * scale;
  const scaledHeight = sourceHeight * scale;
  const offsetX = (previewWidth - scaledWidth) / 2;
  const offsetY = (previewHeight - scaledHeight) / 2;

  const left = Math.max(0, offsetX + box.x1 * scaledWidth);
  const top = Math.max(0, offsetY + box.y1 * scaledHeight);
  const right = Math.min(previewWidth, offsetX + box.x2 * scaledWidth);
  const bottom = Math.min(previewHeight, offsetY + box.y2 * scaledHeight);
  if (right <= left || bottom <= top) return null;
  return { left, top, width: right - left, height: bottom - top };
}
