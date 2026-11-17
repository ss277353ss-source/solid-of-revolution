import type { WarningItem } from '../types'

export function WarningList({ warnings }: { warnings: WarningItem[] }) {
  if (warnings.length === 0) {
    return (
      <section className="card warnings">
        <div className="card-head">
          <h2>检查与提示</h2>
          <span className="badge-soft ok">无异常</span>
        </div>
        <p className="muted">当前输入未触发任何边界情况，区间与函数在计算域内均有效。</p>
      </section>
    )
  }

  return (
    <section className="card warnings">
      <div className="card-head">
        <h2>检查与提示</h2>
        <span className="badge-soft">{warnings.length} 条</span>
      </div>
      <ul className="warning-list">
        {warnings.map((warning, index) => (
          <li key={index} className={`warning-item ${warning.level}`}>
            <span className="warning-dot" aria-hidden />
            <span>{warning.message}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
