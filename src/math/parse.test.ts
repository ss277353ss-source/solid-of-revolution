import { describe, expect, it } from 'vitest'
import {
  derivativeOf,
  expressionToTex,
  numericDerivative,
  parseCurve,
  simplifyToString,
  stripPrefix,
} from './parse'

describe('parseCurve', () => {
  it('解析 x^2 并求值', () => {
    const parsed = parseCurve('x^2')
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.fn(3)).toBeCloseTo(9, 12)
    expect(parsed.tex).toContain('x')
    expect(parsed.symbols).toContain('x')
  })

  it('支持 sin / exp / sqrt / pi 等写法', () => {
    const parsed = parseCurve('sin(pi*x) + sqrt(1+x) + exp(x)')
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.fn(0)).toBeCloseTo(2, 12)
  })

  it('自动去掉 y = 前缀', () => {
    expect(stripPrefix('y = x^2')).toBe('x^2')
    expect(stripPrefix('f(x)=sin(x)')).toBe('sin(x)')
  })

  it('空表达式给出错误提示', () => {
    const parsed = parseCurve('   ')
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.message).toContain('为空')
  })

  it('语法错误返回位置而不是抛异常', () => {
    const parsed = parseCurve('x^')
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.message).toContain('解析失败')
  })

  it('未知变量被拒绝', () => {
    const parsed = parseCurve('t^2')
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.message).toContain('t')
  })

  it('复数结果视为无定义', () => {
    const parsed = parseCurve('sqrt(x)')
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(Number.isNaN(parsed.fn(-1))).toBe(true)
  })

  it('无参函数 sin() 给出可照抄的提示', () => {
    const parsed = parseCurve('sin()')
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.message).toContain('缺少参数')
    expect(parsed.message).toContain('sin(x)')
  })

  it('只写函数名 sin 时提示补上参数', () => {
    const parsed = parseCurve('sin')
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.message).toContain('函数名')
  })
})

describe('derivativeOf', () => {
  it('对 x^3 求导得到 3x²', () => {
    const parsed = parseCurve('x^3')
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const derivative = derivativeOf(parsed.node)
    expect(derivative).not.toBeNull()
    if (!derivative) return
    expect(derivative.fn(2)).toBeCloseTo(12, 10)
  })

  it('对 sqrt(1-x^2) 求导', () => {
    const parsed = parseCurve('sqrt(1-x^2)')
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const derivative = derivativeOf(parsed.node)
    expect(derivative).not.toBeNull()
    if (!derivative) return
    expect(derivative.fn(0.5)).toBeCloseTo(-0.5 / Math.sqrt(0.75), 8)
  })
})

describe('数值工具', () => {
  it('中心差分与解析导数一致', () => {
    const value = numericDerivative((x) => x * x * x, 2)
    expect(value).toBeCloseTo(12, 6)
  })

  it('表达式转 LaTeX', () => {
    expect(expressionToTex('x^2')).toContain('x')
  })

  it('化简 pi*x^4', () => {
    const simplified = simplifyToString('pi*x^4')
    expect(simplified.text.length).toBeGreaterThan(0)
  })
})
