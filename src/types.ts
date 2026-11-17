/** 全局共享的类型定义 */

/** 旋转轴方向：horizontal 表示 y = k（水平轴），vertical 表示 x = k（垂直轴） */
export type AxisKind = 'horizontal' | 'vertical'

/** 体积计算方法 */
export type MethodKind = 'disk' | 'washer' | 'shell'

/** 计算模式 */
export type ModeKind = 'volume' | 'surface'

/** 3D 显示模式 */
export type DisplayMode = 'shaded' | 'wireframe' | 'translucent'

/** 用户的完整输入配置（可被编码进 URL hash 分享） */
export interface Config {
  /** 主曲线 y = f(x) */
  fExpr: string
  /** 旋转区域的下边界 y = g(x)，默认 "0"（即 x 轴） */
  gExpr: string
  axis: AxisKind
  /** 旋转轴偏移量：axis 为 horizontal 时表示 y = k，为 vertical 时表示 x = k */
  k: number
  a: number
  b: number
  mode: ModeKind
  /** 自适应 Simpson 的目标精度 */
  tolerance: number
}

/** 界面提示 */
export interface WarningItem {
  level: 'info' | 'warn' | 'error'
  message: string
}

/** 推导链中的一步 */
export interface DerivationStep {
  title: string
  tex: string
  note?: string
}
