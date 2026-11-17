import { describe, expect, it } from 'vitest'
import { adaptiveSimpson } from './integrate'
import {
  buildMicroElements,
  buildSolid,
  detectMethod,
  horizontalRadii,
  type SolidSpec,
} from './solids'

const identity = (x: number) => x
const constant = () => 0
const zeroPrime = () => 0

function makeSpec(overrides: Partial<SolidSpec>): SolidSpec {
  return {
    axis: 'horizontal',
    k: 0,
    a: 0,
    b: 1,
    f: { fn: (x: number) => x * x, prime: (x: number) => 2 * x },
    g: { fn: constant, prime: zeroPrime },
    ...overrides,
  }
}

describe('horizontalRadii', () => {
  it('两条边界都在轴上方时使用较小的作为内半径', () => {
    expect(horizontalRadii(4, 1, 0)).toEqual({ outer: 4, inner: 1 })
  })

  it('两条边界分居轴两侧时截面是实心圆盘', () => {
    expect(horizontalRadii(2, -1, 0)).toEqual({ outer: 2, inner: 0 })
  })

  it('偏移轴下半径按到轴的距离计算', () => {
    // f = 0、g = 1、轴 y = −1：两条边界都在轴上方，内半径为 1
    expect(horizontalRadii(0, 1, -1)).toEqual({ outer: 2, inner: 1 })
  })

  it('边界跨越偏移轴时内半径为 0', () => {
    expect(horizontalRadii(0, -2, -1)).toEqual({ outer: 1, inner: 0 })
  })
})

describe('detectMethod', () => {
  it('下边界落在轴上时是圆盘法', () => {
    expect(detectMethod(makeSpec({}))).toBe('disk')
  })

  it('下边界不在轴上时是圆环法', () => {
    const spec = makeSpec({
      k: -1,
      g: { fn: () => 0, prime: zeroPrime },
    })
    expect(detectMethod(spec)).toBe('washer')
  })

  it('垂直轴一律使用柱壳法', () => {
    expect(detectMethod(makeSpec({ axis: 'vertical' }))).toBe('shell')
  })
})

describe('buildSolid 体积', () => {
  it('y = x² 绕 x 轴的体积为 π/5', () => {
    const solid = buildSolid(makeSpec({}))
    const result = adaptiveSimpson(solid.volume, 0, 1, { tolerance: 1e-12 })
    expect(result.value).toBeCloseTo(Math.PI / 5, 10)
  })

  it('y = x² 绕 y = −1 的体积为 13π/15', () => {
    const solid = buildSolid(makeSpec({ k: -1 }))
    const result = adaptiveSimpson(solid.volume, 0, 1, { tolerance: 1e-12 })
    expect(result.value).toBeCloseTo((13 * Math.PI) / 15, 10)
  })

  it('y = x² 绕 y 轴的柱壳体积为 π/2', () => {
    const solid = buildSolid(makeSpec({ axis: 'vertical' }))
    const result = adaptiveSimpson(solid.volume, 0, 1, { tolerance: 1e-12 })
    expect(result.value).toBeCloseTo(Math.PI / 2, 10)
  })
})

describe('buildSolid 表面积', () => {
  it('y = x 绕 x 轴的表面积为 π√2', () => {
    const solid = buildSolid(
      makeSpec({
        f: { fn: identity, prime: () => 1 },
      }),
    )
    const result = adaptiveSimpson(solid.surface, 0, 1, { tolerance: 1e-12 })
    expect(result.value).toBeCloseTo(Math.PI * Math.SQRT2, 10)
  })
})

describe('buildMicroElements', () => {
  it('圆盘法生成 n 个微元且厚度总和等于区间长度', () => {
    const elements = buildMicroElements(makeSpec({}), 10)
    expect(elements).toHaveLength(10)
    const totalWidth = elements.reduce((sum, element) => sum + (element.x1 - element.x0), 0)
    expect(totalWidth).toBeCloseTo(1, 12)
    expect(elements[0].kind).toBe('washer')
  })

  it('柱壳法记录壳半径与壳高', () => {
    const elements = buildMicroElements(makeSpec({ axis: 'vertical' }), 5)
    expect(elements).toHaveLength(5)
    const first = elements[0]
    if (first.kind !== 'shell') throw new Error('应为柱壳')
    expect(first.radius).toBeGreaterThan(0)
    expect(first.height).toBeGreaterThan(0)
  })
})

describe('端点保护', () => {
  it('sqrt(1-x²) 在端点处的表面积被积函数取有限值', () => {
    const solid = buildSolid(
      makeSpec({
        a: -1,
        b: 1,
        f: {
          fn: (x: number) => Math.sqrt(Math.max(0, 1 - x * x)),
          prime: (x: number) => -x / Math.sqrt(Math.max(0, 1 - x * x)),
        },
      }),
    )
    expect(Number.isFinite(solid.surface(-1))).toBe(true)
    expect(Number.isFinite(solid.surface(1))).toBe(true)
    expect(solid.surface(0)).toBeCloseTo(2 * Math.PI, 8)
  })
})
