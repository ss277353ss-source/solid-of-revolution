/**
 * 旋转体的几何模型：半径函数、体积 / 表面积被积函数、微元切分。
 *
 * 约定：
 * - 水平轴 y = k：用圆盘 / 圆环法。截面垂直于 x 轴，
 *   半径取 |f(x) - k| 与 |g(x) - k|；若两条边界分居轴的两侧，
 *   截面是实心圆盘（内半径为 0）。
 * - 垂直轴 x = k：用柱壳法。壳的半径 |x - k|，高度 |f(x) - g(x)|。
 * - 表面积只统计曲线 f(x) 旋转生成的侧面（不含端面），这是教材标准口径。
 */
import type { AxisKind, MethodKind } from '../types'

export interface CurveInput {
  fn: (x: number) => number
  prime: (x: number) => number
}

export interface SolidSpec {
  axis: AxisKind
  k: number
  a: number
  b: number
  f: CurveInput
  g: CurveInput
}

export interface Radii {
  outer: number
  inner: number
}

export interface SolidModel {
  method: MethodKind
  /** 体积被积函数 */
  volume: (x: number) => number
  /** 表面积被积函数 */
  surface: (x: number) => number
  /** 该 x 处截面的外半径 */
  outerRadius: (x: number) => number
  /** 该 x 处截面的内半径 */
  innerRadius: (x: number) => number
  /** 柱壳法的壳高 */
  shellHeight: (x: number) => number
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value))
}

/** 计算水平轴旋转时某截面的内外半径 */
export function horizontalRadii(fValue: number, gValue: number, k: number): Radii {
  const distanceF = Math.abs(fValue - k)
  const distanceG = Math.abs(gValue - k)
  // 两条边界分居旋转轴两侧时，旋转出的截面是实心圆盘
  const straddles = (fValue - k) * (gValue - k) < 0
  const outer = Math.max(distanceF, distanceG)
  const inner = straddles ? 0 : Math.min(distanceF, distanceG)
  return { outer, inner }
}

/**
 * 端点保护：某些函数（如 sqrt(1-x^2)）在端点导数发散，
 * 直接求值会出现 0 × ∞ = NaN。此时向区间内部微移后再求值。
 */
export function guardBoundary(
  fn: (x: number) => number,
  a: number,
  b: number,
): (x: number) => number {
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  const span = hi - lo
  return (x: number): number => {
    const value = fn(x)
    if (Number.isFinite(value)) return value
    const nearLo = Math.abs(x - lo) <= span * 1e-12
    const nearHi = Math.abs(x - hi) <= span * 1e-12
    if (!nearLo && !nearHi) return value
    const direction = nearLo ? 1 : -1
    for (const relative of [1e-12, 1e-10, 1e-8, 1e-6]) {
      const candidate = clamp(x + direction * relative * span, lo, hi)
      const shifted = fn(candidate)
      if (Number.isFinite(shifted)) return shifted
    }
    return value
  }
}

/** 判断该采用哪种方法 */
export function detectMethod(spec: SolidSpec): MethodKind {
  if (spec.axis === 'vertical') return 'shell'

  const samples = 64
  let maxInner = 0
  for (let i = 0; i <= samples; i += 1) {
    const x = spec.a + ((spec.b - spec.a) * i) / samples
    const { inner } = horizontalRadii(spec.f.fn(x), spec.g.fn(x), spec.k)
    if (Number.isFinite(inner)) maxInner = Math.max(maxInner, inner)
  }

  const scale = Math.max(1, Math.abs(spec.b - spec.a))
  return maxInner > 1e-9 * scale ? 'washer' : 'disk'
}

/** 构造旋转体的被积函数 */
export function buildSolid(spec: SolidSpec): SolidModel {
  const { k, f, g } = spec
  const method = detectMethod(spec)

  const outerRadius = (x: number): number => {
    if (spec.axis === 'vertical') return Math.abs(x - k)
    return horizontalRadii(f.fn(x), g.fn(x), k).outer
  }

  const innerRadius = (x: number): number => {
    if (spec.axis === 'vertical') return 0
    return horizontalRadii(f.fn(x), g.fn(x), k).inner
  }

  const shellHeight = (x: number): number => {
    if (spec.axis === 'vertical') return Math.abs(f.fn(x) - g.fn(x))
    return 0
  }

  const rawVolume = (x: number): number => {
    if (spec.axis === 'vertical') {
      return 2 * Math.PI * Math.abs(x - k) * Math.abs(f.fn(x) - g.fn(x))
    }
    const { outer, inner } = horizontalRadii(f.fn(x), g.fn(x), k)
    return Math.PI * (outer * outer - inner * inner)
  }

  const rawSurface = (x: number): number => {
    if (spec.axis === 'vertical') {
      const radius = Math.abs(x - k)
      const slope = f.prime(x)
      return 2 * Math.PI * radius * Math.hypot(1, slope)
    }
    const radius = Math.abs(f.fn(x) - k)
    const slope = f.prime(x)
    return 2 * Math.PI * radius * Math.hypot(1, slope)
  }

  return {
    method,
    volume: guardBoundary(rawVolume, spec.a, spec.b),
    surface: guardBoundary(rawSurface, spec.a, spec.b),
    outerRadius,
    innerRadius,
    shellHeight,
  }
}

export type MicroElement =
  | {
      kind: 'washer'
      index: number
      x0: number
      x1: number
      center: number
      outer: number
      inner: number
    }
  | {
      kind: 'shell'
      index: number
      x0: number
      x1: number
      center: number
      radius: number
      height: number
      centerY: number
    }

/**
 * 把积分区间均分成 n 个微元，供 3D 中逐个绘制。
 * 圆盘 / 圆环的厚度是 dx，柱壳的厚度也是 dx。
 */
export function buildMicroElements(spec: SolidSpec, n: number): MicroElement[] {
  const count = Math.max(1, Math.round(n))
  const width = (spec.b - spec.a) / count
  const elements: MicroElement[] = []

  for (let index = 0; index < count; index += 1) {
    const x0 = spec.a + width * index
    const x1 = x0 + width
    const center = (x0 + x1) / 2

    if (spec.axis === 'vertical') {
      const fValue = spec.f.fn(center)
      const gValue = spec.g.fn(center)
      elements.push({
        kind: 'shell',
        index,
        x0,
        x1,
        center,
        radius: Math.abs(center - spec.k),
        height: Math.abs(fValue - gValue),
        centerY: (fValue + gValue) / 2,
      })
    } else {
      const { outer, inner } = horizontalRadii(
        spec.f.fn(center),
        spec.g.fn(center),
        spec.k,
      )
      elements.push({ kind: 'washer', index, x0, x1, center, outer, inner })
    }
  }

  return elements
}

export interface SceneExtent {
  center: [number, number, number]
  /** 用于取景的特征半径 */
  radius: number
}

/** 估算 3D 场景的包围盒，用于自动取景 */
export function sceneExtent(spec: SolidSpec): SceneExtent {
  const samples = 80
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  let maxRadius = 0

  for (let i = 0; i <= samples; i += 1) {
    const x = spec.a + ((spec.b - spec.a) * i) / samples
    const fValue = spec.f.fn(x)
    const gValue = spec.g.fn(x)
    if (Number.isFinite(fValue)) {
      minY = Math.min(minY, fValue)
      maxY = Math.max(maxY, fValue)
    }
    if (Number.isFinite(gValue)) {
      minY = Math.min(minY, gValue)
      maxY = Math.max(maxY, gValue)
    }
    if (spec.axis === 'horizontal') {
      const { outer } = horizontalRadii(fValue, gValue, spec.k)
      if (Number.isFinite(outer)) maxRadius = Math.max(maxRadius, outer)
    } else {
      maxRadius = Math.max(maxRadius, Math.abs(x - spec.k))
    }
  }

  if (!Number.isFinite(minY)) minY = -1
  if (!Number.isFinite(maxY)) maxY = 1

  if (spec.axis === 'horizontal') {
    const top = spec.k + maxRadius
    const bottom = spec.k - maxRadius
    return {
      center: [(spec.a + spec.b) / 2, (top + bottom) / 2, 0],
      radius: Math.max(maxRadius, Math.abs(spec.b - spec.a) / 2, 0.2),
    }
  }

  const left = spec.k - maxRadius
  const right = spec.k + maxRadius
  return {
    center: [(left + right) / 2, (minY + maxY) / 2, 0],
    radius: Math.max(maxRadius, (maxY - minY) / 2, 0.2),
  }
}
