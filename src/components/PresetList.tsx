import { PRESETS, type Preset } from '../presets'
import type { Config } from '../types'

interface PresetListProps {
  config: Config
  onSelect: (preset: Preset) => void
}

function sameConfig(a: Config, b: Config): boolean {
  return (
    a.fExpr === b.fExpr &&
    a.gExpr === b.gExpr &&
    a.axis === b.axis &&
    a.mode === b.mode &&
    Math.abs(a.k - b.k) < 1e-9 &&
    Math.abs(a.a - b.a) < 1e-9 &&
    Math.abs(a.b - b.b) < 1e-9
  )
}

export function PresetList({ config, onSelect }: PresetListProps) {
  const active = PRESETS.find((preset) => sameConfig(preset.config, config))

  return (
    <section className="preset-section">
      <div className="preset-bar">
        <span className="preset-label">示例</span>
        <div className="preset-list">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`preset${active?.id === preset.id ? ' active' : ''}`}
              onClick={() => onSelect(preset)}
              title={preset.formula}
            >
              {preset.title}
            </button>
          ))}
        </div>
      </div>
      <p className="preset-intuition">
        {active ? (
          <>
            <strong>{active.title}</strong>
            <span className="preset-formula">{active.formula}</span>
            <span className="preset-text">{active.intuition}</span>
          </>
        ) : (
          <span className="preset-text muted">
            点击任意示例一键载入。每个例子都附带一句直觉说明，帮助你判断结果是否合理。
          </span>
        )}
      </p>
    </section>
  )
}
