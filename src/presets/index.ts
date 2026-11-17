import type { Config } from '../types'

export interface Preset {
  id: string
  title: string
  formula: string
  /** 这个例子的直觉 */
  intuition: string
  config: Config
}

export const DEFAULT_CONFIG: Config = {
  fExpr: 'x^2',
  gExpr: '0',
  axis: 'horizontal',
  k: 0,
  a: 0,
  b: 1,
  mode: 'volume',
  tolerance: 1e-9,
}

export const PRESETS: Preset[] = [
  {
    id: 'parabola',
    title: '抛物线 y = x²',
    formula: 'y = x^2, [0, 1], 绕 x 轴',
    intuition:
      '曲线越往右越陡，扫出的立体像一个被拉长的喇叭。π/5 远小于同底圆柱的 π，因为半径是平方增长的。',
    config: {
      ...DEFAULT_CONFIG,
      fExpr: 'x^2',
      gExpr: '0',
      a: 0,
      b: 1,
      mode: 'volume',
    },
  },
  {
    id: 'sqrt',
    title: '根号 y = √x',
    formula: 'y = sqrt(x), [0, 1], 绕 x 轴',
    intuition:
      '它和 y = x² 互为反函数，但扫出的立体不一样：√x 的“肚子”更鼓，体积是 π/2，是抛物线立体的 2.5 倍。',
    config: {
      ...DEFAULT_CONFIG,
      fExpr: 'sqrt(x)',
      gExpr: '0',
      a: 0,
      b: 1,
      mode: 'volume',
    },
  },
  {
    id: 'reciprocal',
    title: '双曲线 y = 1/x',
    formula: 'y = 1/x, [1, 2], 绕 x 轴',
    intuition:
      '加百列号角的一段：越往右越细。把区间拉到无穷，侧面积发散而体积收敛于 π，这就是“装不满的号角”。',
    config: {
      ...DEFAULT_CONFIG,
      fExpr: '1/x',
      gExpr: '0',
      a: 1,
      b: 2,
      mode: 'volume',
    },
  },
  {
    id: 'sphere',
    title: '上半圆（球）',
    formula: 'y = sqrt(1 - x^2), [-1, 1], 绕 x 轴',
    intuition:
      '半圆绕直径旋转就得到球。阿基米德最得意的结论：球体积 4π/3 恰好是外接圆柱体积的 2/3。',
    config: {
      ...DEFAULT_CONFIG,
      fExpr: 'sqrt(1-x^2)',
      gExpr: '0',
      a: -1,
      b: 1,
      mode: 'volume',
    },
  },
  {
    id: 'circle',
    title: '整圆（上下两支）',
    formula: 'y = ±sqrt(1 - x^2), [-1, 1], 绕 x 轴',
    intuition:
      '两条边界分居旋转轴两侧，截面是实心圆盘而不是圆环；体积仍是 4π/3，可在推导里看到内半径被判为 0。',
    config: {
      ...DEFAULT_CONFIG,
      fExpr: 'sqrt(1-x^2)',
      gExpr: '-sqrt(1-x^2)',
      a: -1,
      b: 1,
      mode: 'volume',
    },
  },
  {
    id: 'sine',
    title: '正弦 y = sin x',
    formula: 'y = sin(x), [0, π], 绕 x 轴',
    intuition:
      '一个完整波峰扫出中间鼓起、两端收尖的立体。体积是 π²/2，正好是半个圆柱的体积。',
    config: {
      ...DEFAULT_CONFIG,
      fExpr: 'sin(x)',
      gExpr: '0',
      a: 0,
      b: Math.PI,
      mode: 'volume',
    },
  },
  {
    id: 'cone',
    title: '圆锥 y = x',
    formula: 'y = x, [0, 1], 绕 x 轴',
    intuition:
      '直线扫出圆锥：底半径 1、高 1，体积 π/3，恰好是同底等高圆柱的三分之一。',
    config: {
      ...DEFAULT_CONFIG,
      fExpr: 'x',
      gExpr: '0',
      a: 0,
      b: 1,
      mode: 'volume',
    },
  },
  {
    id: 'offset',
    title: '绕 y = −1 旋转',
    formula: 'y = x^2, [0, 1], 绕 y = -1',
    intuition:
      '轴被下移了 1，截面变成外半径 x²+1、内半径 1 的圆环。体积从 π/5 涨到 13π/15。',
    config: {
      ...DEFAULT_CONFIG,
      fExpr: 'x^2',
      gExpr: '0',
      a: 0,
      b: 1,
      k: -1,
      mode: 'volume',
    },
  },
  {
    id: 'vertical',
    title: '绕 y 轴（柱壳法）',
    formula: 'y = x^2, [0, 1], 绕 x = 0',
    intuition:
      '换成竖直轴，切片方向也变了：沿 x 切出的竖条卷起来是空心圆柱壳，体积用 2π∫x·f(x)dx。',
    config: {
      ...DEFAULT_CONFIG,
      fExpr: 'x^2',
      gExpr: '0',
      a: 0,
      b: 1,
      axis: 'vertical',
      k: 0,
      mode: 'volume',
    },
  },
  {
    id: 'surface',
    title: '表面积：球面',
    formula: 'y = sqrt(1 - x^2), [-1, 1], 绕 x 轴',
    intuition:
      '同一道题切到表面积：弧长微元 √(1 + f′²) 让结果变成 4π，恰好是球面积公式。',
    config: {
      ...DEFAULT_CONFIG,
      fExpr: 'sqrt(1-x^2)',
      gExpr: '0',
      a: -1,
      b: 1,
      mode: 'surface',
    },
  },
]
