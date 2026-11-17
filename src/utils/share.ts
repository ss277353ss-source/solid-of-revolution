import type { Config } from '../types'

/** 配置 <-> URL hash 的编解码，用于分享链接与刷新还原 */

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='))
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function encodeConfig(config: Config): string {
  return `cfg=${toBase64Url(JSON.stringify(config))}`
}

export function decodeConfig(hash: string): Config | null {
  try {
    const raw = hash.replace(/^#/, '')
    if (!raw.startsWith('cfg=')) return null
    const parsed = JSON.parse(fromBase64Url(raw.slice(4))) as Partial<Config>
    if (typeof parsed.fExpr !== 'string' || typeof parsed.gExpr !== 'string') return null
    if (parsed.axis !== 'horizontal' && parsed.axis !== 'vertical') return null
    if (parsed.mode !== 'volume' && parsed.mode !== 'surface') return null
    if (
      typeof parsed.k !== 'number' ||
      typeof parsed.a !== 'number' ||
      typeof parsed.b !== 'number'
    ) {
      return null
    }
    if (![parsed.k, parsed.a, parsed.b].every((value) => Number.isFinite(value))) return null
    const tolerance =
      typeof parsed.tolerance === 'number' && parsed.tolerance >= 1e-12 && parsed.tolerance <= 1e-2
        ? parsed.tolerance
        : 1e-9
    return {
      fExpr: parsed.fExpr,
      gExpr: parsed.gExpr,
      axis: parsed.axis,
      k: parsed.k,
      a: parsed.a,
      b: parsed.b,
      mode: parsed.mode,
      tolerance,
    }
  } catch {
    return null
  }
}

export function readConfigFromLocation(): Config | null {
  if (typeof window === 'undefined') return null
  return decodeConfig(window.location.hash)
}

export function writeConfigToLocation(config: Config): void {
  if (typeof window === 'undefined') return
  const hash = `#${encodeConfig(config)}`
  window.history.replaceState(null, '', hash)
}
