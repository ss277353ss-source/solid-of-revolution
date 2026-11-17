import type { CurveErrorItem } from '../math/analyze'
import type { Config, ModeKind } from '../types'

interface CurveInputsProps {
  config: Config
  errors: CurveErrorItem[]
  onChange: (patch: Partial<Config>) => void
}

function InputError({ error }: { error: CurveErrorItem }) {
  return (
    <div className="input-error">
      <div className="error-code">
        <code>{error.source}</code>
        {error.position !== undefined && error.position >= 0 && (
          <code className="error-caret">
            {' '.repeat(error.position)}^
          </code>
        )}
      </div>
      <p>{error.message}</p>
    </div>
  )
}

export function CurveInputs({ config, errors, onChange }: CurveInputsProps) {
  const fError = errors.find((error) => error.label === 'f(x)')
  const gError = errors.find((error) => error.label === 'g(x)')

  const setMode = (mode: ModeKind) => onChange({ mode })

  return (
    <section className="card">
      <div className="card-head">
        <h2>函数</h2>
        <span className="badge-soft">math.js 解析</span>
      </div>

      <label className="field-label" htmlFor="f-expr">
        主曲线 <span className="mono">y = f(x)</span>
      </label>
      <div className={`expr-row${fError ? ' invalid' : ''}`}>
        <span className="expr-prefix">y =</span>
        <input
          id="f-expr"
          className="expr-input"
          value={config.fExpr}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => onChange({ fExpr: event.target.value })}
        />
      </div>
      {fError && <InputError error={fError} />}

      <label className="field-label" htmlFor="g-expr">
        下边界 <span className="mono">y = g(x)</span>
        <span className="field-hint">旋转区域的下边界，默认 0 即 x 轴</span>
      </label>
      <div className={`expr-row${gError ? ' invalid' : ''}`}>
        <span className="expr-prefix">y =</span>
        <input
          id="g-expr"
          className="expr-input"
          value={config.gExpr}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => onChange({ gExpr: event.target.value })}
        />
      </div>
      {gError && <InputError error={gError} />}

      <p className="field-help">
        支持 sin / cos / tan / exp / log / sqrt / abs / ^ / pi / e，例如 <code>sqrt(1-x^2)</code>、
        <code>sin(pi*x)</code>。log 为自然对数。
      </p>

      <div className="field-label">计算目标</div>
      <div className="segmented" role="group" aria-label="计算目标">
        <button
          type="button"
          className={config.mode === 'volume' ? 'active' : ''}
          onClick={() => setMode('volume')}
        >
          体积
        </button>
        <button
          type="button"
          className={config.mode === 'surface' ? 'active' : ''}
          onClick={() => setMode('surface')}
        >
          表面积
        </button>
      </div>

      <label className="field-label" htmlFor="tolerance">
        积分精度
      </label>
      <select
        id="tolerance"
        className="select"
        value={config.tolerance}
        onChange={(event) => onChange({ tolerance: Number(event.target.value) })}
      >
        <option value={1e-6}>1e-6（快速）</option>
        <option value={1e-8}>1e-8（默认）</option>
        <option value={1e-9}>1e-9</option>
        <option value={1e-10}>1e-10（高精度）</option>
        <option value={1e-11}>1e-11（最慢）</option>
      </select>
    </section>
  )
}
