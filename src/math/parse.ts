/**
 * 表达式解析层：把用户输入的字符串转成可求值的函数，并生成 LaTeX。
 * 全部基于 math.js（math.parse / math.derivative / math.simplify / node.toTex）。
 */
import { create, all } from 'mathjs'
import type { MathNode } from 'mathjs'

export const math = create(all, {})

export interface ParsedCurve {
  ok: true
  /** 去掉 "y =" 等前缀后的规范表达式 */
  source: string
  node: MathNode
  /** LaTeX 形式，用于 KaTeX 渲染 */
  tex: string
  /** 数值求值；无定义处返回 NaN */
  fn: (x: number) => number
  /** 表达式中出现的自由变量 */
  symbols: string[]
}

export interface ParseFailure {
  ok: false
  message: string
  /** 出错字符在 source 中的下标（从 0 开始），可能为空 */
  position?: number
  /** 出错的表达式文本 */
  source: string
}

export type ParseResult = ParsedCurve | ParseFailure

const ALLOWED_SYMBOLS = new Set(['x', 'pi', 'e', 'tau', 'phi', 'i', 'Infinity'])

/** 把 math.js 的结果（可能是 Complex / BigNumber）安全地转成 number */
function toNumber(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'boolean') return value ? 1 : 0
  if (value && typeof value === 'object') {
    const maybe = value as { re?: number; im?: number; toNumber?: () => number; isBigNumber?: boolean }
    if (typeof maybe.re === 'number' && typeof maybe.im === 'number') {
      // 复数的虚部不为 0 时视为无定义（例如 sqrt(-1)）
      return Math.abs(maybe.im) < 1e-12 ? maybe.re : Number.NaN
    }
    if (maybe.isBigNumber && typeof maybe.toNumber === 'function') return maybe.toNumber()
  }
  return Number.NaN
}

/** 去掉形如 "y ="、"f(x) =" 的前缀 */
export function stripPrefix(raw: string): string {
  const match = raw.match(/^\s*(?:y|f\s*\(\s*x\s*\)|g\s*\(\s*x\s*\))\s*=\s*/i)
  return match ? raw.slice(match[0].length) : raw.trim()
}

function extractPosition(error: unknown): number | undefined {
  const message = error instanceof Error ? error.message : String(error)
  const match = message.match(/char\s+(\d+)/i)
  if (!match) return undefined
  return Number.parseInt(match[1], 10) - 1
}

function cleanErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/\s*\(char\s+\d+\)\s*/i, '').trim()
}

/** 解析一条曲线表达式 */
export function parseCurve(raw: string): ParseResult {
  const source = stripPrefix(raw)
  if (source.length === 0) {
    return { ok: false, message: '表达式为空，请输入例如 x^2 或 sin(x)', source }
  }

  let node: MathNode
  try {
    node = math.parse(source)
  } catch (error) {
    return {
      ok: false,
      message: `解析失败：${cleanErrorMessage(error)}`,
      position: extractPosition(error),
      source,
    }
  }

  const symbols = new Set<string>()
  // 注意：FunctionNode 的 fn 属性本身也是 SymbolNode（例如 sqrt），
  // 它不是自由变量，必须排除，否则会被误判为未知符号。
  node
    .filter((child, path, parent) => {
      const candidate = child as unknown as { isSymbolNode?: boolean; name?: string }
      if (!candidate.isSymbolNode) return false
      const parentNode = parent as unknown as { isFunctionNode?: boolean }
      if (parentNode?.isFunctionNode && path === 'fn') return false
      return true
    })
    .forEach((child) => {
      const name = (child as unknown as { name: string }).name
      symbols.add(name)
    })

  // 形如 sin()、cos() 的表达式语法合法但缺少参数，math.js 会把它当成无参函数，
  // 求值结果恒为 NaN。这里提前拦下来，给出可以直接照抄的写法。
  let emptyCallName = ''
  node.filter((child) => {
    const candidate = child as unknown as {
      isFunctionNode?: boolean
      fn?: { name?: string }
      args?: unknown[]
    }
    if (candidate.isFunctionNode && Array.isArray(candidate.args) && candidate.args.length === 0) {
      emptyCallName = candidate.fn?.name ?? ''
      return true
    }
    return false
  })
  if (emptyCallName) {
    return {
      ok: false,
      message: `函数「${emptyCallName}」缺少参数，请写成 ${emptyCallName}(x) 的形式`,
      source,
    }
  }

  const unknown = [...symbols].filter((name) => !ALLOWED_SYMBOLS.has(name))
  if (unknown.length > 0) {
    const knownFunctions = unknown.filter(
      (name) => typeof (math as unknown as Record<string, unknown>)[name] === 'function',
    )
    if (knownFunctions.length === unknown.length) {
      return {
        ok: false,
        message: `「${knownFunctions.join('、')}」是函数名，需要补上参数，例如 ${knownFunctions[0]}(x)`,
        source,
      }
    }
    return {
      ok: false,
      message: `出现了本页不支持的符号「${unknown.join('、')}」，只允许自变量 x 以及 pi、e 等常量`,
      source,
    }
  }

  const compiled = node.compile()
  const fn = (x: number): number => {
    try {
      return toNumber(compiled.evaluate({ x }))
    } catch {
      return Number.NaN
    }
  }

  let tex = source
  try {
    tex = node.toTex({ parenthesis: 'auto' })
  } catch {
    tex = source
  }

  return { ok: true, source, node, tex, fn, symbols: [...symbols] }
}

export interface DerivativeInfo {
  /** 求导后的表达式文本 */
  text: string
  /** 求导后的 LaTeX */
  tex: string
  /** 化简后的 LaTeX（可能与 tex 相同） */
  simplifiedTex: string
  fn: (x: number) => number
}

/**
 * 用 math.js 做符号求导。遇到不支持的函数（例如 abs）时返回 null，
 * 调用方会退化为数值求导。
 */
export function derivativeOf(node: MathNode, variable = 'x'): DerivativeInfo | null {
  let derived: MathNode
  try {
    derived = math.derivative(node, variable)
  } catch {
    return null
  }

  let simplified = derived
  try {
    simplified = math.simplify(derived)
  } catch {
    simplified = derived
  }

  const compiled = derived.compile()
  const simplifiedCompiled = simplified.compile()

  return {
    text: derived.toString(),
    tex: safeToTex(derived),
    simplifiedTex: safeToTex(simplified),
    fn: (x: number) => {
      try {
        const direct = toNumber(compiled.evaluate({ x }))
        if (Number.isFinite(direct)) return direct
        return toNumber(simplifiedCompiled.evaluate({ x }))
      } catch {
        return Number.NaN
      }
    },
  }
}

/** toTex 的安全包装 */
export function safeToTex(node: MathNode): string {
  try {
    return node.toTex({ parenthesis: 'auto' })
  } catch {
    return node.toString()
  }
}

/** 把表达式字符串转成 LaTeX，失败时原样返回 */
export function expressionToTex(source: string): string {
  try {
    return safeToTex(math.parse(source))
  } catch {
    return source
  }
}

/** math.js 表达式化简，失败时返回原始文本 */
export function simplifyToString(source: string): { text: string; tex: string } {
  try {
    const simplified = math.simplify(source, {}, { exactFractions: true })
    return { text: simplified.toString(), tex: safeToTex(simplified) }
  } catch {
    return { text: source, tex: expressionToTex(source) }
  }
}

/**
 * 数值中心差分，用于符号求导失败时的兜底。
 * 步长随 |x| 自适应，避免在端点附近产生过大误差。
 */
export function numericDerivative(fn: (x: number) => number, x: number): number {
  const h = 1e-5 * Math.max(1, Math.abs(x))
  const forward = fn(x + h)
  const backward = fn(x - h)
  if (!Number.isFinite(forward) || !Number.isFinite(backward)) {
    // 端点处退化为单侧差分
    const inner = fn(x + h)
    if (Number.isFinite(inner)) return (inner - fn(x)) / h
    const outer = fn(x - h)
    if (Number.isFinite(outer)) return (fn(x) - outer) / h
    return Number.NaN
  }
  return (forward - backward) / (2 * h)
}
