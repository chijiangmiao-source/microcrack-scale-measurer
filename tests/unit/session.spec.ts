import { describe, expect, it } from 'vitest';
import {
  MAX_SCALE_LENGTH_MM,
  MIN_SCALE_LENGTH_MM,
  MeasurementSession,
  SESSION_ERRORS,
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
