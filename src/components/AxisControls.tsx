import type { AxisKind, Config } from '../types'
import { NumberField } from './NumberField'

interface AxisControlsProps {
  config: Config
  onChange: (patch: Partial<Config>) => void
}

export function AxisControls({ config, onChange }: AxisControlsProps) {
  const setAxis = (axis: AxisKind) => onChange({ axis })
  const sliderMin = -5
  const sliderMax = 5
  const clamped = Math.min(sliderMax, Math.max(sliderMin, config.k))

  return (
    <section className="card">
      <div className="card-head">
        <h2>旋转轴</h2>
        <span className="badge-soft mono">
          {config.axis === 'horizontal' ? 'y = k' : 'x = k'}
        </span>
      </div>

      <div className="segmented" role="group" aria-label="旋转轴方向">
        <button
          type="button"
          className={config.axis === 'horizontal' ? 'active' : ''}
          onClick={() => setAxis('horizontal')}
        >
          水平轴 y = k
        </button>
        <button
          type="button"
          className={config.axis === 'vertical' ? 'active' : ''}
          onClick={() => setAxis('vertical')}
        >
          垂直轴 x = k
        </button>
      </div>

      <div className="inline-row">
        <span className="field-label inline">
          {config.axis === 'horizontal' ? 'k（y 坐标）' : 'k（x 坐标）'}
        </span>
        <NumberField
          value={config.k}
          step={0.1}
          onCommit={(value) => onChange({ k: value })}
          ariaLabel="旋转轴偏移量 k"
          className="narrow"
        />
        <div className="quick-values">
          {[0, -1, 1].map((value) => (
            <button
              key={value}
              type="button"
              className={Math.abs(config.k - value) < 1e-9 ? 'chip active' : 'chip'}
              onClick={() => onChange({ k: value })}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <input
        className="slider"
        type="range"
        min={sliderMin}
        max={sliderMax}
        step={0.05}
        value={clamped}
        onChange={(event) => onChange({ k: Number(event.target.value) })}
        aria-label="拖动调整旋转轴位置"
      />
      <div className="slider-scale">
        <span>{sliderMin}</span>
        <span>0</span>
        <span>{sliderMax}</span>
      </div>

      <p className="field-help">
        {config.axis === 'horizontal'
          ? 'k = 0 就是 x 轴；取 k = −1 时曲线绕 y = −1 旋转，截面会变成圆环。'
          : 'k = 0 就是 y 轴；竖直轴沿 x 方向切片后卷成柱壳，用 2π∫|x−k|·h dx。'}
      </p>
    </section>
  )
}
