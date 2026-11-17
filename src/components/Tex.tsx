import katex from 'katex'
import { useMemo } from 'react'

interface TexProps {
  tex: string
  display?: boolean
  className?: string
}

/** 用 KaTeX 渲染 LaTeX；渲染失败时退回等宽文本，不抛异常 */
export function Tex({ tex, display = false, className }: TexProps) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, {
        displayMode: display,
        throwOnError: false,
        strict: false,
        output: 'html',
      })
    } catch {
      return null
    }
  }, [tex, display])

  if (!html) {
    return <code className="tex-fallback">{tex}</code>
  }

  return (
    <span
      className={`tex${display ? ' tex-display' : ''}${className ? ` ${className}` : ''}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
