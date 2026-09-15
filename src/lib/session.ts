/**
 * 测量会话状态机（纯 TypeScript，不依赖 DOM / Vue，便于单元测试）。
 *
 * 阶段流转：
 *   idle ──(导入有效图片)──▶ calibrating ──(标尺两点 + 合法长度)──▶
 *   measuring ──(裂纹两点)──▶ done ──(记录并测下一条)──▶ measuring（循环）
 *
 * 同一张显微照片可连续测量多条裂纹：标尺标定只做一次，完成一条后点
 * “记录并测下一条”，该条的点位、毫米长度与顺序号写入只读记录，
 * 画布叠加线保留，随后直接点取下一条裂纹的两端，比例持续复用。
 *
 * 约束：
 *  - 标尺两点重合或实际长度越界（0.01–100 mm 之外）时停留在标定阶段；
 *  - 新裂纹两端点与任一已记录裂纹完全相同（点取顺序相反也算）时，
 *    停留在测量阶段并提示重复，已记录内容、比例与叠加线不变；
 *  - 文件校验失败只记录错误，绝不清空已有图片、标定、结果或整批记录；
 *  - 重新标定或换入新的有效图片才清空整批记录（beginWithImage）。
 */

import { computeCrackLengthMm, computeScaleRatio, euclideanDistance, type Point } from './geometry';
import { roundTo3Decimals } from './rounding';

export type Stage = 'idle' | 'calibrating' | 'measuring' | 'done';

export const MIN_SCALE_LENGTH_MM = 0.01;
export const MAX_SCALE_LENGTH_MM = 100;

/** 一条已记录裂纹：顺序号、两端自然像素坐标与三位小数毫米长度。 */
export interface CrackRecord {
  index: number;
  start: Point;
  end: Point;
  resultMm: number;
}

export const SESSION_ERRORS = {
  SCALE_POINTS_COINCIDE: '标尺两端点重合，请重新点取标尺',
  SCALE_LENGTH_OUT_OF_RANGE: '标尺实际长度须在 0.01 至 100 mm 之间',
  SCALE_POINTS_REQUIRED: '请先点取标尺两端',
  CRACK_SEGMENT_DUPLICATE: '该裂纹与已记录裂纹的两个端点完全相同，请勿重复记录',
} as const;

function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

export class MeasurementSession {
  stage: Stage = 'idle';
  scalePoints: Point[] = [];
  /** 当前（尚未记录的一条）裂纹点；记录后立即清空，进入下一条选取。 */
  crackPoints: Point[] = [];
  scaleLengthMm: number | null = null;
  /** 标尺比例 mm/px，标定成功后确定，连续测量期间持续复用。 */
  ratioMmPerPx: number | null = null;
  /** 当前裂纹长度（毫米，已按 3 位小数舍入）；记录后归 null。 */
  resultMm: number | null = null;
  /**
   * 本张图片已记录的整批裂纹（只读视图）：仅由状态机内部整体替换，
   * 面板按顺序展示、画布常驻叠加。数组与条目均被冻结，外部不可就地改写。
   * 重新标定或换入有效新图时清空。
   */
  records: readonly CrackRecord[] = Object.freeze([]);
  /** 最近一次错误提示（文件错误、标定错误、重复裂纹等），不清空其他状态。 */
  error: string | null = null;

  /** 换入新的有效图片：清空全部旧状态（含整批记录），进入标定阶段。 */
  beginWithImage(): void {
    this.stage = 'calibrating';
    this.scalePoints = [];
    this.crackPoints = [];
    this.scaleLengthMm = null;
    this.ratioMmPerPx = null;
    this.resultMm = null;
    this.records = Object.freeze([]);
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

  /**
   * 测量阶段点取裂纹端点；两点齐备且不与已记录裂纹重复时计算结果并
   * 进入完成阶段。重复（端点完全相同，顺序相反也算）则停留测量阶段、
   * 清空本条已选点并提示，已有记录 / 比例 / 叠加线一律不变。
   */
  addCrackPoint(point: Point): void {
    if (this.stage !== 'measuring') return;
    this.crackPoints.push(point);
    if (this.crackPoints.length === 2) {
      const [a, b] = this.crackPoints;
      if (this.findDuplicateRecord(a, b) !== null) {
        this.crackPoints = [];
        this.error = SESSION_ERRORS.CRACK_SEGMENT_DUPLICATE;
        return;
      }
      const distance = euclideanDistance(a, b);
      const rawMm = computeCrackLengthMm(distance, this.ratioMmPerPx as number);
      this.resultMm = roundTo3Decimals(rawMm);
      this.stage = 'done';
    }
    this.error = null;
  }

  /** 查找端点与 a/b 完全相同的已记录裂纹（正向或反向），无则 null。 */
  private findDuplicateRecord(a: Point, b: Point): CrackRecord | null {
    for (const record of this.records) {
      const sameOrder = samePoint(record.start, a) && samePoint(record.end, b);
      const reverseOrder = samePoint(record.start, b) && samePoint(record.end, a);
      if (sameOrder || reverseOrder) return record;
    }
    return null;
  }

  /**
   * 记录当前裂纹并测下一条：把当前点位、毫米长度与顺序号追加到只读记录，
   * 清空当前点位 / 结果，回到测量阶段点取下一条，比例保持不变。
   * 仅完成阶段可调用，成功返回 true。
   */
  recordAndContinue(): boolean {
    if (this.stage !== 'done') return false;
    if (this.crackPoints.length !== 2 || this.resultMm === null) return false;
    const record: CrackRecord = Object.freeze({
      index: this.records.length + 1,
      start: Object.freeze({ ...this.crackPoints[0] }),
      end: Object.freeze({ ...this.crackPoints[1] }),
      resultMm: this.resultMm,
    });
    this.records = Object.freeze([...this.records, record]);
    this.crackPoints = [];
    this.resultMm = null;
    this.stage = 'measuring';
    this.error = null;
    return true;
  }

  /**
   * 重新测量裂纹：保留标尺标定与全部已记录裂纹，只清除尚未记录的
   * 当前这一条（点位与结果），回到测量阶段重新点取两端。
   */
  restartMeasurement(): void {
    if (this.stage !== 'measuring' && this.stage !== 'done') return;
    this.crackPoints = [];
    this.resultMm = null;
    this.stage = 'measuring';
    this.error = null;
  }

  /** 重新标定：保留已导入图片，清空标定、当前测量与整批记录，回到标定阶段。 */
  restartCalibration(): void {
    if (this.stage === 'idle') return;
    this.scalePoints = [];
    this.crackPoints = [];
    this.scaleLengthMm = null;
    this.ratioMmPerPx = null;
    this.resultMm = null;
    this.records = Object.freeze([]);
    this.stage = 'calibrating';
    this.error = null;
  }

  /** 记录文件错误：只提示，绝不清空当前图片、标定、结果或整批记录。 */
  reportFileError(message: string): void {
    this.error = message;
  }

  clearError(): void {
    this.error = null;
  }
}
