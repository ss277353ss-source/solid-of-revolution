import type { AnalysisModel, PlotData } from '../math/analyze'
import type { Config } from '../types'
import { NumberField } from './NumberField'
import { Plot2D } from './Plot2D'

interface RangeControlsProps {
  config: Config
  plot: PlotData | null
  model: AnalysisModel | null
  onChange: (patch: Partial<Config>) => void
}

export function RangeControls({ config, plot, model, onChange }: RangeControlsProps) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>积分区间</h2>
        <span className="badge-soft">可拖动端点</span>
      </div>

      <div className="range-inputs">
        <label className="range-field">
          <span>下限 a</span>
          <NumberField
            value={config.a}
            step={0.1}
            onCommit={(value) => onChange({ a: value })}
            ariaLabel="积分下限 a"
          />
        </label>
        <label className="range-field">
          <span>上限 b</span>
          <NumberField
            value={config.b}
            step={0.1}
            onCommit={(value) => onChange({ b: value })}
            ariaLabel="积分上限 b"
          />
        </label>
      </div>

      <Plot2D
        plot={plot}
        model={model}
        interval={[config.a, config.b]}
        mode={config.mode}
        tolerance={config.tolerance}
        onRangeChange={(a, b) => onChange({ a, b })}
      />
    </section>
  )
}
