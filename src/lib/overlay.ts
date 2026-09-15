/**
 * 叠加层绘制：点位、线段与拾取十字线。
 * 直接以自然像素坐标绘制，无任何画布变换缩放。
 */

import type { Point } from './geometry';
import type { Stage } from './session';

export interface OverlayModel {
  stage: Stage;
  scalePoints: readonly Point[];
  crackPoints: readonly Point[];
  /** 鼠标悬停位置（自然像素），用于拾取阶段的十字线。 */
  hover: Point | null;
}

const SCALE_COLOR = '#22d3ee'; // 标尺：青
const CRACK_COLOR = '#fb7185'; // 裂纹：红
const OUTLINE_COLOR = 'rgba(15, 23, 42, 0.9)';
const CROSSHAIR_COLOR = 'rgba(255, 255, 255, 0.45)';
const POINT_RADIUS = 5;

function drawPoint(ctx: CanvasRenderingContext2D, p: Point, color: string): void {
  ctx.beginPath();
  ctx.arc(p.x, p.y, POINT_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = OUTLINE_COLOR;
  ctx.stroke();
  // 中心十字，便于对准
  ctx.beginPath();
  ctx.moveTo(p.x - POINT_RADIUS - 3, p.y);
  ctx.lineTo(p.x - POINT_RADIUS + 1, p.y);
  ctx.moveTo(p.x + POINT_RADIUS - 1, p.y);
  ctx.lineTo(p.x + POINT_RADIUS + 3, p.y);
  ctx.moveTo(p.x, p.y - POINT_RADIUS - 3);
  ctx.lineTo(p.x, p.y - POINT_RADIUS + 1);
  ctx.moveTo(p.x, p.y + POINT_RADIUS - 1);
  ctx.lineTo(p.x, p.y + POINT_RADIUS + 3);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = color;
  ctx.stroke();
}

function drawSegment(ctx: CanvasRenderingContext2D, a: Point, b: Point, color: string): void {
  // 先描深色底再画亮色线，保证在任何图片底色上可见
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineWidth = 4;
  ctx.strokeStyle = OUTLINE_COLOR;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  ctx.stroke();
}

function drawLabel(ctx: CanvasRenderingContext2D, text: string, at: Point, color: string): void {
  ctx.font = '14px "Noto Sans SC", "Microsoft YaHei", sans-serif';
  const metrics = ctx.measureText(text);
  const padX = 6;
  const boxW = metrics.width + padX * 2;
  const boxH = 22;
  const x = Math.min(Math.max(at.x + 10, 0), Math.max(ctx.canvas.width - boxW, 0));
  const y = Math.min(Math.max(at.y - 30, 0), Math.max(ctx.canvas.height - boxH, 0));
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.fillRect(x, y, boxW, boxH);
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + padX, y + boxH / 2);
}

function drawCrosshair(ctx: CanvasRenderingContext2D, p: Point): void {
  ctx.beginPath();
  ctx.moveTo(0, p.y + 0.5);
  ctx.lineTo(ctx.canvas.width, p.y + 0.5);
  ctx.moveTo(p.x + 0.5, 0);
  ctx.lineTo(p.x + 0.5, ctx.canvas.height);
  ctx.lineWidth = 1;
  ctx.strokeStyle = CROSSHAIR_COLOR;
  ctx.stroke();
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * 重绘整个叠加层。
 * 完成阶段（done）只叠加当前测量线及其端点；标定/测量阶段叠加对应点位与线段。
 */
export function drawOverlay(ctx: CanvasRenderingContext2D, model: OverlayModel): void {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);

  const picking = model.stage === 'calibrating' || model.stage === 'measuring';
  if (picking && model.hover) {
    drawCrosshair(ctx, model.hover);
  }

  if (model.stage !== 'done') {
    if (model.scalePoints.length === 2) {
      drawSegment(ctx, model.scalePoints[0], model.scalePoints[1], SCALE_COLOR);
    }
    for (const p of model.scalePoints) drawPoint(ctx, p, SCALE_COLOR);
    if (model.scalePoints.length === 2) {
      drawLabel(ctx, '标尺', midpoint(model.scalePoints[0], model.scalePoints[1]), SCALE_COLOR);
    }
  }

  if (model.crackPoints.length === 2) {
    drawSegment(ctx, model.crackPoints[0], model.crackPoints[1], CRACK_COLOR);
  }
  for (const p of model.crackPoints) drawPoint(ctx, p, CRACK_COLOR);
  if (model.crackPoints.length === 2) {
    drawLabel(ctx, '裂纹', midpoint(model.crackPoints[0], model.crackPoints[1]), CRACK_COLOR);
  }
}
