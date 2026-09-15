/**
 * 平面几何与比例换算。
 * 所有坐标均为图片自然像素坐标（画布未做任何缩放，点击坐标即自然像素）。
 */

export interface Point {
  x: number;
  y: number;
}

/** 两点欧氏像素距离。 */
export function euclideanDistance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * 标尺比例 = 标尺实际长度(mm) / 标尺两点欧氏像素距离(px)。
 * 单位为 mm/px。像素距离必须大于 0（两点不得重合）。
 */
export function computeScaleRatio(actualLengthMm: number, pixelDistance: number): number {
  if (!Number.isFinite(actualLengthMm) || actualLengthMm <= 0) {
    throw new Error('标尺实际长度必须为正数');
  }
  if (!Number.isFinite(pixelDistance) || pixelDistance <= 0) {
    throw new Error('标尺两点重合，像素距离为 0');
  }
  return actualLengthMm / pixelDistance;
}

/** 裂纹长度(mm) = 裂纹欧氏像素距离(px) × 标尺比例(mm/px)。 */
export function computeCrackLengthMm(pixelDistance: number, ratioMmPerPx: number): number {
  if (!Number.isFinite(pixelDistance) || pixelDistance < 0) {
    throw new Error('裂纹像素距离非法');
  }
  if (!Number.isFinite(ratioMmPerPx) || ratioMmPerPx <= 0) {
    throw new Error('标尺比例非法');
  }
  return pixelDistance * ratioMmPerPx;
}
