import { describe, expect, it } from 'vitest'
import { symbolicDefiniteIntegral } from './symbolic'

describe('symbolicDefiniteIntegral', () => {
  it('∫₀¹ πx⁴ dx = π/5', () => {
    const result = symbolicDefiniteIntegral('pi*x^4', 0, 1)
    expect(result).not.toBeNull()
    if (!result) return
    expect(result.exactValue).toBeCloseTo(Math.PI / 5, 10)
    expect(result.exactTex).toContain('pi')
  })

  it('∫₀¹ π(x²+1)² − π dx = 13π/15', () => {
    const result = symbolicDefiniteIntegral('pi*((x^2+1)^2-1)', 0, 1)
    expect(result).not.toBeNull()
    if (!result) return
    expect(result.exactValue).toBeCloseTo((13 * Math.PI) / 15, 10)
  })

  it('∫₁² π/x² dx = π/2', () => {
    const result = symbolicDefiniteIntegral('pi/x^2', 1, 2)
    expect(result).not.toBeNull()
    if (!result) return
    expect(result.exactValue).toBeCloseTo(Math.PI / 2, 10)
  })

  it('无法解析的积分返回 null 而不是抛异常', () => {
    const result = symbolicDefiniteIntegral('2*pi*x^2*sqrt(1+4*x^2)', 0, 1)
    expect(result).toBeNull()
  })

  it('不支持的函数返回 null', () => {
    const result = symbolicDefiniteIntegral('sin(x^2)', 0, 1)
    expect(result).toBeNull()
  })
})

describe('symbolicDefiniteIntegral 三角函数', () => {
  it('∫₀^π π·sin²x dx = π²/2', () => {
    const result = symbolicDefiniteIntegral('pi*sin(x)^2', 0, Math.PI)
    expect(result).not.toBeNull()
    if (!result) return
    expect(result.exactValue).toBeCloseTo((Math.PI * Math.PI) / 2, 9)
    expect(result.exactTex).toContain('pi')
  })

  it('∫₀^{π/2} π·cos²x dx = π²/4', () => {
    const result = symbolicDefiniteIntegral('pi*cos(x)^2', 0, Math.PI / 2)
    expect(result).not.toBeNull()
    if (!result) return
    expect(result.exactValue).toBeCloseTo((Math.PI * Math.PI) / 4, 9)
  })

  it('∫₀^{π/4} π·tan²x dx = π − π²/4', () => {
    const result = symbolicDefiniteIntegral('pi*tan(x)^2', 0, Math.PI / 4)
    expect(result).not.toBeNull()
    if (!result) return
    expect(result.exactValue).toBeCloseTo(Math.PI - (Math.PI * Math.PI) / 4, 9)
  })

  it('支持线性内层 sin(2x)、sin(πx)', () => {
    const doubled = symbolicDefiniteIntegral('pi*sin(2*x)^2', 0, Math.PI / 2)
    expect(doubled?.exactValue).toBeCloseTo((Math.PI * Math.PI) / 4, 8)

    const scaled = symbolicDefiniteIntegral('pi*sin(pi*x)^2', 0, 1)
    expect(scaled?.exactValue).toBeCloseTo(Math.PI / 2, 8)
  })

  it('展开 (sin x + 1)² 后能求出原函数', () => {
    const result = symbolicDefiniteIntegral('pi*((sin(x)+1)^2-1)', 0, Math.PI)
    expect(result).not.toBeNull()
    if (!result) return
    expect(result.exactValue).toBeCloseTo(4 * Math.PI + (Math.PI * Math.PI) / 2, 8)
  })
})
