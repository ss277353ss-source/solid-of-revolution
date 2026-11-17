import { useMemo, useRef, useState } from 'react'
import type { AnalysisModel, PlotData } from '../math/analyze'
import { formatNumber } from '../math/analyze'
import { areaWithXAxis, areaWithYAxis } from '../math/area'
import type { ModeKind } from '../types'

interface Plot2DProps {
  plot: PlotData | null
  /** 通过它拿到 f 与 f' 的求值函数，用于计算面积 */
  model: AnalysisModel | null
  interval: [number, number]
  mode: ModeKind
  tolerance: number
  onRangeChange: (a: number, b: number) => void
}

type PlotView = 'curve' | 'area-x' | 'area-y'

interface AreaInfo {
  value: number
  segments: Array<[number, number]>
  monotone: boolean
}

const WIDTH = 680
const HEIGHT = 300
const PAD = 30

function buildPath(
  points: Array<{ x: number; y: number }>,
  sx: (x: number) => number,
  sy: (y: number) => number,
): string {
  let path = ''
  let started = false
  for (const point of points) {
    if (!Number.isFinite(point.y)) {
      started = false
      continue
    }
    const px = sx(point.x)
    const py = sy(point.y)
    if (py < -4000 || py > 4000) {
      started = false
      continue
    }
    path += `${started ? 'L' : 'M'}${px.toFixed(2)},${py.toFixed(2)} `
    started = true
  }
  return path.trim()
}

/** 曲线与 x 轴之间的填充路径 */
function shadeWithXAxis(
  fn: (x: number) => number,
  lo: number,
  hi: number,
  sx: (x: number) => number,
  sy: (y: number) => number,
): string {
  const steps = 240
  let path = `M${sx(lo).toFixed(2)},${sy(0).toFixed(2)} `
  for (let i = 0; i <= steps; i += 1) {
    const x = lo + ((hi - lo) * i) / steps
    const y = fn(x)
    if (!Number.isFinite(y)) continue
    const py = sy(y)
    if (py < -4000 || py > 4000) continue
    path += `L${sx(x).toFixed(2)},${py.toFixed(2)} `
  }
  path += `L${sx(hi).toFixed(2)},${sy(0).toFixed(2)} Z`
  return path
}

/** 一个单调段内，曲线与 y 轴之间的填充路径 */
function shadeWithYAxis(
  fn: (x: number) => number,
  x0: number,
  x1: number,
  sx: (x: number) => number,
  sy: (y: number) => number,
): string {
  const steps = 160
  const y0 = fn(x0)
  const y1 = fn(x1)
  if (!Number.isFinite(y0) || !Number.isFinite(y1)) return ''
  let path = `M${sx(0).toFixed(2)},${sy(y0).toFixed(2)} `
  for (let i = 0; i <= steps; i += 1) {
    const x = x0 + ((x1 - x0) * i) / steps
    const y = fn(x)
    if (!Number.isFinite(y)) continue
    const py = sy(y)
    if (py < -4000 || py > 4000) continue
    path += `L${sx(x).toFixed(2)},${py.toFixed(2)} `
  }
  path += `L${sx(0).toFixed(2)},${sy(y1).toFixed(2)} Z`
  return path
}

export function Plot2D({ plot, model, interval, mode, tolerance, onRangeChange }: Plot2DProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [dragging, setDragging] = useState<'a' | 'b' | null>(null)
  const [view, setView] = useState<PlotView>('curve')

  const [a, b] = interval
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)

  const areaInfo = useMemo<AreaInfo | null>(() => {
    if (view === 'curve' || !model) return null
    const { fn, prime } = model.spec.f
    try {
      if (view === 'area-x') {
        const value = areaWithXAxis(fn, lo, hi, tolerance)
        if (!Number.isFinite(value)) return null
        return { value, segments: [[lo, hi]], monotone: true }
      }
      const result = areaWithYAxis(fn, prime, lo, hi, tolerance)
      if (!Number.isFinite(result.value)) return null
      return result
    } catch {
      return null
    }
  }, [view, model, lo, hi, tolerance])

  if (!plot) {
    return (
      <div className="plot-empty">
        <span>表达式有误，暂时无法绘制图像</span>
      </div>
    )
  }

  let [xMin, xMax] = plot.domain
  if (view === 'area-y') {
    // 与 y 轴围成的面积需要把 x = 0 画进画面
    xMin = Math.min(xMin, 0)
    xMax = Math.max(xMax, 0)
  }
  const values: number[] = [plot.axisValue, 0]
  for (const point of plot.f) if (Number.isFinite(point.y)) values.push(point.y)
  for (const point of plot.g) if (Number.isFinite(point.y)) values.push(point.y)

  let yMin = Math.min(...values)
  let yMax = Math.max(...values)
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax) || yMax - yMin < 1e-9) {
    yMin = -1
    yMax = 1
  }
  const yPad = (yMax - yMin) * 0.14 || 0.5
  yMin -= yPad
  yMax += yPad

  const sx = (x: number) => PAD + ((x - xMin) / (xMax - xMin || 1)) * (WIDTH - 2 * PAD)
  const sy = (y: number) => HEIGHT - PAD - ((y - yMin) / (yMax - yMin || 1)) * (HEIGHT - 2 * PAD)

  const bandLeft = sx(Math.min(a, b))
  const bandRight = sx(Math.max(a, b))

  const pointerToX = (clientX: number): number => {
    const svg = svgRef.current
    if (!svg) return xMin
    const rect = svg.getBoundingClientRect()
    const ratio = (clientX - rect.left) / rect.width
    const px = ratio * WIDTH
    return xMin + ((px - PAD) / (WIDTH - 2 * PAD)) * (xMax - xMin)
  }

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging) return
    const raw = pointerToX(event.clientX)
    if (dragging === 'a') {
      const next = Math.min(raw, b - (xMax - xMin) * 0.002)
      onRangeChange(Number(next.toFixed(6)), b)
    } else {
      const next = Math.max(raw, a + (xMax - xMin) * 0.002)
      onRangeChange(a, Number(next.toFixed(6)))
    }
  }

  const yOfCurve = (x: number): number => {
    const fn = plot.f
    let closest = Number.NaN
    let bestDistance = Number.POSITIVE_INFINITY
    for (const point of fn) {
      const distance = Math.abs(point.x - x)
      if (distance < bestDistance) {
        bestDistance = distance
        closest = point.y
      }
    }
    return closest
  }

  const handleY = (x: number): number => {
    const value = yOfCurve(x)
    if (!Number.isFinite(value)) return HEIGHT - PAD
    return Math.min(HEIGHT - PAD, Math.max(PAD, sy(value)))
  }

  const axisY = plot.axis === 'horizontal' ? sy(plot.axisValue) : null
  const axisX = plot.axis === 'vertical' ? sx(plot.axisValue) : null

  return (
    <div className="plot-block">
      <div className="plot-toolbar segmented small" role="group" aria-label="函数图像视图">
        <button type="button" className={view === 'curve' ? 'active' : ''} onClick={() => setView('curve')}>
          函数图像
        </button>
        <button type="button" className={view === 'area-x' ? 'active' : ''} onClick={() => setView('area-x')}>
          与 x 轴围成
        </button>
        <button type="button" className={view === 'area-y' ? 'active' : ''} onClick={() => setView('area-y')}>
          与 y 轴围成
        </button>
      </div>
      <div className="plot-wrap">
      <svg
        ref={svgRef}
        className="plot"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        onPointerMove={handlePointerMove}
        onPointerUp={() => setDragging(null)}
        onPointerLeave={() => setDragging(null)}
      >
        <defs>
          <linearGradient id="band" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(79, 163, 255, 0.16)" />
            <stop offset="100%" stopColor="rgba(79, 163, 255, 0.05)" />
          </linearGradient>
        </defs>

        <rect x={0} y={0} width={WIDTH} height={HEIGHT} fill="#0b1017" />

        {/* 积分区间高亮 */}
        <rect
          x={bandLeft}
          y={PAD * 0.4}
          width={Math.max(0, bandRight - bandLeft)}
          height={HEIGHT - PAD * 0.8}
          fill="url(#band)"
        />

        {/* 面积视图的阴影区域 */}
        {view === 'area-x' && model && (
          <path
            d={shadeWithXAxis(model.spec.f.fn, lo, hi, sx, sy)}
            fill="rgba(143, 227, 176, 0.2)"
            stroke="rgba(143, 227, 176, 0.55)"
            strokeWidth={1.2}
          />
        )}
        {view === 'area-y' &&
          model &&
          areaInfo?.segments.map(([x0, x1], index) => (
            <path
              key={`shade-y-${index}`}
              d={shadeWithYAxis(model.spec.f.fn, x0, x1, sx, sy)}
              fill="rgba(143, 227, 176, 0.18)"
              stroke="rgba(143, 227, 176, 0.5)"
              strokeWidth={1.1}
            />
          ))}

        {/* 坐标轴：面积视图下强调对应的坐标轴，其余视图显示旋转轴 */}
        {view === 'area-x' ? (
          <>
            <line x1={PAD} x2={WIDTH - PAD} y1={sy(0)} y2={sy(0)} stroke="#8fe3b0" strokeWidth={1.5} />
            <text x={WIDTH - PAD - 4} y={sy(0) - 7} textAnchor="end" className="plot-label area-axis">
              x 轴
            </text>
          </>
        ) : view === 'area-y' ? (
          <>
            <line x1={sx(0)} x2={sx(0)} y1={PAD} y2={HEIGHT - PAD} stroke="#8fe3b0" strokeWidth={1.5} />
            <text x={sx(0) + 6} y={PAD + 12} className="plot-label area-axis">
              y 轴
            </text>
          </>
        ) : plot.axis === 'horizontal' ? (
          <>
            {Math.abs(plot.axisValue) > 1e-9 && (
              <line
                x1={PAD}
                x2={WIDTH - PAD}
                y1={sy(0)}
                y2={sy(0)}
                stroke="#223040"
                strokeWidth={1}
                strokeDasharray="2 4"
              />
            )}
            <line
              x1={PAD}
              x2={WIDTH - PAD}
              y1={axisY ?? 0}
              y2={axisY ?? 0}
              stroke="#c98a3c"
              strokeWidth={1.6}
            />
            <text x={WIDTH - PAD - 4} y={(axisY ?? 0) - 7} textAnchor="end" className="plot-label axis">
              {`y = ${formatNumber(plot.axisValue, 3)}`}
            </text>
          </>
        ) : (
          <>
            {Math.abs(plot.axisValue) > 1e-9 && (
              <line
                x1={sx(0)}
                x2={sx(0)}
                y1={PAD}
                y2={HEIGHT - PAD}
                stroke="#223040"
                strokeWidth={1}
                strokeDasharray="2 4"
              />
            )}
            <line
              x1={axisX ?? 0}
              x2={axisX ?? 0}
              y1={PAD}
              y2={HEIGHT - PAD}
              stroke="#c98a3c"
              strokeWidth={1.6}
            />
            <text x={(axisX ?? 0) + 6} y={PAD + 12} className="plot-label axis">
              {`x = ${formatNumber(plot.axisValue, 3)}`}
            </text>
          </>
        )}

        {/* 下边界 g(x) */}
        {view === 'curve' && (
          <path
            d={buildPath(plot.g, sx, sy)}
            fill="none"
            stroke="#3f5872"
            strokeWidth={1.4}
            strokeDasharray="5 4"
          />
        )}

        {/* 主曲线 f(x) */}
        <path d={buildPath(plot.f, sx, sy)} fill="none" stroke="#5fb2ff" strokeWidth={2.2} />

        {/* 断点标红 */}
        {plot.breaks.map((x, index) => (
          <g key={`break-${index}`}>
            <line
              x1={sx(x)}
              x2={sx(x)}
              y1={PAD}
              y2={HEIGHT - PAD}
              stroke="rgba(255, 107, 107, 0.45)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <circle cx={sx(x)} cy={HEIGHT - PAD - 6} r={4} fill="#ff6b6b" />
          </g>
        ))}

        {/* 与旋转轴的交点 */}
        {view === 'curve' &&
          plot.roots.map((x, index) => (
            <circle
              key={`root-${index}`}
              cx={sx(x)}
              cy={plot.axis === 'horizontal' ? sy(plot.axisValue) : sy(0)}
              r={3.5}
              fill="#0b1017"
              stroke="#ffb454"
              strokeWidth={1.6}
            />
          ))}

        {/* 端点竖线 */}
        <line
          x1={bandLeft}
          x2={bandLeft}
          y1={PAD * 0.4}
          y2={HEIGHT - PAD * 0.4}
          stroke="rgba(120, 190, 255, 0.5)"
          strokeWidth={1}
        />
        <line
          x1={bandRight}
          x2={bandRight}
          y1={PAD * 0.4}
          y2={HEIGHT - PAD * 0.4}
          stroke="rgba(120, 190, 255, 0.5)"
          strokeWidth={1}
        />

        {/* 可拖拽的端点手柄 */}
        <g
          className="plot-handle"
          onPointerDown={(event) => {
            event.preventDefault()
            svgRef.current?.setPointerCapture(event.pointerId)
            setDragging('a')
          }}
        >
          <circle cx={bandLeft} cy={handleY(a)} r={9} fill="rgba(95, 178, 255, 0.18)" />
          <circle cx={bandLeft} cy={handleY(a)} r={5} fill="#5fb2ff" stroke="#0b1017" strokeWidth={1.4} />
          <text x={bandLeft} y={PAD - 6} textAnchor="middle" className="plot-label handle">
            a
          </text>
        </g>
        <g
          className="plot-handle"
          onPointerDown={(event) => {
            event.preventDefault()
            svgRef.current?.setPointerCapture(event.pointerId)
            setDragging('b')
          }}
        >
          <circle cx={bandRight} cy={handleY(b)} r={9} fill="rgba(95, 178, 255, 0.18)" />
          <circle cx={bandRight} cy={handleY(b)} r={5} fill="#5fb2ff" stroke="#0b1017" strokeWidth={1.4} />
          <text x={bandRight} y={PAD - 6} textAnchor="middle" className="plot-label handle">
            b
          </text>
        </g>
      </svg>
      <div className="plot-caption">
        <span>{view === 'curve' ? '拖动蓝色端点可直接调整积分上下限' : '拖动端点会同步更新面积'}</span>
        <span className="plot-legend">
          <i className="dot f" /> f(x)
          {view === 'curve' ? (
            <>
              <i className="dot g" /> g(x) 下边界
              <i className="dot axis" /> 旋转轴
            </>
          ) : (
            <>
              <i className="dot area" /> 围成的面积
            </>
          )}
          {plot.breaks.length > 0 && (
            <>
              <i className="dot break" /> 断点
            </>
          )}
        </span>
      </div>
      {view !== 'curve' && (
        <div className="plot-area">
          {areaInfo ? (
            <>
              <span className="plot-area-value">
                面积 S = <strong>{formatNumber(areaInfo.value, 6)}</strong>
              </span>
              <span className="plot-area-formula">
                {view === 'area-x' ? 'S = ∫ₐᵇ |f(x)| dx' : 'S = Σ |∫ x dy|'}
              </span>
              {view === 'area-y' && !areaInfo.monotone && (
                <span className="plot-area-note">
                  f(x) 不单调，已按 {areaInfo.segments.length} 个单调段分别累加
                </span>
              )}
            </>
          ) : (
            <span className="plot-area-note">当前输入下无法计算该面积</span>
          )}
        </div>
      )}
      <span className="plot-mode">{mode === 'volume' ? '体积模式' : '表面积模式'}</span>
      </div>
    </div>
  )
}
