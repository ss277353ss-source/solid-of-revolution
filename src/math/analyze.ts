/**
 * 分析层：把用户的配置变成「可直接渲染的一切」——
 * 数值结果、推导步骤、提示信息、2D 采样数据、3D 几何模型。
 * 所有异常都在这里被转换成界面上的错误提示，绝不向上抛。
 */
import type { Config, DerivationStep, MethodKind, WarningItem } from '../types'
import { NonFiniteIntegrandError, adaptiveSimpsonPiecewise } from './integrate'
import type { IntegrationResult } from './integrate'
import {
  derivativeOf,
  expressionToTex,
  math,
  numericDerivative,
  parseCurve,
  simplifyToString,
  type ParsedCurve,
} from './parse'
import { analyzeMonotonicity, findBreakpoints, findRoots, sampleCurve, type SamplePoint } from './geometry'
import {
  buildSolid,
  sceneExtent,
  type CurveInput,
  type SceneExtent,
  type SolidModel,
  type SolidSpec,
} from './solids'
import { symbolicDefiniteIntegral } from './symbolic'

export interface CurveErrorItem {
  label: string
  message: string
  source: string
  position?: number
}

export interface AnalysisModel {
  spec: SolidSpec
  solid: SolidModel
  fTex: string
  gTex: string
  fSource: string
  gSource: string
  fPrimeTex: string | null
  fPrimeSource: string | null
  derivativeIsSymbolic: boolean
  method: MethodKind
  methodLabel: string
  methodReason: string
  extent: SceneExtent
}

export interface NumericSummary {
  value: number
  errorEstimate: number
  evaluations: number
  intervals: number
  maxDepth: number
  intervalLength: number
  maxIntegrand: number
  exactTex: string | null
  exactValue: number | null
  /** 实际使用的容限 */
  tolerance: number
}

export interface PlotData {
  domain: [number, number]
  f: SamplePoint[]
  g: SamplePoint[]
  /** 旋转轴的位置（水平轴时是 y 值，垂直轴时是 x 值） */
  axisValue: number
  /** 无定义 / 发散的断点 */
  breaks: number[]
  /** 与旋转轴的交点 */
  roots: number[]
  /** 积分区间（用于在图上画端点手柄） */
  interval: [number, number]
  axis: 'horizontal' | 'vertical'
}

export interface Analysis {
  ok: boolean
  errors: CurveErrorItem[]
  warnings: WarningItem[]
  model: AnalysisModel | null
  steps: DerivationStep[]
  numeric: NumericSummary | null
  plot: PlotData | null
  methodLabel: string
}

const METHOD_LABEL: Record<MethodKind, string> = {
  disk: '圆盘法',
  washer: '圆环法',
  shell: '柱壳法',
}

/** 数字转 LaTeX 友好的字符串（最多保留 6 位小数） */
export function numberToTex(value: number): string {
  if (!Number.isFinite(value)) return '\\text{未定义}'
  if (Number.isInteger(value)) return String(value)
  const fixed = value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
  return fixed
}

/** 用于界面提示的数字格式 */
export function formatNumber(value: number, digits = 4): string {
  if (!Number.isFinite(value)) return '—'
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '')
}

function buildMethodReason(method: MethodKind, config: Config): string {
  if (method === 'shell') {
    return `旋转轴是竖直线 x = ${formatNumber(config.k)}，把区域沿 x 方向切成竖条，每条竖条绕轴旋转后是一个空心圆柱壳，所以用柱壳法。`
  }
  if (method === 'washer') {
    return `两条边界都在旋转轴同一侧，且下边界不在轴上，于是每个垂直于 x 轴的截面都是「外圆减内圆」的圆环，所以用圆环法。`
  }
  return `旋转区域的边界与旋转轴之间没有空心部分，每个垂直于 x 轴的截面都是实心圆盘，所以用圆盘法。`
}

function buildPlot(
  f: ParsedCurve,
  g: ParsedCurve,
  a: number,
  b: number,
  k: number,
  axis: 'horizontal' | 'vertical',
  breaks: number[],
  roots: number[],
): PlotData {
  const span = b - a
  const domain: [number, number] = [a - span * 0.18, b + span * 0.18]
  return {
    domain,
    f: sampleCurve(f.fn, domain[0], domain[1], 700),
    g: sampleCurve(g.fn, domain[0], domain[1], 700),
    axisValue: k,
    breaks,
    roots,
    interval: [a, b],
    axis,
  }
}

/** 选中曲线的原文（用于构造符号积分表达式） */
function buildIntegrandSource(
  config: Config,
  method: MethodKind,
  fSource: string,
  gSource: string,
  fPrimeSource: string | null,
  outerSource: string,
  innerSource: string,
): string {
  const k = `(${config.k})`
  const f = `(${fSource})`
  const g = `(${gSource})`
  const fp = `(${fPrimeSource ?? '0'})`

  if (config.mode === 'volume') {
    if (method === 'shell') return `2*pi*abs(x-${k})*abs(${f}-${g})`
    if (method === 'washer') {
      return `pi*(((${outerSource})-${k})^2-((${innerSource})-${k})^2)`
    }
    return `pi*(((${outerSource})-${k})^2)`
  }

  if (config.axis === 'vertical') return `2*pi*abs(x-${k})*sqrt(1+${fp}^2)`
  return `2*pi*abs(${f}-${k})*sqrt(1+${fp}^2)`
}

/** 主入口 */
export function analyze(config: Config): Analysis {
  const warnings: WarningItem[] = []
  const errors: CurveErrorItem[] = []
  const steps: DerivationStep[] = []

  const f = parseCurve(config.fExpr)
  if (!f.ok) {
    errors.push({ label: 'f(x)', message: f.message, source: f.source, position: f.position })
  }
  const g = parseCurve(config.gExpr)
  if (!g.ok) {
    errors.push({ label: 'g(x)', message: g.message, source: g.source, position: g.position })
  }
  if (!f.ok || !g.ok) {
    return { ok: false, errors, warnings, model: null, steps, numeric: null, plot: null, methodLabel: '' }
  }

  let a = config.a
  let b = config.b

  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    errors.push({
      label: '区间',
      message: '积分上下限必须是有限实数',
      source: `${config.a}, ${config.b}`,
    })
    return { ok: false, errors, warnings, model: null, steps, numeric: null, plot: null, methodLabel: '' }
  }

  if (a > b) {
    const swapped = a
    a = b
    b = swapped
    warnings.push({ level: 'info', message: `上下限 a > b，已自动交换为 [${formatNumber(a)}, ${formatNumber(b)}]。` })
  }

  if (a === b) {
    errors.push({ label: '区间', message: '积分区间长度为 0，请让 a 与 b 不相等', source: `${a}, ${b}` })
    return { ok: false, errors, warnings, model: null, steps, numeric: null, plot: null, methodLabel: '' }
  }

  // ---------- 求导 ----------
  const derivative = derivativeOf(f.node)
  const fPrimeSource = derivative ? derivative.text : null
  const fPrimeFn = derivative ? derivative.fn : (x: number) => numericDerivative(f.fn, x)
  const gDerivative = derivativeOf(g.node)
  const gPrimeFn = gDerivative ? gDerivative.fn : (x: number) => numericDerivative(g.fn, x)

  if (!derivative) {
    warnings.push({
      level: 'info',
      message: 'math.js 无法给出 f(x) 的符号导数，表面积改用中心差分数值求导。',
    })
  }

  const fInput: CurveInput = { fn: f.fn, prime: fPrimeFn }
  const gInput: CurveInput = { fn: g.fn, prime: gPrimeFn }

  const spec: SolidSpec = { axis: config.axis, k: config.k, a, b, f: fInput, g: gInput }
  const solid = buildSolid(spec)
  const method = solid.method
  const methodLabel = METHOD_LABEL[method]
  const methodReason = buildMethodReason(method, config)
  const extent = sceneExtent(spec)

  // ---------- 断点 ----------
  const breakCandidates = [
    ...findBreakpoints(f.fn, a, b),
    ...findBreakpoints(g.fn, a, b),
  ].filter((x) => x >= a - 1e-12 && x <= b + 1e-12)
  const breaks = [...new Set(breakCandidates.map((x) => Number(x.toPrecision(12))))].sort((p, q) => p - q)

  // ---------- 与轴的交点 ----------
  const rootsF = config.axis === 'horizontal' ? findRoots(f.fn, a, b, config.k) : []
  const rootsG =
    config.axis === 'horizontal' && g.source.trim() !== String(config.k)
      ? findRoots(g.fn, a, b, config.k)
      : []

  const plot = buildPlot(f, g, a, b, config.k, config.axis, breaks, rootsF)

  if (breaks.length > 0) {
    const list = breaks.slice(0, 4).map((x) => formatNumber(x, 6)).join('、')
    errors.push({
      label: '函数',
      message: `函数在 x ≈ ${list} 处无定义或发散（图中已标红），无法在该区间上积分。请调整上限 a、下限 b 或更换函数。`,
      source: `${f.source}`,
    })

    // 整段区间都取不到有限值时（例如 sqrt(x) 取 [−1, −0.5]），不返回几何模型，
    // 避免给 3D 场景传一串 NaN 点；场景会显示"暂时无法绘制立体"的提示。
    const hasFiniteValue = sampleCurve(f.fn, a, b, 64).some((point) => Number.isFinite(point.y))

    return {
      ok: false,
      errors,
      warnings,
      model: hasFiniteValue
        ? {
            spec,
            solid,
            fTex: f.tex,
            gTex: g.tex,
            fSource: f.source,
            gSource: g.source,
            fPrimeTex: derivative ? derivative.simplifiedTex : null,
            fPrimeSource,
            derivativeIsSymbolic: Boolean(derivative),
            method,
            methodLabel,
            methodReason,
            extent,
          }
        : null,
      steps,
      numeric: null,
      plot,
      methodLabel,
    }
  }

  // ---------- 提示信息 ----------
  const degenerateG = sampleAbsDistance(g.fn, a, b, config.k) < 1e-9
  if (config.axis === 'horizontal') {
    const below = sampleMin(f.fn, a, b) - config.k
    if (below < -1e-9) {
      warnings.push({
        level: 'info',
        message: `曲线在部分区间位于旋转轴 y = ${formatNumber(config.k)} 下方，体积按半径 |f(x) − k| 的平方计算，结果依然正确。`,
      })
    }
    if (rootsF.length > 0) {
      const list = rootsF.map((x) => formatNumber(x, 6)).join('、')
      warnings.push({
        level: 'warn',
        message: `曲线在 x = ${list} 处穿越旋转轴，已在零点处把积分区间自动切成多段分别积分。`,
      })
    }
    if (!degenerateG && hasStraddle(f.fn, g.fn, a, b, config.k)) {
      warnings.push({
        level: 'warn',
        message: `旋转轴 y = ${formatNumber(config.k)} 落在旋转区域内部（两条边界分居轴的两侧），截面按实心圆盘处理，请确认这符合你的理解。`,
      })
    }
  } else {
    if (config.k > a && config.k < b) {
      warnings.push({
        level: 'warn',
        message: `旋转轴 x = ${formatNumber(config.k)} 落在积分区间内部，左右两侧的柱壳会相互重叠，体积按代数叠加计算。`,
      })
    }
    const monotonic = analyzeMonotonicity(f.fn, a, b)
    if (!monotonic.monotonic) {
      warnings.push({
        level: 'warn',
        message: '该区间内曲线非单调，柱壳法的结果可能不直观：不同 x 处的壳会占据同一片空间。',
      })
    }
  }

  // ---------- 分段 ----------
  const splitPoints = new Set<number>()
  if (config.axis === 'horizontal') {
    rootsF.forEach((x) => splitPoints.add(x))
    rootsG.forEach((x) => splitPoints.add(x))
  } else {
    if (config.k > a && config.k < b) splitPoints.add(config.k)
    if (config.mode === 'volume') {
      findRoots((x) => f.fn(x) - g.fn(x), a, b, 0).forEach((x) => splitPoints.add(x))
    }
    rootsF.forEach((x) => splitPoints.add(x))
  }

  const cuts = [a, ...Array.from(splitPoints).filter((x) => x > a + 1e-12 && x < b - 1e-12).sort((p, q) => p - q), b]
  const pieces: Array<[number, number]> = []
  for (let i = 0; i < cuts.length - 1; i += 1) pieces.push([cuts[i], cuts[i + 1]])

  // ---------- 积分 ----------
  const integrand = config.mode === 'volume' ? solid.volume : solid.surface
  let integration: IntegrationResult
  try {
    integration = adaptiveSimpsonPiecewise(integrand, pieces, {
      tolerance: config.tolerance,
      maxDepth: 28,
    })
  } catch (error) {
    if (error instanceof NonFiniteIntegrandError) {
      errors.push({
        label: '积分',
        message: `积分过程中在 x ≈ ${formatNumber(error.x, 6)} 处遇到了 NaN 或无穷大，请调整区间。`,
        source: f.source,
      })
    } else {
      errors.push({
        label: '积分',
        message: `数值积分失败：${error instanceof Error ? error.message : String(error)}`,
        source: f.source,
      })
    }
    return {
      ok: false,
      errors,
      warnings,
      model: {
        spec,
        solid,
        fTex: f.tex,
        gTex: g.tex,
        fSource: f.source,
        gSource: g.source,
        fPrimeTex: derivative ? derivative.simplifiedTex : null,
        fPrimeSource,
        derivativeIsSymbolic: Boolean(derivative),
        method,
        methodLabel,
        methodReason,
        extent,
      },
      steps,
      numeric: null,
      plot,
      methodLabel,
    }
  }

  // ---------- 被积函数最大值 ----------
  let maxIntegrand = Number.NEGATIVE_INFINITY
  const probeCount = 400
  for (let i = 0; i <= probeCount; i += 1) {
    const x = a + ((b - a) * i) / probeCount
    const value = integrand(x)
    if (Number.isFinite(value)) maxIntegrand = Math.max(maxIntegrand, value)
  }
  if (!Number.isFinite(maxIntegrand)) maxIntegrand = Number.NaN

  // ---------- 精确解 ----------
  const outerSource = pickOuterSource(f, g, config.k, a, b)
  const innerSource = outerSource === f.source ? g.source : f.source
  const integrandSource = buildIntegrandSource(
    config,
    method,
    f.source,
    g.source,
    fPrimeSource,
    outerSource,
    innerSource,
  )
  const symbolic = symbolicDefiniteIntegral(integrandSource, a, b)
  let exactTex: string | null = null
  let exactValue: number | null = null
  if (symbolic) {
    const consistent =
      Math.abs(symbolic.exactValue - integration.value) <=
      1e-6 * Math.max(1, Math.abs(integration.value))
    if (consistent) {
      exactTex = symbolic.exactTex
      exactValue = symbolic.exactValue
    }
  }

  const numeric: NumericSummary = {
    value: integration.value,
    errorEstimate: integration.errorEstimate,
    evaluations: integration.evaluations,
    intervals: integration.intervals,
    maxDepth: integration.maxDepth,
    intervalLength: b - a,
    maxIntegrand,
    exactTex,
    exactValue,
    tolerance: config.tolerance,
  }

  // ---------- 推导链 ----------
  const quantity = config.mode === 'volume' ? 'V' : 'S'
  const aTex = numberToTex(a)
  const bTex = numberToTex(b)
  const kTex = numberToTex(config.k)

  steps.push({
    title: '① 通用公式',
    tex: generalFormulaTex(method, config, quantity),
  })

  steps.push({
    title: '② 代入本题',
    tex: concreteFormulaTex(method, config, quantity, f.tex, g.tex, aTex, bTex, kTex, outerSource === f.source),
    note: `区间取 a = ${aTex}，b = ${bTex}，旋转轴 ${config.axis === 'horizontal' ? 'y' : 'x'} = ${kTex}。`,
  })

  steps.push({
    title: "③ 求导 f'(x)",
    tex: derivative
      ? `f'(x) = ${derivative.simplifiedTex}`
      : `f'(x) \\approx \\dfrac{f(x+h) - f(x-h)}{2h}`,
    note: derivative ? '由 math.js 符号求导得到。' : '符号求导失败，表面积用中心差分数值求导。',
  })

  const simplified = simplifyToString(integrandSource)
  steps.push({
    title: '④ 化简被积函数',
    tex: simplified.tex,
    note: '把半径、导数代入后化简，这就是实际参与积分计算的被积函数。',
  })

  steps.push({
    title: '⑤ 数值结果',
    tex: `${quantity} \\approx ${integration.value.toFixed(6)}`,
    note: `自适应 Simpson：精度 ${config.tolerance.toExponential(0)}，共 ${integration.intervals} 个子区间、${integration.evaluations} 次求值，误差估计 ${integration.errorEstimate.toExponential(2)}。`,
  })

  if (exactTex) {
    steps.push({
      title: '⑥ 解析解',
      tex: `${quantity} = ${exactTex} \\approx ${(exactValue ?? 0).toFixed(6)}`,
      note: '该积分存在初等原函数，已用符号求导反向校验。',
    })
  } else {
    steps.push({
      title: '⑥ 解析解',
      tex: `\\text{当前规则库未覆盖该被积函数，保留数值结果 } ${quantity} \\approx ${integration.value.toFixed(6)}`,
      note: '符号积分没有匹配到可用的原函数规则（这并不代表原函数不存在），按数值结果作答即可。',
    })
  }

  return {
    ok: true,
    errors,
    warnings,
    model: {
      spec,
      solid,
      fTex: f.tex,
      gTex: g.tex,
      fSource: f.source,
      gSource: g.source,
      fPrimeTex: derivative ? derivative.simplifiedTex : null,
      fPrimeSource,
      derivativeIsSymbolic: Boolean(derivative),
      method,
      methodLabel,
      methodReason,
      extent,
    },
    steps,
    numeric,
    plot,
    methodLabel,
  }
}

/** 通用公式的 LaTeX */
function generalFormulaTex(method: MethodKind, config: Config, quantity: string): string {
  if (config.mode === 'surface') {
    const radius = config.axis === 'horizontal' ? '\\left|f(x)-k\\right|' : '\\left|x-k\\right|'
    return `${quantity} = 2\\pi\\int_{a}^{b} ${radius}\\sqrt{1+\\left[f'(x)\\right]^{2}}\\,dx`
  }
  if (method === 'shell') {
    return `${quantity} = 2\\pi\\int_{a}^{b}\\left|x-k\\right|\\cdot\\left|f(x)-g(x)\\right|\\,dx`
  }
  if (method === 'washer') {
    return `${quantity} = \\pi\\int_{a}^{b}\\left[\\left(f(x)-k\\right)^{2}-\\left(g(x)-k\\right)^{2}\\right]dx`
  }
  return `${quantity} = \\pi\\int_{a}^{b}\\left[f(x)-k\\right]^{2}dx`
}

/** 代入具体函数后的公式 */
function concreteFormulaTex(
  method: MethodKind,
  config: Config,
  quantity: string,
  fTex: string,
  gTex: string,
  aTex: string,
  bTex: string,
  kTex: string,
  fIsOuter: boolean,
): string {
  const f = `\\left(${fTex}\\right)`
  const g = `\\left(${gTex}\\right)`
  const k = `\\left(${kTex}\\right)`

  if (config.mode === 'surface') {
    const integral =
      config.axis === 'horizontal'
        ? `2\\pi\\int_{${aTex}}^{${bTex}} \\left|${f}-${k}\\right|\\sqrt{1+\\left[f'(x)\\right]^{2}}\\,dx`
        : `2\\pi\\int_{${aTex}}^{${bTex}} \\left|x-${k}\\right|\\sqrt{1+\\left[f'(x)\\right]^{2}}\\,dx`
    return `${quantity} = ${integral}`
  }

  if (method === 'shell') {
    return `${quantity} = 2\\pi\\int_{${aTex}}^{${bTex}} \\left|x-${k}\\right|\\cdot\\left|${f}-${g}\\right|\\,dx`
  }

  if (method === 'washer') {
    const outer = fIsOuter ? f : g
    const inner = fIsOuter ? g : f
    return `${quantity} = \\pi\\int_{${aTex}}^{${bTex}}\\left[\\left(${outer}-${k}\\right)^{2}-\\left(${inner}-${k}\\right)^{2}\\right]dx`
  }

  return `${quantity} = \\pi\\int_{${aTex}}^{${bTex}}\\left(${f}-${k}\\right)^{2}dx`
}

function sampleMin(fn: (x: number) => number, a: number, b: number): number {
  let min = Number.POSITIVE_INFINITY
  for (let i = 0; i <= 200; i += 1) {
    const value = fn(a + ((b - a) * i) / 200)
    if (Number.isFinite(value)) min = Math.min(min, value)
  }
  return min
}

function sampleAbsDistance(fn: (x: number) => number, a: number, b: number, k: number): number {
  let max = 0
  for (let i = 0; i <= 96; i += 1) {
    const value = Math.abs(fn(a + ((b - a) * i) / 96) - k)
    if (Number.isFinite(value)) max = Math.max(max, value)
  }
  return max
}

function hasStraddle(
  f: (x: number) => number,
  g: (x: number) => number,
  a: number,
  b: number,
  k: number,
): boolean {
  for (let i = 0; i <= 96; i += 1) {
    const x = a + ((b - a) * i) / 96
    if ((f(x) - k) * (g(x) - k) < 0) return true
  }
  return false
}

/** 圆环法中哪条曲线是外边界：取平均半径更大的一条 */
function pickOuterSource(f: ParsedCurve, g: ParsedCurve, k: number, a: number, b: number): string {
  let sumF = 0
  let sumG = 0
  for (let i = 0; i <= 64; i += 1) {
    const x = a + ((b - a) * i) / 64
    const fv = Math.abs(f.fn(x) - k)
    const gv = Math.abs(g.fn(x) - k)
    if (Number.isFinite(fv)) sumF += fv
    if (Number.isFinite(gv)) sumG += gv
  }
  return sumF >= sumG ? f.source : g.source
}

/** 让外部能把数学表达式直接转成 TeX（图表标题等场景使用） */
export const toTex = expressionToTex
export { math }
