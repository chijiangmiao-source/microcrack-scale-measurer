import { describe, expect, it } from 'vitest';
import {
  MAX_SCALE_LENGTH_MM,
  MIN_SCALE_LENGTH_MM,
  MeasurementSession,
  SESSION_ERRORS,
  type CrackRecord,
} from '../../src/lib/session';

function calibratedSession(): MeasurementSession {
  const s = new MeasurementSession();
  s.beginWithImage();
  s.addScalePoint({ x: 50, y: 50 });
  s.addScalePoint({ x: 250, y: 50 }); // 200 px
  expect(s.confirmScaleLength(10)).toBe(true); // 0.05 mm/px
  return s;
}

describe('MeasurementSession 阶段流转', () => {
  it('初始为 idle，导入有效图片后进入标定阶段', () => {
    const s = new MeasurementSession();
    expect(s.stage).toBe('idle');
    s.beginWithImage();
    expect(s.stage).toBe('calibrating');
    expect(s.scalePoints).toHaveLength(0);
  });

  it('完整流程：标定 → 测量 → 完成，结果按 3 位小数舍入', () => {
    const s = calibratedSession();
    expect(s.stage).toBe('measuring');
    expect(s.ratioMmPerPx).toBe(0.05);

    s.addCrackPoint({ x: 10, y: 200 });
    expect(s.stage).toBe('measuring');
    s.addCrackPoint({ x: 110, y: 200 }); // 100 px → 5 mm
    expect(s.stage).toBe('done');
    expect(s.resultMm).toBe(5);
  });

  it('结果恰半时向绝对值增大方向舍入', () => {
    const s = new MeasurementSession();
    s.beginWithImage();
    s.addScalePoint({ x: 0, y: 0 });
    s.addScalePoint({ x: 200, y: 0 }); // 200 px
    expect(s.confirmScaleLength(0.1)).toBe(true); // 0.0005 mm/px
    s.addCrackPoint({ x: 0, y: 0 });
    s.addCrackPoint({ x: 2469, y: 0 }); // 2469 × 0.0005 = 1.2345 → 1.235
    expect(s.resultMm).toBe(1.235);
  });

  it('非对应阶段的点击被忽略', () => {
    const s = new MeasurementSession();
    s.addScalePoint({ x: 1, y: 1 }); // idle 阶段无效
    expect(s.scalePoints).toHaveLength(0);
    s.beginWithImage();
    s.addCrackPoint({ x: 1, y: 1 }); // 标定阶段不接收裂纹点
    expect(s.crackPoints).toHaveLength(0);
  });
});

describe('标定阶段的约束', () => {
  it('标尺两点重合：停留在标定阶段并提示', () => {
    const s = new MeasurementSession();
    s.beginWithImage();
    s.addScalePoint({ x: 100, y: 100 });
    s.addScalePoint({ x: 100, y: 100 });
    expect(s.stage).toBe('calibrating');
    expect(s.error).toBe(SESSION_ERRORS.SCALE_POINTS_COINCIDE);
    expect(s.scalePoints).toHaveLength(0); // 重新点取
  });

  it('长度越界（过小 / 过大 / 非数）：停留在标定阶段且保留标尺点', () => {
    for (const bad of [0, 0.001, -1, 100.01, 101, Number.NaN, Number.POSITIVE_INFINITY]) {
      const s = new MeasurementSession();
      s.beginWithImage();
      s.addScalePoint({ x: 0, y: 0 });
      s.addScalePoint({ x: 100, y: 0 });
      expect(s.confirmScaleLength(bad)).toBe(false);
      expect(s.stage).toBe('calibrating');
      expect(s.error).toBe(SESSION_ERRORS.SCALE_LENGTH_OUT_OF_RANGE);
      expect(s.scalePoints).toHaveLength(2); // 保留已点标尺
      expect(s.ratioMmPerPx).toBeNull();
    }
  });

  it('长度边界值 0.01 与 100 mm 均可接受', () => {
    for (const ok of [MIN_SCALE_LENGTH_MM, MAX_SCALE_LENGTH_MM]) {
      const s = new MeasurementSession();
      s.beginWithImage();
      s.addScalePoint({ x: 0, y: 0 });
      s.addScalePoint({ x: 100, y: 0 });
      expect(s.confirmScaleLength(ok)).toBe(true);
      expect(s.stage).toBe('measuring');
    }
  });

  it('未点齐两点就确认长度：停留在标定阶段', () => {
    const s = new MeasurementSession();
    s.beginWithImage();
    s.addScalePoint({ x: 0, y: 0 });
    expect(s.confirmScaleLength(10)).toBe(false);
    expect(s.stage).toBe('calibrating');
    expect(s.error).toBe(SESSION_ERRORS.SCALE_POINTS_REQUIRED);
  });

  it('点满两点后再点会重新开始选取标尺', () => {
    const s = new MeasurementSession();
    s.beginWithImage();
    s.addScalePoint({ x: 0, y: 0 });
    s.addScalePoint({ x: 100, y: 0 });
    s.addScalePoint({ x: 5, y: 5 });
    expect(s.scalePoints).toEqual([{ x: 5, y: 5 }]);
  });
});

describe('状态保留与重置', () => {
  it('文件错误只提示，不清空图片标定与结果', () => {
    const s = calibratedSession();
    s.addCrackPoint({ x: 0, y: 0 });
    s.addCrackPoint({ x: 100, y: 0 });
    expect(s.stage).toBe('done');

    s.reportFileError('文件超过 10 MiB 大小限制');
    expect(s.error).toBe('文件超过 10 MiB 大小限制');
    expect(s.stage).toBe('done');
    expect(s.ratioMmPerPx).toBe(0.05);
    expect(s.resultMm).toBe(5);
    expect(s.scalePoints).toHaveLength(2);
    expect(s.crackPoints).toHaveLength(2);
  });

  it('换入新有效图片才清空旧状态', () => {
    const s = calibratedSession();
    s.addCrackPoint({ x: 0, y: 0 });
    s.addCrackPoint({ x: 100, y: 0 });
    s.beginWithImage();
    expect(s.stage).toBe('calibrating');
    expect(s.ratioMmPerPx).toBeNull();
    expect(s.resultMm).toBeNull();
    expect(s.scalePoints).toHaveLength(0);
    expect(s.crackPoints).toHaveLength(0);
  });

  it('重新测量裂纹：保留标定，清空裂纹与结果', () => {
    const s = calibratedSession();
    s.addCrackPoint({ x: 0, y: 0 });
    s.addCrackPoint({ x: 100, y: 0 });
    s.restartMeasurement();
    expect(s.stage).toBe('measuring');
    expect(s.ratioMmPerPx).toBe(0.05);
    expect(s.resultMm).toBeNull();
    expect(s.crackPoints).toHaveLength(0);
  });

  it('重新标定：回到标定阶段，比例与结果清空', () => {
    const s = calibratedSession();
    s.addCrackPoint({ x: 0, y: 0 });
    s.addCrackPoint({ x: 100, y: 0 });
    s.restartCalibration();
    expect(s.stage).toBe('calibrating');
    expect(s.ratioMmPerPx).toBeNull();
    expect(s.resultMm).toBeNull();
    expect(s.scalePoints).toHaveLength(0);
  });
});

describe('同图连续测量多条裂纹', () => {
  it('记录并测下一条：写入顺序记录、保留比例与点位、进入下一条选取', () => {
    const s = calibratedSession(); // 0.05 mm/px

    s.addCrackPoint({ x: 10, y: 200 });
    s.addCrackPoint({ x: 110, y: 200 }); // 100 px → 5 mm
    expect(s.stage).toBe('done');
    expect(s.resultMm).toBe(5);

    expect(s.recordAndContinue()).toBe(true);
    expect(s.stage).toBe('measuring');
    expect(s.crackPoints).toHaveLength(0);
    expect(s.resultMm).toBeNull();
    // 比例继续复用，无需重新标定
    expect(s.ratioMmPerPx).toBe(0.05);
    expect(s.records).toHaveLength(1);
    expect(s.records[0]).toEqual({
      index: 1,
      start: { x: 10, y: 200 },
      end: { x: 110, y: 200 },
      resultMm: 5,
    });
  });

  it('连续多条：继续测量复用原比例，记录按顺序排列且只读', () => {
    const s = calibratedSession(); // 0.05 mm/px

    // 第 1 条：100 px → 5 mm
    s.addCrackPoint({ x: 10, y: 200 });
    s.addCrackPoint({ x: 110, y: 200 });
    s.recordAndContinue();

    // 第 2 条：200 px → 10 mm（比例不变）
    s.addCrackPoint({ x: 0, y: 0 });
    s.addCrackPoint({ x: 200, y: 0 });
    expect(s.stage).toBe('done');
    expect(s.resultMm).toBe(10);
    s.recordAndContinue();

    // 第 3 条：50 px → 2.5 mm
    s.addCrackPoint({ x: 300, y: 300 });
    s.addCrackPoint({ x: 350, y: 300 });
    expect(s.resultMm).toBe(2.5);

    expect(s.records).toHaveLength(2);
    expect(s.records.map((r) => [r.index, r.resultMm])).toEqual([
      [1, 5],
      [2, 10],
    ]);

    // 记录为只读视图：外部不得就地改写状态机内部数据
    const frozen = s.records;
    expect(() => {
      (frozen as CrackRecord[]).push({
        index: 99,
        start: { x: 0, y: 0 },
        end: { x: 1, y: 1 },
        resultMm: 0,
      });
    }).toThrow();
  });

  it('recordAndContinue 仅在完成阶段可调用', () => {
    const s = calibratedSession();
    expect(s.recordAndContinue()).toBe(false); // measuring 且未选两点
    s.addCrackPoint({ x: 0, y: 0 });
    expect(s.recordAndContinue()).toBe(false); // 仅一点
    expect(s.records).toHaveLength(0);
  });

  it('与已记录端点完全相同（含反向点取）：停留测量阶段并提示重复', () => {
    const s = calibratedSession();
    s.addCrackPoint({ x: 10, y: 200 });
    s.addCrackPoint({ x: 110, y: 200 });
    s.recordAndContinue();

    // 正向重复
    s.addCrackPoint({ x: 10, y: 200 });
    s.addCrackPoint({ x: 110, y: 200 });
    expect(s.stage).toBe('measuring');
    expect(s.error).toBe(SESSION_ERRORS.CRACK_SEGMENT_DUPLICATE);
    expect(s.crackPoints).toHaveLength(0); // 本条重来
    expect(s.records).toHaveLength(1);
    expect(s.ratioMmPerPx).toBe(0.05);

    // 反向点取同样判重
    s.addCrackPoint({ x: 110, y: 200 });
    s.addCrackPoint({ x: 10, y: 200 });
    expect(s.stage).toBe('measuring');
    expect(s.error).toBe(SESSION_ERRORS.CRACK_SEGMENT_DUPLICATE);
    expect(s.crackPoints).toHaveLength(0);
    expect(s.records).toHaveLength(1);
  });

  it('判重后改点可顺利得到新结果，已有记录不变', () => {
    const s = calibratedSession();
    s.addCrackPoint({ x: 10, y: 200 });
    s.addCrackPoint({ x: 110, y: 200 }); // 5 mm
    s.recordAndContinue();

    // 先触发重复
    s.addCrackPoint({ x: 110, y: 200 });
    s.addCrackPoint({ x: 10, y: 200 });
    expect(s.stage).toBe('measuring');

    // 改点后得到全新一条：100 px 竖向 → 5 mm
    s.addCrackPoint({ x: 300, y: 100 });
    expect(s.stage).toBe('measuring');
    s.addCrackPoint({ x: 300, y: 200 });
    expect(s.stage).toBe('done');
    expect(s.resultMm).toBe(5);
    expect(s.records).toHaveLength(1);
    expect(s.records[0].resultMm).toBe(5);

    s.recordAndContinue();
    expect(s.records).toHaveLength(2);
    expect(s.records[1].start).toEqual({ x: 300, y: 100 });
    expect(s.records[1].end).toEqual({ x: 300, y: 200 });
  });

  it('重新测量只清除尚未记录的一条，已记录裂纹与比例保留', () => {
    const s = calibratedSession();
    s.addCrackPoint({ x: 0, y: 0 });
    s.addCrackPoint({ x: 100, y: 0 }); // 5 mm
    s.recordAndContinue();

    // 第 2 条只点了起点就点重新测量
    s.addCrackPoint({ x: 5, y: 5 });
    expect(s.crackPoints).toHaveLength(1);
    s.restartMeasurement();
    expect(s.stage).toBe('measuring');
    expect(s.crackPoints).toHaveLength(0);
    expect(s.resultMm).toBeNull();
    expect(s.records).toHaveLength(1);
    expect(s.records[0].resultMm).toBe(5);
    expect(s.ratioMmPerPx).toBe(0.05);

    // 完成阶段（两点已选但未记录）重新测量同样只弃当前一条
    s.addCrackPoint({ x: 0, y: 0 });
    s.addCrackPoint({ x: 200, y: 0 });
    expect(s.stage).toBe('done');
    s.restartMeasurement();
    expect(s.stage).toBe('measuring');
    expect(s.crackPoints).toHaveLength(0);
    expect(s.resultMm).toBeNull();
    expect(s.records).toHaveLength(1);
  });

  it('重新标定清空整批记录', () => {
    const s = calibratedSession();
    s.addCrackPoint({ x: 0, y: 0 });
    s.addCrackPoint({ x: 100, y: 0 });
    s.recordAndContinue();
    s.addCrackPoint({ x: 0, y: 0 });
    s.addCrackPoint({ x: 200, y: 0 });
    s.recordAndContinue();
    expect(s.records).toHaveLength(2);

    s.restartCalibration();
    expect(s.stage).toBe('calibrating');
    expect(s.records).toHaveLength(0);
    expect(s.ratioMmPerPx).toBeNull();
    expect(s.crackPoints).toHaveLength(0);
  });

  it('换入有效新图清空整批记录；文件错误保留整批记录与当前结果', () => {
    const s = calibratedSession();
    s.addCrackPoint({ x: 0, y: 0 });
    s.addCrackPoint({ x: 100, y: 0 });
    s.recordAndContinue();
    s.addCrackPoint({ x: 0, y: 0 });
    s.addCrackPoint({ x: 200, y: 0 });
    expect(s.stage).toBe('done');
    expect(s.resultMm).toBe(10);

    // 无效文件：记录、比例、当前结果一律保留
    s.reportFileError('图片已损坏或无法解码');
    expect(s.records).toHaveLength(1);
    expect(s.ratioMmPerPx).toBe(0.05);
    expect(s.resultMm).toBe(10);
    expect(s.stage).toBe('done');

    // 换入有效新图：整批清空
    s.beginWithImage();
    expect(s.records).toHaveLength(0);
    expect(s.resultMm).toBeNull();
    expect(s.ratioMmPerPx).toBeNull();
    expect(s.stage).toBe('calibrating');
  });
});
