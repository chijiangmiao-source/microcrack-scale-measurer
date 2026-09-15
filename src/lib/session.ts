/**
 * 测量会话状态机（纯 TypeScript，不依赖 DOM / Vue，便于单元测试）。
 *
 * 阶段流转：
 *   idle ──(导入有效图片)──▶ calibrating ──(标尺两点 + 合法长度)──▶
 *   measuring ──(裂纹两点)──▶ done
 *
 * 约束：
 *  - 标尺两点重合或实际长度越界（0.01–100 mm 之外）时停留在标定阶段；
 *  - 文件校验失败只记录错误，绝不清空已有图片、标定或结果；
 *  - 只有换入新的有效图片才清空旧状态（beginWithImage）。
 */

import { computeCrackLengthMm, computeScaleRatio, euclideanDistance, type Point } from './geometry';
import { roundTo3Decimals } from './rounding';

export type Stage = 'idle' | 'calibrating' | 'measuring' | 'done';

export const MIN_SCALE_LENGTH_MM = 0.01;
export const MAX_SCALE_LENGTH_MM = 100;

export const SESSION_ERRORS = {
  SCALE_POINTS_COINCIDE: '标尺两端点重合，请重新点取标尺',
  SCALE_LENGTH_OUT_OF_RANGE: '标尺实际长度须在 0.01 至 100 mm 之间',
  SCALE_POINTS_REQUIRED: '请先点取标尺两端',
} as const;

export class MeasurementSession {
  stage: Stage = 'idle';
  scalePoints: Point[] = [];
  crackPoints: Point[] = [];
  scaleLengthMm: number | null = null;
  /** 标尺比例 mm/px，标定成功后确定。 */
  ratioMmPerPx: number | null = null;
  /** 裂纹长度（毫米，已按 3 位小数舍入），测量成功后确定。 */
  resultMm: number | null = null;
  /** 最近一次错误提示（文件错误、标定错误等），不清空其他状态。 */
  error: string | null = null;

  /** 换入新的有效图片：清空全部旧状态，进入标定阶段。 */
  beginWithImage(): void {
    this.stage = 'calibrating';
    this.scalePoints = [];
    this.crackPoints = [];
    this.scaleLengthMm = null;
    this.ratioMmPerPx = null;
    this.resultMm = null;
    this.error = null;
  }

  /** 标尺两点的欧氏像素距离；不足两点时为 null。 */
  get scalePixelDistance(): number | null {
    return this.scalePoints.length === 2
      ? euclideanDistance(this.scalePoints[0], this.scalePoints[1])
      : null;
  }

  /** 标定阶段点取标尺端点；已有点两点后再点则重新开始选取。 */
  addScalePoint(point: Point): void {
    if (this.stage !== 'calibrating') return;
    if (this.scalePoints.length >= 2) {
      this.scalePoints = [];
    }
    if (this.scalePoints.length === 1) {
      const first = this.scalePoints[0];
      if (euclideanDistance(first, point) === 0) {
        // 标尺点重合：停留在标定阶段，清空已选点重新来
        this.scalePoints = [];
        this.error = SESSION_ERRORS.SCALE_POINTS_COINCIDE;
        return;
      }
    }
    this.scalePoints.push(point);
    this.error = null;
  }

  /**
   * 确认标尺实际长度。长度越界或点未就绪时停留在标定阶段并返回 false；
   * 合法时计算比例并进入测量阶段。
   */
  confirmScaleLength(value: number): boolean {
    if (this.stage !== 'calibrating') return false;
    if (this.scalePoints.length !== 2) {
      this.error = SESSION_ERRORS.SCALE_POINTS_REQUIRED;
      return false;
    }
    if (
      !Number.isFinite(value) ||
      value < MIN_SCALE_LENGTH_MM ||
      value > MAX_SCALE_LENGTH_MM
    ) {
      // 长度越界：停留在标定阶段，保留已点取的标尺点
      this.error = SESSION_ERRORS.SCALE_LENGTH_OUT_OF_RANGE;
      return false;
    }
    const distance = this.scalePixelDistance;
    if (distance === null || distance === 0) {
      this.error = SESSION_ERRORS.SCALE_POINTS_COINCIDE;
      return false;
    }
    this.scaleLengthMm = value;
    this.ratioMmPerPx = computeScaleRatio(value, distance);
    this.stage = 'measuring';
    this.error = null;
    return true;
  }

  /** 测量阶段点取裂纹端点；两点齐备即计算结果并进入完成阶段。 */
  addCrackPoint(point: Point): void {
    if (this.stage !== 'measuring') return;
    this.crackPoints.push(point);
    this.error = null;
    if (this.crackPoints.length === 2) {
      const distance = euclideanDistance(this.crackPoints[0], this.crackPoints[1]);
      const rawMm = computeCrackLengthMm(distance, this.ratioMmPerPx as number);
      this.resultMm = roundTo3Decimals(rawMm);
      this.stage = 'done';
    }
  }

  /** 重新测量裂纹：保留标尺标定，清空裂纹点与结果。 */
  restartMeasurement(): void {
    if (this.stage !== 'measuring' && this.stage !== 'done') return;
    this.crackPoints = [];
    this.resultMm = null;
    this.stage = 'measuring';
    this.error = null;
  }

  /** 重新标定：保留已导入图片，清空标定与测量，回到标定阶段。 */
  restartCalibration(): void {
    if (this.stage === 'idle') return;
    this.scalePoints = [];
    this.crackPoints = [];
    this.scaleLengthMm = null;
    this.ratioMmPerPx = null;
    this.resultMm = null;
    this.stage = 'calibrating';
    this.error = null;
  }

  /** 记录文件错误：只提示，绝不清空当前图片、标定或结果。 */
  reportFileError(message: string): void {
    this.error = message;
  }

  clearError(): void {
    this.error = null;
  }
}
