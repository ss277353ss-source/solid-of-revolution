import { useCallback, useEffect, useMemo, useState } from 'react'
import { analyze } from './math/analyze'
import { DEFAULT_CONFIG, type Preset } from './presets'
import type { Config } from './types'
import { readConfigFromLocation, writeConfigToLocation } from './utils/share'
import { AxisControls } from './components/AxisControls'
import { CurveInputs } from './components/CurveInputs'
import { DerivationPanel } from './components/DerivationPanel'
import { ErrorBoundary } from './components/ErrorBoundary'
import { PresetList } from './components/PresetList'
import { RangeControls } from './components/RangeControls'
import { ResultPanel } from './components/ResultPanel'
import { Scene3D } from './components/Scene3D'
import { DEFAULT_VISUAL, SceneControls, type VisualState } from './components/SceneControls'
import { WarningList } from './components/WarningList'

export default function App() {
  const [config, setConfig] = useState<Config>(() => readConfigFromLocation() ?? DEFAULT_CONFIG)
  const [visual, setVisual] = useState<VisualState>(DEFAULT_VISUAL)
  const [shareState, setShareState] = useState('')

  const analysis = useMemo(() => analyze(config), [config])

  useEffect(() => {
    writeConfigToLocation(config)
  }, [config])

  const updateConfig = useCallback((patch: Partial<Config>) => {
    setConfig((previous) => ({ ...previous, ...patch }))
  }, [])

  const updateVisual = useCallback((patch: Partial<VisualState>) => {
    setVisual((previous) => ({ ...previous, ...patch }))
  }, [])

  const handlePreset = useCallback((preset: Preset) => {
    setConfig(preset.config)
    setVisual((previous) => ({ ...previous, highlight: -1 }))
  }, [])

  const handleShare = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setShareState('已复制到剪贴板')
    } catch {
      setShareState('复制失败，请从地址栏复制')
    }
    window.setTimeout(() => setShareState(''), 2400)
  }, [])

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <h1>旋转体体积与表面积</h1>
          <p className="subtitle">
            输入一条曲线，选一条旋转轴，实时看到它扫出的立体、数值结果与完整推导。
          </p>
        </div>
        <div className="header-meta">
          <span>自适应 Simpson</span>
          <span>math.js 符号求导</span>
          <span>three.js 实时渲染</span>
        </div>
      </header>

      <PresetList config={config} onSelect={handlePreset} />

      <main className="layout">
        <div className="column left">
          <div className="controls-stack">
            <CurveInputs config={config} errors={analysis.errors} onChange={updateConfig} />
            <AxisControls config={config} onChange={updateConfig} />
            <RangeControls
              config={config}
              plot={analysis.plot}
              model={analysis.model}
              onChange={updateConfig}
            />
          </div>

          <div className="scene-stack">
            <section className="card scene-card">
              <div className="card-head">
                <h2>旋转体</h2>
                <span className="badge-soft mono">
                  {analysis.model
                    ? `${analysis.model.methodLabel} · ${config.axis === 'horizontal' ? 'y' : 'x'} = ${Number(
                        config.k.toFixed(3),
                      )}`
                    : '等待有效输入'}
                </span>
              </div>
              <ErrorBoundary
                fallback={
                  <div className="scene-empty">
                    <div>
                      <strong>三维场景渲染失败</strong>
                      <p>当前输入让几何数据出现了无效值，请换个表达式或调整区间后重试。</p>
                    </div>
                  </div>
                }
              >
                <Scene3D
                  model={analysis.model}
                  sweep={visual.sweep}
                  count={visual.count}
                  display={visual.display}
                  showSurface={visual.showSurface}
                  showElements={visual.showElements}
                  highlight={visual.highlight}
                />
              </ErrorBoundary>
              <SceneControls visual={visual} onChange={updateVisual} />
            </section>
          </div>
        </div>

        <aside className="column right">
          <ResultPanel
            config={config}
            analysis={analysis}
            shareState={shareState}
            onShare={handleShare}
          />
          <DerivationPanel
            steps={analysis.steps}
            methodLabel={analysis.methodLabel}
            methodReason={analysis.model?.methodReason ?? ''}
          />
          <WarningList warnings={[...analysis.errors.map((error) => ({ level: 'error' as const, message: `${error.label}：${error.message}` })), ...analysis.warnings]} />
        </aside>
      </main>

      <footer className="app-footer">
        <span>所有计算在浏览器本地完成：无后端、无网络请求。</span>
        <span className="mono">Vite + React + TypeScript · math.js · three.js · KaTeX</span>
      </footer>
    </div>
  )
}
