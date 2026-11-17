/**
 * 符号积分（尽力而为）。
 *
 * math.js 本身没有不定积分功能，这里在它的 AST 上实现一组常见积分规则，
 * 并且**必须通过数值反证**才会被采用：把得到的原函数求导，与原来的被积函数
 * 在若干采样点上比对，误差超限就静默返回 null（界面上跳过这一步）。
 * 这样可以保证「给出精确表达式」时不会给出错误结果。
 */
import type { MathNode } from 'mathjs'
import { math, safeToTex } from './parse'

type AnyNode = MathNode & {
  isConstantNode?: boolean
  isSymbolNode?: boolean
  isOperatorNode?: boolean
  isFunctionNode?: boolean
  isParenthesisNode?: boolean
  value?: unknown
  name?: string
  op?: string
  fn?: { name?: string }
  args?: AnyNode[]
  content?: AnyNode
}

class UnsupportedIntegral extends Error {}

function containsVariable(node: AnyNode, variable: string): boolean {
  let found = false
  node.traverse((child) => {
    const candidate = child as AnyNode
    if (candidate.isSymbolNode && candidate.name === variable) found = true
  })
  return found
}

function constantValue(node: AnyNode): number | null {
  if (containsVariable(node, 'x')) return null
  try {
    const value = node.compile().evaluate({})
    return typeof value === 'number' && Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

function wrap(expression: string): string {
  return `(${expression})`
}

export interface LinearArgument {
  slope: number
  offset: number
}

/**
 * 判断节点是否是自变量的线性函数 a·x + b。
 * 用三个点做数值探测，并在最终求原函数时用求导反证兜底，
 * 因此这里只需要排除明显非线性的情形。
 */
function linearArgument(node: AnyNode, variable: string): LinearArgument | null {
  if (!containsVariable(node, variable)) return null
  let compiled: { evaluate: (scope: Record<string, number>) => unknown }
  try {
    compiled = node.compile()
  } catch {
    return null
  }
  const at = (x: number): number => {
    try {
      const value = compiled.evaluate({ [variable]: x })
      return typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN
    } catch {
      return Number.NaN
    }
  }
  const value0 = at(0)
  const value1 = at(1)
  const value2 = at(2)
  if (![value0, value1, value2].every((value) => Number.isFinite(value))) return null
  const slope = value1 - value0
  if (Math.abs(slope) < 1e-12) return null
  if (Math.abs(value2 - (2 * value1 - value0)) > 1e-9 * (1 + Math.abs(value2))) return null
  return { slope, offset: value0 }
}

/** 递归地把一个节点积分成表达式字符串；遇到不支持的形状就抛错 */
function integrateNode(node: AnyNode, variable: string): string {
  if (node.isParenthesisNode && node.content) {
    return integrateNode(node.content, variable)
  }

  // 任何不含自变量的子表达式都按常数处理（例如展开 (A+B)² 后产生的 (1)²）
  if (!containsVariable(node, variable)) {
    const value = constantValue(node)
    if (value !== null) return `${value}*${variable}`
  }

  if (node.isConstantNode) {
    const value = Number(node.value)
    if (!Number.isFinite(value)) throw new UnsupportedIntegral()
    if (value === 0) return '0'
    return `${value}*${variable}`
  }

  if (node.isSymbolNode) {
    if (node.name === variable) return `${variable}^2/2`
    const value = constantValue(node)
    if (value !== null) return `${value}*${variable}`
    throw new UnsupportedIntegral()
  }

  if (node.isOperatorNode && node.args) {
    const args = node.args

    if (node.op === '+') {
      return args.map((arg) => integrateNode(arg, variable)).join(' + ')
    }
    if (node.op === '-') {
      if (args.length === 1) return `-${wrap(integrateNode(args[0], variable))}`
      return `${wrap(integrateNode(args[0], variable))} - ${wrap(
        integrateNode(args[1], variable),
      )}`
    }

    if (node.op === '*') {
      const variableArgs = args.filter((arg) => containsVariable(arg, variable))
      const constantArgs = args.filter((arg) => !containsVariable(arg, variable))
      if (variableArgs.length !== 1) throw new UnsupportedIntegral()
      const constantPart =
        constantArgs.length === 0
          ? '1'
          : constantArgs.map((arg) => arg.toString()).join('*')
      return `${wrap(constantPart)}*${wrap(integrateNode(variableArgs[0], variable))}`
    }

    if (node.op === '/') {
      const denominator = args[1]
      const numerator = args[0]
      if (!containsVariable(denominator, variable)) {
        const value = constantValue(denominator)
        if (value === null || value === 0) throw new UnsupportedIntegral()
        return `${wrap(integrateNode(numerator, variable))}/${value}`
      }
      // 形如 c / x^n 的情形，转成幂函数
      if (denominator.isOperatorNode && denominator.op === '^' && denominator.args) {
        const base = denominator.args[0]
        const exponent = constantValue(denominator.args[1])
        if (base.isSymbolNode && base.name === variable && exponent !== null) {
          const negated = -exponent
          if (containsVariable(numerator, variable)) throw new UnsupportedIntegral()
          const power = integratePower(negated, variable)
          return `${wrap(numerator.toString())}*${wrap(power)}`
        }
      }
      throw new UnsupportedIntegral()
    }

    if (node.op === '^') {
      // 去掉括号节点，`(sin(x)+1)^2` 的底数其实是 ParenthesisNode
      const base = unwrapParentheses(args[0])
      const exponent = constantValue(args[1])

      // sin²(u)、cos²(u)、tan²(u)：用倍角公式 / 恒等式化成可积形式
      const squared = integrateSquaredFunction(base, exponent, variable)
      if (squared) return squared

      // (A ± B)² 展开成 A² ± 2AB + B²，让 (sin x + 1)² 这类被积函数也能求原函数
      if (
        exponent !== null &&
        Math.abs(exponent - 2) < 1e-12 &&
        base.isOperatorNode &&
        (base.op === '+' || base.op === '-') &&
        base.args &&
        base.args.length === 2
      ) {
        const left = wrap(base.args[0].toString())
        const right = wrap(base.args[1].toString())
        const expanded =
          base.op === '+'
            ? `${left}^2 + 2*${left}*${right} + ${right}^2`
            : `${left}^2 - 2*${left}*${right} + ${right}^2`
        return integrateNode(math.parse(expanded) as unknown as AnyNode, variable)
      }

      if (base.isSymbolNode && base.name === variable && exponent !== null) {
        return integratePower(exponent, variable)
      }
      if (!containsVariable(base, variable) && containsVariable(args[1], variable)) {
        const baseValue = constantValue(base)
        if (baseValue === null || baseValue <= 0) throw new UnsupportedIntegral()
        // 只支持以 e 为底的指数函数，其他底数需要除以 ln(a)
        if (Math.abs(baseValue - Math.E) < 1e-12) {
          return `${wrap(base.toString())}^${variable}`
        }
        return `${wrap(base.toString())}^${variable}/log(${baseValue})`
      }
      throw new UnsupportedIntegral()
    }
  }

  if (node.isFunctionNode && node.args && node.fn) {
    const name = node.fn.name ?? ''
    if (node.args.length !== 1) throw new UnsupportedIntegral()
    const inner = node.args[0]
    const linear = linearArgument(inner, variable)
    if (!linear) throw new UnsupportedIntegral()

    const slope = symbolicNumber(linear.slope) ?? String(linear.slope)
    const u = wrap(inner.toString())

    switch (name) {
      case 'sin':
        return `-(1/${slope})*cos${u}`
      case 'cos':
        return `(1/${slope})*sin${u}`
      case 'exp':
        return `(1/${slope})*exp${u}`
      case 'log':
      case 'ln':
        return `(1/${slope})*(${u}*log${u} - ${u})`
      case 'sqrt':
        return `(2/(3*${slope}))*${u}^(3/2)`
      default:
        throw new UnsupportedIntegral()
    }
  }

  throw new UnsupportedIntegral()
}

/** sin² / cos² / tan² 的积分（参数为线性函数时） */
function integrateSquaredFunction(
  base: AnyNode,
  exponent: number | null,
  variable: string,
): string | null {
  if (exponent === null || Math.abs(exponent - 2) > 1e-12) return null
  const unwrapped = unwrapParentheses(base)
  if (!unwrapped.isFunctionNode || !unwrapped.fn || !unwrapped.args || unwrapped.args.length !== 1) {
    return null
  }

  const name = unwrapped.fn.name ?? ''
  if (name !== 'sin' && name !== 'cos' && name !== 'tan') return null

  const linear = linearArgument(unwrapped.args[0], variable)
  if (!linear) return null

  const slope = symbolicNumber(linear.slope) ?? String(linear.slope)
  const u = wrap(unwrapped.args[0].toString())

  if (name === 'sin') {
    // ∫sin²(u)du = u/2 − sin(2u)/4（再除以 u 对 x 的斜率）
    return `${u}/(2*${slope}) - sin(2*${u})/(4*${slope})`
  }
  if (name === 'cos') {
    // ∫cos²(u)du = u/2 + sin(2u)/4
    return `${u}/(2*${slope}) + sin(2*${u})/(4*${slope})`
  }
  // ∫tan²(u)du = tan(u) − u
  return `tan${u}/${slope} - ${u}/${slope}`
}

function integratePower(exponent: number, variable: string): string {
  if (Math.abs(exponent + 1) < 1e-12) return `log(${variable})`
  const next = exponent + 1
  return `${variable}^(${next})/${next}`
}

/** 多项式：指数 -> 系数表达式（系数不含自变量，可以是 pi 之类的常量） */
type Polynomial = Map<number, string>

const MAX_POLYNOMIAL_DEGREE = 24

function mergePolynomial(a: Polynomial, b: Polynomial, sign: 1 | -1): Polynomial {
  const result = new Map(a)
  for (const [exponent, coefficient] of b) {
    const previous = result.get(exponent)
    if (previous === undefined) {
      result.set(exponent, sign === 1 ? coefficient : `-${wrap(coefficient)}`)
    } else if (sign === 1) {
      result.set(exponent, `${wrap(previous)} + ${wrap(coefficient)}`)
    } else {
      result.set(exponent, `${wrap(previous)} - ${wrap(coefficient)}`)
    }
  }
  return result
}

function multiplyPolynomial(a: Polynomial, b: Polynomial): Polynomial {
  const result: Polynomial = new Map()
  for (const [exponentA, coefficientA] of a) {
    for (const [exponentB, coefficientB] of b) {
      const exponent = exponentA + exponentB
      if (exponent > MAX_POLYNOMIAL_DEGREE) throw new UnsupportedIntegral()
      // 系数本身可能是和式，必须加括号再做乘法，否则会被解析成加法
      const product = `${wrap(coefficientA)}*${wrap(coefficientB)}`
      const previous = result.get(exponent)
      result.set(exponent, previous === undefined ? product : `${wrap(previous)} + ${wrap(product)}`)
    }
  }
  return result
}

function scalePolynomial(poly: Polynomial, factor: string): Polynomial {
  const result: Polynomial = new Map()
  for (const [exponent, coefficient] of poly) {
    result.set(exponent, `${wrap(factor)}*${wrap(coefficient)}`)
  }
  return result
}

/** 尝试把节点识别成关于 variable 的多项式 */
function toPolynomial(node: AnyNode, variable: string): Polynomial | null {
  try {
    if (node.isParenthesisNode && node.content) return toPolynomial(node.content, variable)

    if (node.isConstantNode) {
      const value = Number(node.value)
      if (!Number.isFinite(value)) return null
      return new Map([[0, String(value)]])
    }

    if (node.isSymbolNode) {
      if (node.name === variable) return new Map([[1, '1']])
      if (node.name === undefined) return null
      return new Map([[0, node.name]])
    }

    if (node.isOperatorNode && node.args) {
      const args = node.args
      if (node.op === '+') {
        let accumulator: Polynomial = new Map()
        for (const arg of args) {
          const poly = toPolynomial(arg, variable)
          if (!poly) return null
          accumulator = mergePolynomial(accumulator, poly, 1)
        }
        return accumulator
      }
      if (node.op === '-') {
        if (args.length === 1) {
          const inner = toPolynomial(args[0], variable)
          return inner ? scalePolynomial(inner, '-1') : null
        }
        const left = toPolynomial(args[0], variable)
        const right = toPolynomial(args[1], variable)
        return left && right ? mergePolynomial(left, right, -1) : null
      }
      if (node.op === '*') {
        let accumulator: Polynomial = new Map([[0, '1']])
        for (const arg of args) {
          const poly = toPolynomial(arg, variable)
          if (!poly) return null
          accumulator = multiplyPolynomial(accumulator, poly)
        }
        return accumulator
      }
      if (node.op === '/') {
        const numerator = toPolynomial(args[0], variable)
        if (!numerator) return null
        if (containsVariable(args[1], variable)) return null
        return scalePolynomial(numerator, `1/(${args[1].toString()})`)
      }
      if (node.op === '^') {
        const base = toPolynomial(args[0], variable)
        const exponent = constantValue(args[1])
        if (!base || exponent === null) return null
        if (!Number.isInteger(exponent) || exponent < 0 || exponent > MAX_POLYNOMIAL_DEGREE) return null
        let accumulator: Polynomial = new Map([[0, '1']])
        for (let i = 0; i < exponent; i += 1) {
          accumulator = multiplyPolynomial(accumulator, base)
        }
        return accumulator
      }
    }
    return null
  } catch {
    return null
  }
}

/** 逐项积分多项式 */
function integratePolynomial(poly: Polynomial, variable: string): string {
  const terms: string[] = []
  for (const [exponent, coefficient] of poly) {
    if (Math.abs(exponent + 1) < 1e-12) {
      terms.push(`(${coefficient})*log(${variable})`)
      continue
    }
    const next = exponent + 1
    terms.push(`${wrap(coefficient)}*${variable}^(${next})/${next}`)
  }
  return terms.length === 0 ? '0' : terms.join(' + ')
}

/** 数值比较原函数导数与被积函数，确认符号结果正确 */
function verifyAntiderivative(
  antiderivative: MathNode,
  integrand: MathNode,
  a: number,
  b: number,
  variable: string,
): boolean {
  let derivative: MathNode
  try {
    derivative = math.derivative(antiderivative, variable)
  } catch {
    return false
  }

  const derivativeCompiled = derivative.compile()
  const integrandCompiled = integrand.compile()

  for (let i = 1; i <= 7; i += 1) {
    const x = a + ((b - a) * i) / 8
    try {
      const left = Number(derivativeCompiled.evaluate({ [variable]: x }))
      const right = Number(integrandCompiled.evaluate({ [variable]: x }))
      if (!Number.isFinite(left) || !Number.isFinite(right)) continue
      if (Math.abs(left - right) > 1e-6 * (1 + Math.abs(right))) return false
    } catch {
      return false
    }
  }
  return true
}

/** 反复剥掉括号节点，直到拿到真正的表达式 */
function unwrapParentheses(node: AnyNode): AnyNode {
  let current = node
  while (current.isParenthesisNode && current.content) {
    current = current.content
  }
  return current
}

/** 若数值可写成 π 的有理倍数，返回 { 分子, 分母 } */
function piFraction(value: number): { numerator: number; denominator: 1 | 2 | 4 } | null {
  if (value === 0) return null
  for (const denominator of [1, 2, 4] as const) {
    const ratio = value / (Math.PI / denominator)
    const rounded = Math.round(ratio)
    if (Math.abs(ratio - rounded) < 1e-12 && rounded !== 0 && Math.abs(rounded) <= 48) {
      return { numerator: rounded, denominator }
    }
  }
  return null
}

/**
 * 把数值写成"好看的"表达式字符串：整数 / 半整数 / π 的有理倍数，
 * 其余情况返回 null。用于端点、导数斜率等需要保持符号形式的场合。
 */
function symbolicNumber(value: number): string | null {
  if (Number.isInteger(value)) return String(value)
  if (Number.isInteger(value * 2)) return `${Math.round(value * 2)}/2`

  const fraction = piFraction(value)
  if (!fraction) return null
  const { numerator, denominator } = fraction
  const sign = numerator < 0 ? '-' : ''
  const absolute = Math.abs(numerator)

  if (denominator === 1) {
    if (absolute === 1) return `${sign}pi`
    return `${sign}${absolute}*pi`
  }
  if (absolute === 1) return `${sign}pi/${denominator}`
  return `${sign}${absolute}*pi/${denominator}`
}

function endpointNode(value: number): MathNode {
  return math.parse(symbolicNumber(value) ?? String(value))
}

function substitute(node: MathNode, variable: string, value: number): MathNode {
  return node.transform((child) => {
    const candidate = child as AnyNode
    if (candidate.isSymbolNode && candidate.name === variable) {
      return endpointNode(value)
    }
    return child
  })
}

/** 把 sin(2π)、cos(π) 这类常数三角值折成 0 / ±1，避免原函数里残留 sin(2π) */
function foldConstantTrig(node: MathNode): MathNode {
  return node.transform((child) => {
    const candidate = child as AnyNode
    if (!candidate.isFunctionNode || !candidate.args || candidate.args.length !== 1) return child
    const name = candidate.fn?.name
    if (name !== 'sin' && name !== 'cos' && name !== 'tan') return child
    if (containsVariable(candidate.args[0], 'x')) return child
    try {
      const evaluated = candidate.compile().evaluate({})
      if (typeof evaluated !== 'number' || !Number.isFinite(evaluated)) return child
      if (Math.abs(evaluated) < 1e-12) return math.parse('0')
      if (Math.abs(evaluated - 1) < 1e-12) return math.parse('1')
      if (Math.abs(evaluated + 1) < 1e-12) return math.parse('-1')
      return child
    } catch {
      return child
    }
  })
}

/** 上下限的 LaTeX */
function limitTex(value: number): string {
  return safeToTex(endpointNode(value))
}

export interface SymbolicResult {
  /** 原函数（不定积分）的 LaTeX */
  antiderivativeTex: string
  /** 定积分的精确表达式 LaTeX */
  exactTex: string
  /** 精确表达式对应的数值 */
  exactValue: number
}

/**
 * 尝试求 ∫_a^b source dx 的解析解。
 * 无法求解、或数值反证不通过时返回 null，不抛异常。
 */
export function symbolicDefiniteIntegral(
  source: string,
  a: number,
  b: number,
  variable = 'x',
): SymbolicResult | null {
  if (!(b > a)) return null

  // 端点"整齐"（整数、半整数或 π 的有理倍数）时保留分数与 π 的符号形式，
  // 这样 [0, π] 上的结果会写成 π²/2 而不是 1.5708·π；
  // 拖动端点得到的任意小数则改用小数系数，避免出现 16807/100000 这种大分数。
  const exactFractions = symbolicNumber(a) !== null && symbolicNumber(b) !== null

  let integrand: MathNode
  try {
    integrand = math.simplify(source, {}, { exactFractions })
  } catch {
    try {
      integrand = math.parse(source)
    } catch {
      return null
    }
  }

  let antiderivative: MathNode
  try {
    const polynomial = toPolynomial(integrand as unknown as AnyNode, variable)
    const expression = polynomial
      ? integratePolynomial(polynomial, variable)
      : integrateNode(integrand as unknown as AnyNode, variable)
    antiderivative = math.simplify(expression, {}, { exactFractions })
  } catch {
    return null
  }

  if (!verifyAntiderivative(antiderivative, integrand, a, b, variable)) return null

  let exactValue: number
  let exactNode: MathNode
  try {
    const upper = foldConstantTrig(substitute(antiderivative, variable, b))
    const lower = foldConstantTrig(substitute(antiderivative, variable, a))
    exactNode = math.simplify(`${upper.toString()} - (${lower.toString()})`, {}, {
      exactFractions,
    })
    const evaluated = exactNode.compile().evaluate({})
    exactValue = typeof evaluated === 'number' ? evaluated : Number.NaN
  } catch {
    return null
  }

  if (!Number.isFinite(exactValue)) return null

  let antiderivativeTex: string
  let exactTex: string
  try {
    antiderivativeTex = safeToTex(antiderivative)
    exactTex = safeToTex(exactNode)
  } catch {
    return null
  }

  // 化简结果里若残留很长的小数（如 1.5707963267948966π），
  // 改用「原函数 + 上下限」的写法，保证展示的是可读的精确表达式。
  if (/\.\d{5,}/.test(exactTex)) {
    exactTex = `\\left.${antiderivativeTex}\\right|_{${limitTex(a)}}^{${limitTex(b)}}`
  }

  return { antiderivativeTex, exactTex, exactValue }
}
