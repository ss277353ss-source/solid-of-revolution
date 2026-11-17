import type { DerivationStep } from '../types'
import { Tex } from './Tex'

interface DerivationPanelProps {
  steps: DerivationStep[]
  methodLabel: string
  methodReason: string
}

export function DerivationPanel({ steps, methodLabel, methodReason }: DerivationPanelProps) {
  return (
    <section className="card derivation-card">
      <div className="card-head">
        <h2>推导过程</h2>
        {methodLabel ? <span className="badge-soft">{methodLabel}</span> : null}
      </div>

      {steps.length === 0 ? (
        <p className="muted">
          输入合法的曲线表达式与区间后，这里会实时给出通用公式、代入、求导、化简、数值与解析解六步推导。
        </p>
      ) : (
        <>
          <p className="method-reason">{methodReason}</p>
          <ol className="steps">
            {steps.map((step, index) => (
              <li className="step" key={step.title}>
                <div className="step-title">
                  <span className="step-index">{String(index + 1).padStart(2, '0')}</span>
                  {step.title.replace(/^[①②③④⑤⑥]\s*/, '')}
                </div>
                <div className="step-body">
                  <Tex tex={step.tex} display />
                </div>
                {step.note && <p className="step-note">{step.note}</p>}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  )
}
