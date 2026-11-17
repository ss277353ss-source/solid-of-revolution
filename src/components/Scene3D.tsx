import { Canvas, useThree } from '@react-three/fiber'
import { Html, Line, OrbitControls } from '@react-three/drei'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { AnalysisModel } from '../math/analyze'
import { buildMicroElements, type MicroElement } from '../math/solids'
import type { DisplayMode } from '../types'

export interface Scene3DProps {
  model: AnalysisModel | null
  /** 扫出的角度（0–360） */
  sweep: number
  /** 微元数量（4–200） */
  count: number
  display: DisplayMode
  showSurface: boolean
  showElements: boolean
  /** 高亮的微元下标，-1 表示不高亮 */
  highlight: number
}

const SURFACE_COLOR = '#4d9de0'
const HIGHLIGHT_COLOR = '#ffc46b'

/** 生成旋转曲面的 BufferGeometry */
function buildSurfaceGeometry(
  model: AnalysisModel,
  sweepDegrees: number,
  radialSegments: number,
): THREE.BufferGeometry | null {
  const { spec } = model
  const sampleCount = 150
  const xs: number[] = []
  const ys: number[] = []

  for (let i = 0; i <= sampleCount; i += 1) {
    const x = spec.a + ((spec.b - spec.a) * i) / sampleCount
    const y = spec.f.fn(x)
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    xs.push(x)
    ys.push(y)
  }

  if (xs.length < 2) return null

  const sweep = THREE.MathUtils.degToRad(Math.min(360, Math.max(0, sweepDegrees)))
  if (sweep < 0.002) return null

  const columns = Math.max(2, radialSegments) + 1
  const rows = xs.length
  const positions = new Float32Array(rows * columns * 3)
  const indices: number[] = []

  for (let row = 0; row < rows; row += 1) {
    const x = xs[row]
    const y = ys[row]
    for (let column = 0; column < columns; column += 1) {
      const theta = (sweep * column) / (columns - 1)
      const cos = Math.cos(theta)
      const sin = Math.sin(theta)
      let px: number
      let py: number
      let pz: number
      if (spec.axis === 'horizontal') {
        const radius = y - spec.k
        px = x
        py = spec.k + radius * cos
        pz = radius * sin
      } else {
        const radius = x - spec.k
        px = spec.k + radius * cos
        py = y
        pz = radius * sin
      }
      const offset = (row * columns + column) * 3
      positions[offset] = px
      positions[offset + 1] = py
      positions[offset + 2] = pz
    }
  }

  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const a = row * columns + column
      const b = a + 1
      const c = a + columns
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

/** 生成母线旋转到 angle 后的曲线点 */
function generatrixPoints(model: AnalysisModel, angleRadians: number): Array<[number, number, number]> {
  const { spec } = model
  const points: Array<[number, number, number]> = []
  const steps = 160
  const cos = Math.cos(angleRadians)
  const sin = Math.sin(angleRadians)

  for (let i = 0; i <= steps; i += 1) {
    const x = spec.a + ((spec.b - spec.a) * i) / steps
    const y = spec.f.fn(x)
    if (!Number.isFinite(y)) continue
    if (spec.axis === 'horizontal') {
      const radius = y - spec.k
      points.push([x, spec.k + radius * cos, radius * sin])
    } else {
      const radius = x - spec.k
      points.push([spec.k + radius * cos, y, radius * sin])
    }
  }
  return points
}

/** 旋转曲线（θ = 0）在 3D 中的点 */
function curvePoints(model: AnalysisModel): Array<[number, number, number]> {
  const { spec } = model
  const points: Array<[number, number, number]> = []
  for (let i = 0; i <= 160; i += 1) {
    const x = spec.a + ((spec.b - spec.a) * i) / 160
    const y = spec.f.fn(x)
    if (!Number.isFinite(y)) continue
    points.push([x, y, 0])
  }
  return points
}

/** 自动取景：半径变化超过 20% 时才重新摆放相机，避免拖动滑块时视角乱跳 */
function CameraRig({ radius }: { radius: number }) {
  const { camera, controls } = useThree()
  const lastRadius = useRef(0)

  useEffect(() => {
    const previous = lastRadius.current
    const changed =
      previous === 0 || Math.abs(radius - previous) / Math.max(radius, 1e-6) > 0.2
    if (!changed) return
    lastRadius.current = radius

    const distance = Math.max(radius, 0.4) * 2.9
    // 主要沿 +Z 方向观察，让旋转轴的走向在画面里横向展开，
    // 避免正对旋转体的圆形端面而看不清母线轮廓。
    camera.position.set(distance * 0.34, distance * 0.46, distance * 0.94)
    camera.near = Math.max(radius / 400, 0.0005)
    camera.far = Math.max(radius * 400, 50)
    camera.updateProjectionMatrix()
    const orbit = controls as unknown as { target?: THREE.Vector3; update?: () => void } | null
    orbit?.target?.set(0, 0, 0)
    orbit?.update?.()
  }, [camera, controls, radius])

  return null
}

function materialFor(display: DisplayMode, highlighted: boolean, opacityOverride?: number) {
  const color = highlighted ? HIGHLIGHT_COLOR : SURFACE_COLOR
  if (display === 'wireframe') {
    return (
      <meshBasicMaterial
        color={color}
        wireframe
        transparent
        opacity={highlighted ? 0.95 : 0.6}
      />
    )
  }
  if (display === 'translucent') {
    return (
      <meshStandardMaterial
        color={color}
        transparent
        opacity={highlighted ? 0.85 : (opacityOverride ?? 0.32)}
        depthWrite={false}
        depthTest={!highlighted}
        side={THREE.DoubleSide}
        roughness={0.5}
        metalness={0.08}
      />
    )
  }
  return (
    <meshStandardMaterial
      color={color}
      roughness={0.42}
      metalness={0.18}
      side={THREE.DoubleSide}
      transparent={opacityOverride !== undefined}
      opacity={opacityOverride ?? 1}
      depthTest={!highlighted}
      emissive={highlighted ? '#ff8a00' : '#000000'}
      emissiveIntensity={highlighted ? 0.35 : 0}
    />
  )
}

function WasherElement({
  element,
  k,
  display,
  highlighted,
  segments,
}: {
  element: Extract<MicroElement, { kind: 'washer' }>
  k: number
  display: DisplayMode
  highlighted: boolean
  segments: number
}) {
  const geometry = useMemo(() => {
    const half = Math.max((element.x1 - element.x0) / 2, 1e-5)
    const outer = Math.max(element.outer, 1e-5)
    if (element.inner < outer * 0.02) {
      return new THREE.CylinderGeometry(outer, outer, half * 2, segments, 1, false)
    }
    const inner = Math.max(element.inner, 1e-5)
    const profile = [
      new THREE.Vector2(inner, -half),
      new THREE.Vector2(outer, -half),
      new THREE.Vector2(outer, half),
      new THREE.Vector2(inner, half),
      new THREE.Vector2(inner, -half),
    ]
    return new THREE.LatheGeometry(profile, segments)
  }, [element, segments])

  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <mesh
      geometry={geometry}
      position={[element.center, k, 0]}
      rotation={[0, 0, -Math.PI / 2]}
      renderOrder={highlighted ? 10 : 0}
    >
      {materialFor(display, highlighted, display === 'shaded' ? 0.92 : undefined)}
    </mesh>
  )
}

function ShellElement({
  element,
  k,
  display,
  highlighted,
  segments,
}: {
  element: Extract<MicroElement, { kind: 'shell' }>
  k: number
  display: DisplayMode
  highlighted: boolean
  segments: number
}) {
  const geometry = useMemo(() => {
    const half = Math.max((element.x1 - element.x0) / 2, 1e-5)
    const height = Math.max(element.height, 1e-4)
    const outer = Math.max(element.radius + half, 1e-5)
    const inner = Math.max(element.radius - half, 1e-5)
    const profile = [
      new THREE.Vector2(inner, -height / 2),
      new THREE.Vector2(outer, -height / 2),
      new THREE.Vector2(outer, height / 2),
      new THREE.Vector2(inner, height / 2),
      new THREE.Vector2(inner, -height / 2),
    ]
    return new THREE.LatheGeometry(profile, segments)
  }, [element, segments])

  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <mesh
      geometry={geometry}
      position={[k, element.centerY, 0]}
      renderOrder={highlighted ? 10 : 0}
    >
      {materialFor(display, highlighted, display === 'shaded' ? 0.92 : undefined)}
    </mesh>
  )
}

function AxisLine({ model }: { model: AnalysisModel }) {
  const { spec } = model
  const span = Math.max(Math.abs(spec.b - spec.a), 0.2)
  const points = useMemo<Array<[number, number, number]>>(() => {
    if (spec.axis === 'horizontal') {
      return [
        [spec.a - span * 0.35, spec.k, 0],
        [spec.b + span * 0.35, spec.k, 0],
      ]
    }
    let minY = Number.POSITIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    for (let i = 0; i <= 60; i += 1) {
      const x = spec.a + ((spec.b - spec.a) * i) / 60
      const y = spec.f.fn(x)
      if (Number.isFinite(y)) {
        minY = Math.min(minY, y)
        maxY = Math.max(maxY, y)
      }
    }
    if (!Number.isFinite(minY) || !Number.isFinite(maxY)) {
      minY = -1
      maxY = 1
    }
    const pad = Math.max((maxY - minY) * 0.3, 0.15)
    return [
      [spec.k, minY - pad, 0],
      [spec.k, maxY + pad, 0],
    ]
  }, [spec, span])

  return (
    <>
      <Line points={points} color="#c98a3c" lineWidth={2} dashed dashSize={0.06} gapSize={0.04} />
      <Html
        position={points[points.length - 1]}
        style={{ pointerEvents: 'none' }}
        center
      >
        <span className="scene-label axis">
          {model.spec.axis === 'horizontal' ? 'y' : 'x'} = {Number(model.spec.k.toFixed(3))}
        </span>
      </Html>
    </>
  )
}

function HighlightAnnotation({
  element,
  model,
}: {
  element: MicroElement | null
  model: AnalysisModel
}) {
  const scale = Math.max(model.extent.radius * 0.05, 0.01)
  if (!element) return null

  if (element.kind === 'washer') {
    const k = model.spec.k
    const top = k + element.outer
    const bottom = k + element.inner
    return (
      <group>
        {element.inner > 1e-6 && (
          <>
            <Line
              points={[
                [element.center, k, 0],
                [element.center, bottom, 0],
              ]}
              color="#8fe3b0"
              lineWidth={2}
            />
            <Html position={[element.center, (k + bottom) / 2, 0]} center style={{ pointerEvents: 'none' }}>
              <span className="scene-label dim">内半径 {element.inner.toFixed(3)}</span>
            </Html>
          </>
        )}
        <Line
          points={[
            [element.center, k, 0],
            [element.center, top, 0],
          ]}
          color="#ffb454"
          lineWidth={2}
        />
        <Html
          position={[element.center, (k + top) / 2 + scale * 0.5, 0]}
          center
          style={{ pointerEvents: 'none' }}
        >
          <span className="scene-label">r = {element.outer.toFixed(3)}</span>
        </Html>
        <Line
          points={[
            [element.x0, top + scale, 0],
            [element.x1, top + scale, 0],
          ]}
          color="#8fe3b0"
          lineWidth={2}
        />
        <Html
          position={[element.center, top + scale * 4, 0]}
          center
          style={{ pointerEvents: 'none' }}
        >
          <span className="scene-label dim">dx = {(element.x1 - element.x0).toFixed(4)}</span>
        </Html>
      </group>
    )
  }

  const k = model.spec.k
  const centerX = k + element.radius
  return (
    <group>
      <Line
        points={[
          [k, element.centerY, 0],
          [centerX, element.centerY, 0],
        ]}
        color="#ffb454"
        lineWidth={2}
      />
      <Html
        position={[(k + centerX) / 2, element.centerY + scale, 0]}
        center
        style={{ pointerEvents: 'none' }}
      >
        <span className="scene-label">r = {element.radius.toFixed(3)}</span>
      </Html>
      <Line
        points={[
          [centerX, element.centerY - element.height / 2, 0],
          [centerX, element.centerY + element.height / 2, 0],
        ]}
        color="#8fe3b0"
        lineWidth={2}
      />
      <Html
        position={[centerX + scale * 0.4, element.centerY + element.height / 2 + scale, 0]}
        center
        style={{ pointerEvents: 'none' }}
      >
        <span className="scene-label dim">h = {element.height.toFixed(3)}</span>
      </Html>
    </group>
  )
}

function SceneContent({
  model,
  sweep,
  count,
  display,
  showSurface,
  showElements,
  highlight,
}: Scene3DProps & { model: AnalysisModel }) {
  const [centerX, centerY] = model.extent.center
  const radius = Math.max(model.extent.radius, 0.3)

  const surfaceGeometry = useMemo(() => {
    if (!showSurface) return null
    return buildSurfaceGeometry(model, sweep, count > 120 ? 48 : 80)
  }, [model, sweep, showSurface, count])

  useEffect(() => () => surfaceGeometry?.dispose(), [surfaceGeometry])

  const elements = useMemo(() => {
    if (!showElements) return []
    return buildMicroElements(model.spec, count).filter((element) => {
      if (element.kind === 'washer') {
        return Number.isFinite(element.outer) && Number.isFinite(element.inner)
      }
      return Number.isFinite(element.radius) && Number.isFinite(element.height)
    })
  }, [model, count, showElements])

  const segments = count > 120 ? 16 : count > 60 ? 24 : 36
  const highlightedElement = elements.find((element) => element.index === highlight) ?? null
  const sweepRadians = THREE.MathUtils.degToRad(sweep)

  // drei 的 Line 在点数少于 2 时会让底层 LineGeometry 抛 RangeError，
  // 进而导致整棵 React 树被卸载（表现为整页黑屏），这里先过滤掉。
  const curve = curvePoints(model)
  const generatrix = sweep > 1 && sweep < 359 ? generatrixPoints(model, sweepRadians) : []

  const surfaceOpacity = showElements ? (display === 'shaded' ? 0.16 : undefined) : undefined

  return (
    <group position={[-centerX, -centerY, 0]}>
      <CameraRig radius={radius} />

      <gridHelper
        args={[radius * 4.2, 18, '#1b2836', '#121a24']}
        position={[0, -radius * 1.05, 0]}
      />

      <AxisLine model={model} />

      {surfaceGeometry && (
        <mesh geometry={surfaceGeometry}>
          {materialFor(display, false, surfaceOpacity)}
        </mesh>
      )}

      {elements.map((element) =>
        element.kind === 'washer' ? (
          <WasherElement
            key={`w-${element.index}`}
            element={element}
            k={model.spec.k}
            display={display}
            highlighted={element.index === highlight}
            segments={segments}
          />
        ) : (
          <ShellElement
            key={`s-${element.index}`}
            element={element}
            k={model.spec.k}
            display={display}
            highlighted={element.index === highlight}
            segments={segments}
          />
        ),
      )}

      {curve.length >= 2 && <Line points={curve} color="#5fb2ff" lineWidth={2.4} />}
      {generatrix.length >= 2 && (
        <Line points={generatrix} color="#8fc4ff" lineWidth={1.4} dashed dashSize={0.05} gapSize={0.04} />
      )}

      <HighlightAnnotation element={highlightedElement} model={model} />
    </group>
  )
}

export function Scene3D(props: Scene3DProps) {
  const { model } = props

  if (!model) {
    return (
      <div className="scene-empty">
        <div>
          <strong>暂时无法绘制立体</strong>
          <p>请先修正右侧提示中的表达式或积分区间。</p>
        </div>
      </div>
    )
  }

  return (
    <div className="scene">
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [3, 2, 4], fov: 45, near: 0.01, far: 500 }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={['#080c12']} />
        <ambientLight intensity={0.65} />
        <hemisphereLight args={['#9fd0ff', '#0a1018', 0.45]} />
        <directionalLight position={[6, 9, 7]} intensity={1.35} />
        <directionalLight position={[-7, -5, -6]} intensity={0.4} />
        <SceneContent {...props} model={model} />
        <OrbitControls makeDefault enableDamping dampingFactor={0.09} />
      </Canvas>
      <div className="scene-hint">左键拖动旋转 · 滚轮缩放 · 右键平移</div>
    </div>
  )
}
