/**
 * 2D 面积：主函数图像与坐标轴围成的区域面积。
 *
 * - 与 x 轴：A = ∫ₐᵇ |f(x)| dx，取绝对值得到几何面积，恒为非负。
 * - 与 y 轴：把曲线按单调段切开，逐段计算 |∫ x dy|。
 *   利用分部积分
 *     ∫_{x0}^{x1} x f'(x) dx = x1·f(x1) − x0·f(x0) − ∫_{x0}^{x1} f(x) dx，
 *   只用到 f 本身，避开 sqrt 等函数在端点导数发散的问题。
 */
import { findRoots } from './geometry'
import { adaptiveSimpson } from './integrate'

export interface YAxisAreaResult {
  value: number
  /** 单调段，绘图时按段分块填充阴影 */
  segments: Array<[number, number]>
  /** f 在整个区间上是否单调 */
  monotone: boolean
}

/** 主函数与 x 轴在 [a, b] 上围成的面积 */
export function areaWithXAxis(
  fn: (x: number) => number,
  a: number,
  b: number,
  tolerance = 1e-10,
): number {
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  return adaptiveSimpson((x) => Math.abs(fn(x)), lo, hi, { tolerance }).value
}

/** 主函数与 y 轴围成的面积（非单调时按单调段累加） */
export function areaWithYAxis(
  fn: (x: number) => number,
  prime: (x: number) => number,
  a: number,
  b: number,
  tolerance = 1e-10,
): YAxisAreaResult {
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)

  // 极值点把区间切成单调段
  let critical: number[] = []
  try {
    critical = findRoots(prime, lo, hi, 0)
  } catch {
    critical = []
  }

  const cuts = [lo, ...critical.filter((x) => x > lo + 1e-12 && x < hi - 1e-12), hi]
  const segments: Array<[number, number]> = []
  for (let i = 0; i < cuts.length - 1; i += 1) {
    if (cuts[i + 1] - cuts[i] > 1e-12) segments.push([cuts[i], cuts[i + 1]])
  }

  let value = 0
  for (const [x0, x1] of segments) {
    const integral = adaptiveSimpson(fn, x0, x1, { tolerance }).value
    const strip = x1 * fn(x1) - x0 * fn(x0) - integral
    value += Math.abs(strip)
  }

  return { value, segments, monotone: segments.length === 1 }
}
