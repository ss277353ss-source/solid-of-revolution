import type { Analysis } from '../math/analyze'
import { formatNumber } from '../math/analyze'
import type { Config } from '../types'
import { Tex } from './Tex'

interface ResultPanelProps {
  config: Config
  analysis: Analysis
  shareState: string
  onShare: () => void
}

export function ResultPanel({ config, analysis, shareState, onShare }: ResultPanelProps) {
  const numeric = analysis.numeric
  const symbol = config.mode === 'volume' ? 'V' : 'S'
  const label = config.mode === 'volume' ? '体积' : '表面积'

  return (
    <section className="card result-card">
      <div className="card-head">
        <h2>{label}结果</h2>
        {analysis.methodLabel ? (
          <span className="method-badge" title={analysis.model?.methodReason}>
            {analysis.methodLabel}
          </span>
        ) : (
          <span className="badge-soft">待计算</span>
        )}
      </div>

      {numeric ? (
        <>
          <div className="big-value">
            <span className="big-symbol">{symbol}</span>
            <span className="big-number">{numeric.value.toFixed(6)}</span>
          </div>
          {numeric.exactTex && numeric.exactValue !== null && (
            <p className="exact-line">
              精确值 <Tex tex={numeric.exactTex} /> = {numeric.exactValue.toFixed(6)}
            </p>
          )}

          <dl className="stats">
            <div>
              <dt>区间长度</dt>
              <dd>{formatNumber(numeric.intervalLength, 6)}</dd>
            </div>
            <div>
              <dt>被积函数最大值</dt>
              <dd>{formatNumber(numeric.maxIntegrand, 6)}</dd>
            </div>
            <div>
              <dt>Simpson 子区间</dt>
              <dd>{numeric.intervals}</dd>
            </div>
            <div>
              <dt>函数求值次数</dt>
              <dd>{numeric.evaluations}</dd>
            </div>
            <div>
              <dt>误差估计</dt>
              <dd>{numeric.errorEstimate.toExponential(2)}</dd>
            </div>
            <div>
              <dt>最大递归深度</dt>
              <dd>{numeric.maxDepth}</dd>
            </div>
          </dl>

          <button type="button" className="share-button" onClick={onShare}>
            {shareState || '复制分享链接'}
          </button>
          <p className="field-help tiny">
            参数会同时写进地址栏的 hash，刷新或转发链接都能还原当前这道题。
          </p>
        </>
      ) : (
        <div className="result-empty">
          <p>当前输入无法得到数值结果。</p>
          <p className="muted">请先处理下方列出的错误，再查看体积 / 表面积。</p>
        </div>
      )}
    </section>
  )
}
