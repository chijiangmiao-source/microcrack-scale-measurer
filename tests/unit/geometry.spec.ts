import { describe, expect, it } from 'vitest';
import {
  computeCrackLengthMm,
  computeScaleRatio,
  euclideanDistance,
} from '../../src/lib/geometry';

describe('euclideanDistance 欧氏像素距离', () => {
  it('计算 3-4-5 直角三角形斜边', () => {
    expect(euclideanDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('水平线段距离等于横坐标差', () => {
    expect(euclideanDistance({ x: 50, y: 50 }, { x: 250, y: 50 })).toBe(200);
  });

  it('垂直线段距离等于纵坐标差', () => {
    expect(euclideanDistance({ x: 10, y: 200 }, { x: 10, y: 100 })).toBe(100);
  });

  it('重合两点距离为 0', () => {
    expect(euclideanDistance({ x: 7, y: 9 }, { x: 7, y: 9 })).toBe(0);
  });

  it('距离与点的顺序无关且非负', () => {
    const a = { x: -3, y: 8 };
    const b = { x: 5, y: -4 };
    const d = euclideanDistance(a, b);
    expect(d).toBeGreaterThan(0);
    expect(euclideanDistance(b, a)).toBe(d);
  });

  it('对角线距离', () => {
    expect(euclideanDistance({ x: 0, y: 0 }, { x: 100, y: 100 })).toBeCloseTo(Math.SQRT2 * 100, 10);
  });
});

describe('computeScaleRatio 标尺比例 = 实际长度 / 像素距离', () => {
  it('10 mm 对应 200 px → 0.05 mm/px', () => {
    expect(computeScaleRatio(10, 200)).toBe(0.05);
  });

  it('0.01 mm 对应 40 px → 0.00025 mm/px', () => {
    expect(computeScaleRatio(0.01, 40)).toBe(0.00025);
  });

  it('100 mm 对应 3 px', () => {
    expect(computeScaleRatio(100, 3)).toBeCloseTo(100 / 3, 12);
  });

  it('像素距离为 0（两点重合）时抛错', () => {
    expect(() => computeScaleRatio(10, 0)).toThrow();
  });

  it('非法长度或负距离时抛错', () => {
    expect(() => computeScaleRatio(0, 100)).toThrow();
    expect(() => computeScaleRatio(Number.NaN, 100)).toThrow();
    expect(() => computeScaleRatio(10, -5)).toThrow();
  });
});

describe('computeCrackLengthMm 裂纹长度 = 像素距离 × 比例', () => {
  it('100 px × 0.05 mm/px = 5 mm', () => {
    expect(computeCrackLengthMm(100, 0.05)).toBe(5);
  });

  it('0 px 裂纹长度为 0', () => {
    expect(computeCrackLengthMm(0, 0.05)).toBe(0);
  });

  it('与比例函数组合：标尺 10mm/200px，裂纹 141.421…px', () => {
    const ratio = computeScaleRatio(10, 200);
    const length = computeCrackLengthMm(Math.SQRT2 * 100, ratio);
    expect(length).toBeCloseTo(Math.SQRT2 * 5, 10);
  });

  it('非法输入抛错', () => {
    expect(() => computeCrackLengthMm(-1, 0.05)).toThrow();
    expect(() => computeCrackLengthMm(10, 0)).toThrow();
    expect(() => computeCrackLengthMm(10, Number.NaN)).toThrow();
  });
});
