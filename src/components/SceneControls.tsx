import type { DisplayMode } from '../types'

export interface VisualState {
  sweep: number
  count: number
  display: DisplayMode
  showSurface: boolean
  showElements: boolean
  highlight: number
}

export const DEFAULT_VISUAL: VisualState = {
  sweep: 360,
  count: 24,
  display: 'shaded',
  showSurface: true,
  showElements: true,
  highlight: -1,
}

const DISPLAY_OPTIONS: Array<{ value: DisplayMode; label: string }> = [
  { value: 'shaded', label: '明暗' },
  { value: 'wireframe', label: '线框' },
  { value: 'translucent', label: '半透明' },
]

interface SceneControlsProps {
  visual: VisualState
  onChange: (patch: Partial<VisualState>) => void
}

export function SceneControls({ visual, onChange }: SceneControlsProps) {
  return (
    <div className="scene-controls">
      <div className="control">
        <div className="control-head">
          <span>扫出角度</span>
          <span className="control-value">{visual.sweep}°</span>
        </div>
        <input
          className="slider"
          type="range"
          min={0}
          max={360}
          step={1}
          value={visual.sweep}
          onChange={(event) => onChange({ sweep: Number(event.target.value) })}
          aria-label="旋转扫出角度"
        />
      </div>

      <div className="control">
        <div className="control-head">
          <span>微元数量 n</span>
          <span className="control-value">{visual.count}</span>
        </div>
        <input
          className="slider"
          type="range"
          min={4}
          max={200}
          step={1}
          value={visual.count}
          onChange={(event) => {
            const count = Number(event.target.value)
            onChange({ count, highlight: visual.highlight >= count ? count - 1 : visual.highlight })
          }}
          aria-label="微元数量"
        />
      </div>

      <div className="control">
        <div className="control-head">
          <span>高亮微元</span>
          <span className="control-value">
            {visual.highlight < 0 ? '关闭' : `第 ${visual.highlight + 1} 个`}
          </span>
        </div>
        <input
          className="slider"
          type="range"
          min={-1}
          max={Math.max(0, visual.count - 1)}
          step={1}
          value={visual.highlight}
          onChange={(event) => onChange({ highlight: Number(event.target.value) })}
          aria-label="高亮某一个微元"
        />
      </div>

      <div className="scene-row">
        <div className="segmented small" role="group" aria-label="显示模式">
          {DISPLAY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={visual.display === option.value ? 'active' : ''}
              onClick={() => onChange({ display: option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="toggles">
          <label className="toggle">
            <input
              type="checkbox"
              checked={visual.showSurface}
              onChange={(event) => onChange({ showSurface: event.target.checked })}
            />
            光滑曲面
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={visual.showElements}
              onChange={(event) => onChange({ showElements: event.target.checked })}
            />
            微元
          </label>
        </div>
      </div>
    </div>
  )
}
