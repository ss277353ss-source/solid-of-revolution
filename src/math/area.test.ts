import { describe, expect, it } from 'vitest'
import { areaWithXAxis, areaWithYAxis } from './area'
import { derivativeOf, parseCurve } from './parse'

function curve(expr: string) {
  const parsed = parseCurve(expr)
  if (!parsed.ok) throw new Error(parsed.message)
  const derivative = derivativeOf(parsed.node)
  if (!derivative) throw new Error(`无法对 ${expr} 求导`)
  return { fn: parsed.fn, prime: derivative.fn }
}

describe('areaWithXAxis', () => {
  it('y = x² 在 [0,1] 上与 x 轴围成的面积为 1/3', () => {
    const { fn } = curve('x^2')
    expect(areaWithXAxis(fn, 0, 1)).toBeCloseTo(1 / 3, 10)
  })

  it('y = x 在 [−1,1] 上取几何面积 1（负半轴不抵消）', () => {
    const { fn } = curve('x')
    expect(areaWithXAxis(fn, -1, 1)).toBeCloseTo(1, 10)
  })

  it('a > b 时自动交换上下限', () => {
    const { fn } = curve('x^2')
    expect(areaWithXAxis(fn, 1, 0)).toBeCloseTo(1 / 3, 10)
  })
})

describe('areaWithYAxis', () => {
  it('y = x² 在 [0,1] 上与 y 轴围成的面积为 2/3', () => {
    const result = areaWithYAxis(curve('x^2').fn, curve('x^2').prime, 0, 1)
    expect(result.value).toBeCloseTo(2 / 3, 10)
    expect(result.monotone).toBe(true)
    expect(result.segments).toHaveLength(1)
  })

  it('y = √x 在 [0,1] 上与 y 轴围成的面积为 1/3（端点导数发散仍可算）', () => {
    const { fn, prime } = curve('sqrt(x)')
    const result = areaWithYAxis(fn, prime, 0, 1)
    expect(result.value).toBeCloseTo(1 / 3, 10)
  })

  it('y = 1/x 在 [1,2] 上与 y 轴围成的面积为 ln2', () => {
    const { fn, prime } = curve('1/x')
    const result = areaWithYAxis(fn, prime, 1, 2)
    expect(result.value).toBeCloseTo(Math.log(2), 10)
  })

  it('y = x² 在 [−1,1] 上非单调，按两个单调段累加为 4/3', () => {
    const { fn, prime } = curve('x^2')
    const result = areaWithYAxis(fn, prime, -1, 1)
    expect(result.monotone).toBe(false)
    expect(result.segments).toHaveLength(2)
    expect(result.value).toBeCloseTo(4 / 3, 10)
  })
})
