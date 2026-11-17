import { describe, expect, it } from 'vitest'
import { analyze } from './analyze'
import type { Config } from '../types'

const base: Config = {
  fExpr: 'x^2',
  gExpr: '0',
  axis: 'horizontal',
  k: 0,
  a: 0,
  b: 1,
  mode: 'volume',
  tolerance: 1e-10,
}

describe('analyze 边界情况', () => {
  it('a > b 自动交换并给出提示', () => {
    const analysis = analyze({ ...base, a: 1, b: 0 })
    expect(analysis.ok).toBe(true)
    expect(analysis.warnings.some((warning) => warning.message.includes('自动交换'))).toBe(true)
  })

  it('曲线在轴下方时给出绝对值提示', () => {
    const analysis = analyze({ ...base, fExpr: '-x^2' })
    expect(analysis.ok).toBe(true)
    expect(analysis.warnings.some((warning) => warning.message.includes('下方'))).toBe(true)
    // 体积按平方计算，结果与 x^2 相同
    expect(analysis.numeric?.value).toBeCloseTo(Math.PI / 5, 9)
  })

  it('曲线穿越旋转轴时自动分段', () => {
    const analysis = analyze({ ...base, fExpr: 'x^2-0.25', a: -1, b: 1 })
    expect(analysis.ok).toBe(true)
    expect(analysis.warnings.some((warning) => warning.message.includes('穿越'))).toBe(true)
  })

  it('1/x 跨过 0 时报告断点而不是白屏', () => {
    const analysis = analyze({ ...base, fExpr: '1/x', a: -1, b: 1 })
    expect(analysis.ok).toBe(false)
    expect(analysis.errors.length).toBeGreaterThan(0)
    expect(analysis.plot?.breaks.length ?? 0).toBeGreaterThan(0)
  })

  it('非法表达式返回带位置的错误', () => {
    const analysis = analyze({ ...base, fExpr: 'x^' })
    expect(analysis.ok).toBe(false)
    expect(analysis.errors[0].message).toContain('解析失败')
  })

  it('sin() 返回错误且不生成几何模型，避免 3D 收到无效点', () => {
    const analysis = analyze({ ...base, fExpr: 'sin()' })
    expect(analysis.ok).toBe(false)
    expect(analysis.model).toBeNull()
    expect(analysis.errors.some((error) => error.message.includes('缺少参数'))).toBe(true)
  })

  it('绕垂直轴且非单调时给出警告', () => {
    const analysis = analyze({
      ...base,
      axis: 'vertical',
      fExpr: 'sin(x)',
      a: 0,
      b: 6,
    })
    expect(analysis.ok).toBe(true)
    expect(analysis.warnings.some((warning) => warning.message.includes('非单调'))).toBe(true)
  })

  it('区间长度为零时给出错误', () => {
    const analysis = analyze({ ...base, a: 1, b: 1 })
    expect(analysis.ok).toBe(false)
  })

  it('推导链包含六步且带解析解', () => {
    const analysis = analyze(base)
    expect(analysis.ok).toBe(true)
    expect(analysis.steps).toHaveLength(6)
    expect(analysis.steps[5].tex).toContain('frac')
    expect(analysis.numeric?.exactValue).toBeCloseTo(Math.PI / 5, 9)
  })

  it('表面积模式下给出 f\'(x) 的符号结果', () => {
    const analysis = analyze({ ...base, mode: 'surface' })
    expect(analysis.ok).toBe(true)
    expect(analysis.steps[2].tex).toContain('2')
    expect(analysis.model?.derivativeIsSymbolic).toBe(true)
  })
})

describe('analyze 三角函数', () => {
  it('y = sin x 在 [0, π] 上体积为 π²/2，并给出解析解', () => {
    const analysis = analyze({ ...base, fExpr: 'sin(x)', a: 0, b: Math.PI })
    expect(analysis.ok).toBe(true)
    expect(analysis.numeric?.value).toBeCloseTo((Math.PI * Math.PI) / 2, 9)
    expect(analysis.numeric?.exactValue).toBeCloseTo((Math.PI * Math.PI) / 2, 9)
    expect(analysis.numeric?.exactTex).toBeTruthy()
    expect(analysis.steps[2].tex).toContain('cos')
  })

  it('y = sin x 的表面积为 2π(√2 + asinh 1)', () => {
    const analysis = analyze({ ...base, fExpr: 'sin(x)', a: 0, b: Math.PI, mode: 'surface' })
    expect(analysis.ok).toBe(true)
    const expected = 2 * Math.PI * (Math.SQRT2 + Math.asinh(1))
    expect(analysis.numeric?.value).toBeCloseTo(expected, 8)
  })

  it('y = cos x 在 [0, π/2] 上体积为 π²/4', () => {
    const analysis = analyze({ ...base, fExpr: 'cos(x)', a: 0, b: Math.PI / 2 })
    expect(analysis.ok).toBe(true)
    expect(analysis.numeric?.value).toBeCloseTo((Math.PI * Math.PI) / 4, 9)
    expect(analysis.numeric?.exactValue).toBeCloseTo((Math.PI * Math.PI) / 4, 9)
  })

  it('支持 sin(2x)、tan(x) 与 sin(pi*x) 等写法', () => {
    const doubled = analyze({ ...base, fExpr: 'sin(2*x)', a: 0, b: Math.PI / 2 })
    expect(doubled.numeric?.value).toBeCloseTo((Math.PI * Math.PI) / 4, 9)

    const tangent = analyze({ ...base, fExpr: 'tan(x)', a: 0, b: Math.PI / 4 })
    expect(tangent.numeric?.value).toBeCloseTo(Math.PI - (Math.PI * Math.PI) / 4, 9)

    const scaled = analyze({ ...base, fExpr: 'sin(pi*x)', a: 0, b: 1 })
    expect(scaled.numeric?.value).toBeCloseTo(Math.PI / 2, 8)
  })

  it('正弦绕 y = −1 时使用圆环法并得到 4π + π²/2', () => {
    const analysis = analyze({ ...base, fExpr: 'sin(x)', a: 0, b: Math.PI, k: -1 })
    expect(analysis.ok).toBe(true)
    expect(analysis.model?.methodLabel).toBe('圆环法')
    expect(analysis.numeric?.value).toBeCloseTo(4 * Math.PI + (Math.PI * Math.PI) / 2, 8)
  })
})
