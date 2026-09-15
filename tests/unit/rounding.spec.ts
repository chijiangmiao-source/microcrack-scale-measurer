import { describe, expect, it } from 'vitest';
import { formatMm, formatRatio, roundHalfAwayFromZero, roundTo3Decimals } from '../../src/lib/rounding';

describe('roundTo3Decimals 保留 3 位小数（恰半向绝对值增大方向）', () => {
  it('常规四舍五入', () => {
    expect(roundTo3Decimals(1.2344)).toBe(1.234);
    expect(roundTo3Decimals(1.2346)).toBe(1.235);
    expect(roundTo3Decimals(12.3456789)).toBe(12.346);
  });

  it('恰逢半个最小单位时向绝对值增大方向进位', () => {
    expect(roundTo3Decimals(1.2345)).toBe(1.235);
    expect(roundTo3Decimals(0.0005)).toBe(0.001);
    expect(roundTo3Decimals(2.0005)).toBe(2.001);
    expect(roundTo3Decimals(999.9995)).toBe(1000);
  });

  it('负数同样向绝对值增大方向进位（而非向 +∞）', () => {
    expect(roundTo3Decimals(-1.2345)).toBe(-1.235);
    expect(roundTo3Decimals(-0.0005)).toBe(-0.001);
    expect(roundTo3Decimals(-1.2344)).toBe(-1.234);
  });

  it('恰半边界两侧的值区分正确', () => {
    expect(roundTo3Decimals(1.23449)).toBe(1.234);
    expect(roundTo3Decimals(1.23451)).toBe(1.235);
  });

  it('整数与零', () => {
    expect(roundTo3Decimals(5)).toBe(5);
    expect(roundTo3Decimals(0)).toBe(0);
    expect(roundTo3Decimals(-0.0001)).toBe(0);
    expect(Object.is(roundTo3Decimals(-0.0001), -0)).toBe(false);
  });

  it('已是 3 位小数的值保持不变', () => {
    expect(roundTo3Decimals(1.005)).toBe(1.005);
    expect(roundTo3Decimals(0.001)).toBe(0.001);
  });

  it('非有限数值抛错', () => {
    expect(() => roundTo3Decimals(Number.NaN)).toThrow();
    expect(() => roundTo3Decimals(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe('roundHalfAwayFromZero 通用位数', () => {
  it('0 位小数：2.5 → 3，-2.5 → -3', () => {
    expect(roundHalfAwayFromZero(2.5, 0)).toBe(3);
    expect(roundHalfAwayFromZero(-2.5, 0)).toBe(-3);
    expect(roundHalfAwayFromZero(2.4, 0)).toBe(2);
  });

  it('1 位小数恰半', () => {
    expect(roundHalfAwayFromZero(0.05, 1)).toBe(0.1);
    expect(roundHalfAwayFromZero(-0.05, 1)).toBe(-0.1);
  });
});

describe('formatMm 唯一毫米结果格式', () => {
  it('固定 3 位小数并带单位', () => {
    expect(formatMm(5)).toBe('5.000 mm');
    expect(formatMm(1.2345)).toBe('1.235 mm');
    expect(formatMm(0)).toBe('0.000 mm');
  });
});

describe('formatRatio 标尺比例格式', () => {
  it('去除尾随零', () => {
    expect(formatRatio(0.05)).toBe('0.05 mm/px');
    expect(formatRatio(2.5)).toBe('2.5 mm/px');
  });

  it('保留足够有效数字', () => {
    expect(formatRatio(1 / 3)).toBe('0.33333333 mm/px');
  });
});
