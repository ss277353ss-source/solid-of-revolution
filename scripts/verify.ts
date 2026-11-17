/**
 * 验收脚本：把 README 中的硬性用例全部跑一遍。
 * 运行：npm run verify
 */
import { analyze } from '../src/math/analyze'
import type { Config } from '../src/types'

interface VerifyCase {
  title: string
  config: Config
  expected: number
  expectedText: string
}

const base: Omit<Config, 'fExpr' | 'axis' | 'k' | 'a' | 'b' | 'mode'> = {
  gExpr: '0',
  tolerance: 1e-11,
}

const cases: VerifyCase[] = [
  {
    title: 'y = x²  [0,1]  绕 x 轴  体积',
    config: { ...base, fExpr: 'x^2', axis: 'horizontal', k: 0, a: 0, b: 1, mode: 'volume' },
    expected: Math.PI / 5,
    expectedText: 'π/5',
  },
  {
    title: 'y = x²  [0,1]  绕 x 轴  表面积',
    config: { ...base, fExpr: 'x^2', axis: 'horizontal', k: 0, a: 0, b: 1, mode: 'surface' },
    expected: (Math.PI * (18 * Math.sqrt(5) - Math.asinh(2))) / 32,
    expectedText: 'π(18√5 − asinh2)/32',
  },
  {
    title: 'y = √(1−x²)  [−1,1]  绕 x 轴  体积',
    config: { ...base, fExpr: 'sqrt(1-x^2)', axis: 'horizontal', k: 0, a: -1, b: 1, mode: 'volume' },
    expected: (4 * Math.PI) / 3,
    expectedText: '4π/3',
  },
  {
    title: 'y = √(1−x²)  [−1,1]  绕 x 轴  表面积',
    config: { ...base, fExpr: 'sqrt(1-x^2)', axis: 'horizontal', k: 0, a: -1, b: 1, mode: 'surface' },
    expected: 4 * Math.PI,
    expectedText: '4π',
  },
  {
    title: 'y = x  [0,1]  绕 x 轴  体积',
    config: { ...base, fExpr: 'x', axis: 'horizontal', k: 0, a: 0, b: 1, mode: 'volume' },
    expected: Math.PI / 3,
    expectedText: 'π/3',
  },
  {
    title: 'y = x  [0,1]  绕 x 轴  表面积',
    config: { ...base, fExpr: 'x', axis: 'horizontal', k: 0, a: 0, b: 1, mode: 'surface' },
    expected: Math.PI * Math.SQRT2,
    expectedText: 'π√2',
  },
  {
    title: 'y = 1/x  [1,2]  绕 x 轴  体积',
    config: { ...base, fExpr: '1/x', axis: 'horizontal', k: 0, a: 1, b: 2, mode: 'volume' },
    expected: Math.PI / 2,
    expectedText: 'π/2',
  },
  {
    title: 'y = x²  [0,1]  绕 y = −1  体积',
    config: { ...base, fExpr: 'x^2', axis: 'horizontal', k: -1, a: 0, b: 1, mode: 'volume' },
    expected: (13 * Math.PI) / 15,
    expectedText: '13π/15',
  },
]

function pad(text: string, width: number): string {
  const value = [...text]
  if (value.length >= width) return text
  return text + ' '.repeat(width - value.length)
}

let failures = 0
const rows: string[] = []

console.log('')
console.log('旋转体计算验收（相对误差阈值 1e-6）')
console.log('='.repeat(92))

for (const item of cases) {
  const analysis = analyze(item.config)
  if (!analysis.ok || !analysis.numeric) {
    const reason = analysis.errors.map((error) => error.message).join('；') || '未知错误'
    rows.push(`${pad(item.title, 34)} | 失败：${reason}`)
    failures += 1
    continue
  }
  const actual = analysis.numeric.value
  const relative = Math.abs(actual - item.expected) / Math.abs(item.expected)
  const passed = relative < 1e-6
  if (!passed) failures += 1
  rows.push(
    `${pad(item.title, 34)} | 期望 ${pad(item.expected.toFixed(9), 13)} | 实得 ${pad(
      actual.toFixed(9),
      13,
    )} | 相对误差 ${relative.toExponential(2)} | 方法 ${pad(
      analysis.model?.methodLabel ?? '-',
      6,
    )} | 误差估计 ${analysis.numeric.errorEstimate.toExponential(2)} | ${passed ? 'PASS' : 'FAIL'}`,
  )
}

for (const row of rows) console.log(row)
console.log('='.repeat(92))

if (failures > 0) {
  console.error(`\n${failures} 个用例未通过`)
  process.exit(1)
}

console.log(`\n全部 ${cases.length} 个用例通过（相对误差均 < 1e-6）`)
console.log(`期望值来源：${cases.map((item) => item.expectedText).join('，')}`)
