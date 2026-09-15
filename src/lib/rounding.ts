/**
 * 十进制舍入：保留指定小数位，恰逢半个最小单位时向绝对值增大方向舍入
 * （round half away from zero，即中文习惯“四舍五入”对负数同样按绝对值处理）。
 *
 * JavaScript 的 Math.round 对负数是向 +∞ 取整（Math.round(-2.5) === -2），
 * 不满足“向绝对值增大方向舍入”，因此这里自行实现。
 *
 * 由于二进制浮点无法精确表示部分十进制小数（如 1.2345 实际存储为
 * 1.23449999999999993…），在判断“恰好半个单位”时引入微小容差，
 * 使十进制意义上的恰半值能被正确识别。
 */

const HALF_EPSILON = 1e-9;

export function roundHalfAwayFromZero(value: number, decimals: number): number {
  if (!Number.isFinite(value)) {
    throw new Error('无法舍入非有限数值');
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 12) {
    throw new Error('小数位数非法');
  }
  const factor = 10 ** decimals;
  const scaled = value * factor;
  const sign = scaled < 0 ? -1 : 1;
  const abs = Math.abs(scaled);
  const floor = Math.floor(abs);
  const fraction = abs - floor;

  let roundedAbs: number;
  if (fraction > 0.5 + HALF_EPSILON) {
    roundedAbs = floor + 1;
  } else if (fraction < 0.5 - HALF_EPSILON) {
    roundedAbs = floor;
  } else {
    // 恰好（或在浮点误差内视为恰好）半个最小单位 → 向绝对值增大方向进位
    roundedAbs = floor + 1;
  }

  const result = (sign * roundedAbs) / factor;
  // 归一化 -0，避免显示 "-0.000"
  return result === 0 ? 0 : result;
}

/** 按需求：结果保留 3 位小数，恰半向绝对值增大方向舍入。 */
export function roundTo3Decimals(value: number): number {
  return roundHalfAwayFromZero(value, 3);
}

/** 毫米结果的唯一展示格式：固定 3 位小数 + 单位。 */
export function formatMm(value: number): string {
  return `${roundTo3Decimals(value).toFixed(3)} mm`;
}

/** 标尺比例展示：最多 8 位有效数字，去掉多余的尾随零。 */
export function formatRatio(ratioMmPerPx: number): string {
  return `${String(Number(ratioMmPerPx.toPrecision(8)))} mm/px`;
}
