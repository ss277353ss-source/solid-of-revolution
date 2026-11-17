/**
 * 几何分析工具：零点、断点、单调性、采样。
 * 这些函数只做数值探测，不做积分。
 */

export interface SamplePoint {
  x: number
  y: number
}

/** 在 [a, b] 上均匀采样，y 可能是 NaN（用于绘图中断） */
export function sampleCurve(
  fn: (x: number) => number,
  a: number,
  b: number,
  samples = 600,
): SamplePoint[] {
  const points: SamplePoint[] = []
  const count = Math.max(2, samples)
  for (let i = 0; i <= count; i += 1) {
    const x = a + ((b - a) * i) / count
    let y: number
    try {
      y = fn(x)
    } catch {
      y = Number.NaN
    }
    points.push({ x, y })
  }
  return points
}

function dedupe(values: number[], scale: number): number[] {
  const sorted = [...values].sort((p, q) => p - q)
  const tolerance = Math.max(1e-9, Math.abs(scale) * 1e-6)
  const result: number[] = []
  for (const value of sorted) {
    if (result.length === 0 || Math.abs(value - result[result.length - 1]) > tolerance) {
      result.push(value)
    }
  }
  return result
}

/**
 * 求 fn(x) = target 在 (a, b) 内的所有根。
 * 先粗采样找变号区间，再二分细化；端点恰好为根时也会收集。
 */
export function findRoots(
  fn: (x: number) => number,
  a: number,
  b: number,
  target = 0,
  samples = 800,
): number[] {
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  const roots: number[] = []
  const step = (hi - lo) / samples

  let previousX = lo
  let previousValue = fn(lo) - target
  if (Number.isFinite(previousValue) && Math.abs(previousValue) < 1e-14) {
    roots.push(lo)
  }

  for (let i = 1; i <= samples; i += 1) {
    const x = lo + step * i
    const value = fn(x) - target
    if (!Number.isFinite(value) || !Number.isFinite(previousValue)) {
      previousX = x
      previousValue = value
      continue
    }
    if (Math.abs(value) < 1e-14) {
      roots.push(x)
    } else if (previousValue * value < 0) {
      // 用二分把根定位到机器精度
      let left = previousX
      let right = x
      let fLeft = previousValue
      for (let k = 0; k < 80; k += 1) {
        const mid = (left + right) / 2
        const fMid = fn(mid) - target
        if (!Number.isFinite(fMid)) break
        if (fMid === 0) {
          left = mid
          right = mid
          break
        }
        if (fLeft * fMid < 0) {
          right = mid
        } else {
          left = mid
          fLeft = fMid
        }
      }
      roots.push((left + right) / 2)
    }
    previousX = x
    previousValue = value
  }

  // 端点本身为根的情况
  const endValue = fn(hi) - target
  if (Number.isFinite(endValue) && Math.abs(endValue) < 1e-14) roots.push(hi)

  return dedupe(roots, hi - lo).filter((x) => x > lo + 1e-12 && x < hi - 1e-12)
}

/**
 * 寻找函数在 [a, b] 上的断点（无定义点或极点）。
 * 返回按位置排序的断点坐标，用于在图上标红并提醒用户调整区间。
 */
export function findBreakpoints(
  fn: (x: number) => number,
  a: number,
  b: number,
  samples = 320,
): number[] {
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  const breaks: number[] = []
  const step = (hi - lo) / samples

  const values: number[] = []
  for (let i = 0; i <= samples; i += 1) {
    values.push(fn(lo + step * i))
  }

  for (let i = 0; i <= samples; i += 1) {
    const x = lo + step * i
    const value = values[i]
    if (!Number.isFinite(value)) {
      breaks.push(x)
    } else if (Math.abs(value) > 1e6) {
      breaks.push(x)
    }
  }

  // 相邻两点异号且幅值都较大：疑似极点（例如 1/x 跨 0，不一定采样到 0 点）
  for (let i = 0; i < samples; i += 1) {
    const v0 = values[i]
    const v1 = values[i + 1]
    if (!Number.isFinite(v0) || !Number.isFinite(v1)) continue
    if (v0 * v1 < 0 && Math.min(Math.abs(v0), Math.abs(v1)) > 50) {
      let left = lo + step * i
      let right = lo + step * (i + 1)
      let fLeft = v0
      let peak = 0
      let peakX = (left + right) / 2
      for (let k = 0; k < 100; k += 1) {
        const mid = (left + right) / 2
        const fMid = fn(mid)
        if (!Number.isFinite(fMid) || Math.abs(fMid) > 1e8) {
          peakX = mid
          peak = Number.POSITIVE_INFINITY
          break
        }
        if (Math.abs(fMid) > peak) {
          peak = Math.abs(fMid)
          peakX = mid
        }
        if (fLeft * fMid < 0) {
          right = mid
        } else {
          left = mid
          fLeft = fMid
        }
      }
      if (peak > 1e5) breaks.push(peakX)
    }
  }

  // 检查每个子区间的中点，捕捉未被采样点命中的无定义点
  for (let i = 0; i < samples; i += 1) {
    const mid = lo + step * (i + 0.5)
    if (!Number.isFinite(fn(mid))) breaks.push(mid)
  }

  return dedupe(breaks, hi - lo).filter((x) => x >= lo && x <= hi)
}

export interface MonotonicityInfo {
  /** 是否单调 */
  monotonic: boolean
  /** 整体走向：1 递增，-1 递减，0 无法判断 */
  direction: 1 | -1 | 0
  /** 走向变化的次数 */
  turns: number
}

/** 判断函数在区间上是否单调（用中心差分近似导数） */
export function analyzeMonotonicity(
  fn: (x: number) => number,
  a: number,
  b: number,
  samples = 240,
): MonotonicityInfo {
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  const h = (hi - lo) / samples
  const slopes: number[] = []

  for (let i = 0; i < samples; i += 1) {
    const left = lo + h * i
    const right = lo + h * (i + 1)
    const fLeft = fn(left)
    const fRight = fn(right)
    if (!Number.isFinite(fLeft) || !Number.isFinite(fRight)) continue
    slopes.push((fRight - fLeft) / h)
  }

  if (slopes.length === 0) return { monotonic: true, direction: 0, turns: 0 }

  const scale = Math.max(...slopes.map((value) => Math.abs(value)), 1e-9)
  const epsilon = scale * 1e-6
  let turns = 0
  let lastSign = 0
  for (const slope of slopes) {
    if (Math.abs(slope) <= epsilon) continue
    const sign = slope > 0 ? 1 : -1
    if (lastSign !== 0 && sign !== lastSign) turns += 1
    lastSign = sign
  }

  return {
    monotonic: turns === 0,
    direction: lastSign === 0 ? 0 : (lastSign as 1 | -1),
    turns,
  }
}
