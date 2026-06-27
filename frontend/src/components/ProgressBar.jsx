// components/ProgressBar.jsx
// Progress strip with home button on the left

import { useNavigate } from 'react-router-dom'

const STEPS = [
  { key: 'select',     label: 'বিষয়'  },
  { key: 'paper',      label: 'অংশ ১' },
  { key: 'transition', label: 'বিরতি' },
  { key: 'upload',     label: 'অংশ ২' },
  { key: 'results',    label: 'ফলাফল' },
]

const STEP_INDEX = Object.fromEntries(STEPS.map((s, i) => [s.key, i]))

export default function ProgressBar({ currentStep }) {
  const navigate = useNavigate()
  const current  = STEP_INDEX[currentStep] ?? 0
  const pct      = (current / (STEPS.length - 1)) * 100
  const isHome   = currentStep === 'select'

  return (
    <div className="w-full max-w-app mx-auto px-4 pt-3 pb-2">
      {/* Top row: home button + bar */}
      <div className="flex items-center gap-2 mb-1">
        {/* Home button — hidden on the home page itself */}
        {!isHome && (
          <button
            onClick={() => navigate('/exam/select')}
            title="হোম পেজে যান"
            className="flex-shrink-0 w-7 h-7 rounded-full bg-white border border-border
              flex items-center justify-center text-sm text-ink-light
              hover:border-saffron hover:text-saffron transition-all"
          >
            🏠
          </button>
        )}

        {/* Progress bar */}
        <div className="flex-1 relative h-1.5 bg-border rounded-full overflow-hidden">
          <div
            className="absolute left-0 top-0 h-full bg-saffron rounded-full progress-fill"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Step labels */}
      <div className={`flex justify-between ${!isHome ? 'pl-9' : ''}`}>
        {STEPS.map((step, i) => {
          const done   = i < current
          const active = i === current
          return (
            <div key={step.key} className="flex flex-col items-center gap-0.5">
              <div className={`
                w-2 h-2 rounded-full transition-all duration-300
                ${done   ? 'bg-forest scale-100'                        : ''}
                ${active ? 'bg-saffron scale-125 ring-2 ring-saffron/30' : ''}
                ${!done && !active ? 'bg-border'                         : ''}
              `} />
              <span className={`
                text-[10px] font-ui transition-colors duration-300
                ${active ? 'text-saffron font-semibold' : ''}
                ${done   ? 'text-forest'                : ''}
                ${!done && !active ? 'text-ink-light/50' : ''}
              `}>
                {step.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
