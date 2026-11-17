import { useEffect, useRef, useState } from 'react'

interface NumberFieldProps {
  value: number
  onCommit: (value: number) => void
  step?: number
  min?: number
  max?: number
  ariaLabel?: string
  className?: string
}

function display(value: number): string {
  if (!Number.isFinite(value)) return ''
  if (Number.isInteger(value)) return String(value)
  return String(Number(value.toFixed(6)))
}

/** 数字输入框：允许自由输入（包括负号、小数点），只有在能解析成数字时才提交 */
export function NumberField({
  value,
  onCommit,
  step = 0.1,
  min,
  max,
  ariaLabel,
  className,
}: NumberFieldProps) {
  const [text, setText] = useState(() => display(value))
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setText(display(value))
  }, [value])

  const commit = (raw: string) => {
    let next = raw.replace(/[^\d.eE+-]/g, '')
    if (min !== undefined && Number(next) < min && next !== '' && next !== '-') {
      next = String(min)
    }
    if (max !== undefined && Number(next) > max) next = String(max)
    setText(next)
    const parsed = Number(next)
    if (next.trim() !== '' && next !== '-' && Number.isFinite(parsed)) onCommit(parsed)
  }

  return (
    <input
      className={className ? `number-field ${className}` : 'number-field'}
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={text}
      step={step}
      onFocus={() => {
        focused.current = true
      }}
      onBlur={() => {
        focused.current = false
        setText(display(value))
      }}
      onChange={(event) => commit(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          ;(event.target as HTMLInputElement).blur()
        }
      }}
      spellCheck={false}
    />
  )
}
