/**
 * 自适应 Simpson 数值积分。
 *
 * 算法：对区间 [a, b] 取 Simpson 公式 S(a,b)，再把区间二分，
 * 比较 S(a,b) 与 S(a,m)+S(m,b) 的差 delta；
 * Simpson 的误差主项约为 |delta| / 15，若该估计超过本层的容限则继续二分。
 * 最终误差估计为所有叶子区间 |delta| / 15 之和。
 */

export interface IntegrationOptions {
  /** 目标精度（绝对误差容限），默认 1e-9 */
  tolerance?: number
  /** 最大递归深度，默认 28 */
  maxDepth?: number
}

export interface IntegrationResult {
  /** 积分值 */
  value: number
  /** 误差估计 */
  errorEstimate: number
  /** 函数求值次数 */
  evaluations: number
  /** 叶子区间数量（即最终使用的 Simpson 子区间个数） */
  intervals: number
  /** 实际达到的最大递归深度 */
  maxDepth: number
}

/** 被积函数在积分节点上取到 NaN / Infinity 时抛出 */
export class NonFiniteIntegrandError extends Error {
  readonly x: number

  constructor(x: number) {
    super(`被积函数在 x = ${x} 处取值无意义（NaN 或无穷大）`)
    this.name = 'NonFiniteIntegrandError'
    this.x = x
  }
}

function simpson(a: number, b: number, fa: number, fm: number, fb: number): number {
  return ((b - a) / 6) * (fa + 4 * fm + fb)
}

interface RecursionState {
  error: number
  intervals: number
  depth: number
}

/**
 * 对 f 在 [a, b] 上做自适应 Simpson 积分。
 * a > b 时自动交换上下限并返回相反数。
 */
export function adaptiveSimpson(
  f: (x: number) => number,
  a: number,
  b: number,
  options: IntegrationOptions = {},
): IntegrationResult {
  const tolerance = options.tolerance ?? 1e-9
  const maxDepth = options.maxDepth ?? 28

  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    throw new NonFiniteIntegrandError(Number.isFinite(lo) ? hi : lo)
  }
  if (hi - lo === 0) {
    return { value: 0, errorEstimate: 0, evaluations: 0, intervals: 0, maxDepth: 0 }
  }

  let evaluations = 0
  const evaluate = (x: number): number => {
    const value = f(x)
    evaluations += 1
    if (!Number.isFinite(value)) throw new NonFiniteIntegrandError(x)
    return value
  }

  const state: RecursionState = { error: 0, intervals: 0, depth: 0 }

  const recurse = (
    left: number,
    right: number,
    fLeft: number,
    fMid: number,
    fRight: number,
    whole: number,
    depth: number,
    localTolerance: number,
  ): number => {
    const mid = (left + right) / 2
    const quarterLeft = (left + mid) / 2
    const quarterRight = (mid + right) / 2
    const fQuarterLeft = evaluate(quarterLeft)
    const fQuarterRight = evaluate(quarterRight)

    const leftPart = simpson(left, mid, fLeft, fQuarterLeft, fMid)
    const rightPart = simpson(mid, right, fMid, fQuarterRight, fRight)
    const delta = leftPart + rightPart - whole

    state.depth = Math.max(state.depth, depth + 1)

    if (depth + 1 >= maxDepth || Math.abs(delta) <= 15 * localTolerance) {
      state.intervals += 1
      state.error += Math.abs(delta) / 15
      return leftPart + rightPart + delta / 15
    }

    return (
      recurse(left, mid, fLeft, fQuarterLeft, fMid, leftPart, depth + 1, localTolerance / 2) +
      recurse(mid, right, fMid, fQuarterRight, fRight, rightPart, depth + 1, localTolerance / 2)
    )
  }

  const fA = evaluate(lo)
  const fB = evaluate(hi)
  const fM = evaluate((lo + hi) / 2)
  const whole = simpson(lo, hi, fA, fM, fB)

  const magnitude = recurse(lo, hi, fA, fM, fB, whole, 0, tolerance)
  const sign = b < a ? -1 : 1

  return {
    value: sign * magnitude,
    errorEstimate: state.error,
    evaluations,
    intervals: state.intervals,
    maxDepth: state.depth,
  }
}

/**
 * 在若干切分好的子区间上分别积分并汇总。
 * 用于在处理零点穿越 / 断点时保证每段都是光滑的。
 */
export function adaptiveSimpsonPiecewise(
  f: (x: number) => number,
  pieces: Array<[number, number]>,
  options: IntegrationOptions = {},
): IntegrationResult {
  const total: IntegrationResult = {
    value: 0,
    errorEstimate: 0,
    evaluations: 0,
    intervals: 0,
    maxDepth: 0,
  }
  if (pieces.length === 0) return total

  // 把总容限平均分配到各段，保证整体误差不超过目标精度
  const pieceTolerance = (options.tolerance ?? 1e-9) / pieces.length
  for (const [from, to] of pieces) {
    const result = adaptiveSimpson(f, from, to, { ...options, tolerance: pieceTolerance })
    total.value += result.value
    total.errorEstimate += result.errorEstimate
    total.evaluations += result.evaluations
    total.intervals += result.intervals
    total.maxDepth = Math.max(total.maxDepth, result.maxDepth)
  }
  return total
}
