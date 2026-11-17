import { describe, expect, it } from 'vitest'
import {
  NonFiniteIntegrandError,
  adaptiveSimpson,
  adaptiveSimpsonPiecewise,
} from './integrate'

describe('adaptiveSimpson', () => {
  it('精确积分多项式：∫₀¹ x² dx = 1/3', () => {
    const result = adaptiveSimpson((x) => x * x, 0, 1, { tolerance: 1e-12 })
    expect(result.value).toBeCloseTo(1 / 3, 12)
    expect(result.evaluations).toBeGreaterThan(0)
    expect(result.intervals).toBeGreaterThan(0)
  })

  it('积分 sin 在 [0, π] 上等于 2', () => {
    const result = adaptiveSimpson((x) => Math.sin(x), 0, Math.PI, { tolerance: 1e-12 })
    expect(result.value).toBeCloseTo(2, 11)
  })

  it('误差估计小于 1e-8', () => {
    const result = adaptiveSimpson((x) => Math.exp(-x * x), 0, 2, { tolerance: 1e-10 })
    expect(result.errorEstimate).toBeLessThan(1e-8)
  })

  it('常函数的积分等于 c·(b−a)', () => {
    const result = adaptiveSimpson(() => 3, -2, 5)
    expect(result.value).toBeCloseTo(21, 12)
    expect(result.intervals).toBe(1)
  })

  it('a > b 时返回负值', () => {
    const forward = adaptiveSimpson((x) => x, 0, 2)
    const backward = adaptiveSimpson((x) => x, 2, 0)
    expect(backward.value).toBeCloseTo(-forward.value, 12)
  })

  it('空区间返回 0', () => {
    const result = adaptiveSimpson((x) => x, 1, 1)
    expect(result.value).toBe(0)
    expect(result.intervals).toBe(0)
  })

  it('被积函数出现 NaN 时抛出 NonFiniteIntegrandError', () => {
    expect(() => adaptiveSimpson((x) => (x === 0 ? Number.NaN : 1 / x), -1, 1)).toThrow(
      NonFiniteIntegrandError,
    )
  })

  it('对带尖点的 |x| 仍能收敛', () => {
    const result = adaptiveSimpson((x) => Math.abs(x), -1, 1, { tolerance: 1e-10 })
    expect(result.value).toBeCloseTo(1, 9)
  })
})

describe('adaptiveSimpsonPiecewise', () => {
  it('分段积分之和等于整体积分', () => {
    const fn = (x: number) => Math.sin(x) * Math.sin(x)
    const whole = adaptiveSimpson(fn, 0, Math.PI, { tolerance: 1e-11 })
    const pieces = adaptiveSimpsonPiecewise(fn, [
      [0, Math.PI / 2],
      [Math.PI / 2, Math.PI],
    ], { tolerance: 1e-11 })
    expect(pieces.value).toBeCloseTo(whole.value, 10)
    expect(pieces.intervals).toBeGreaterThanOrEqual(2)
  })
})
