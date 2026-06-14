// components/ProgressBar.jsx
// Saffron progress strip — the signature UI element.
// Fills left-to-right as the student moves through the 5 exam steps.

const STEPS = [
  { key: 'login',    label: 'লগইন' },
  { key: 'select',   label: 'বিষয়' },
  { key: 'paper',    label: 'প্রশ্ন' },
  { key: 'upload',   label: 'উত্তর' },
  { key: 'results',  label: 'ফলাফল' },
]

const STEP_INDEX = Object.fromEntries(STEPS.map((s, i) => [s.key, i]))

export default function ProgressBar({ currentStep }) {
  const current = STEP_INDEX[currentStep] ?? 0
  const pct = ((current) / (STEPS.length - 1)) * 100

  return (
    <div className="w-full max-w-app mx-auto px-4 pt-4 pb-2">
      {/* Track */}
      <div className="relative h-1.5 bg-border rounded-full overflow-hidden">
        <div
          className="absolute left-0 top-0 h-full bg-saffron rounded-full progress-fill"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Step dots + labels */}
      <div className="flex justify-between mt-2">
        {STEPS.map((step, i) => {
          const done    = i < current
          const active  = i === current
          return (
            <div key={step.key} className="flex flex-col items-center gap-0.5">
              <div className={`
                w-2 h-2 rounded-full transition-all duration-300
                ${done   ? 'bg-forest scale-100' : ''}
                ${active ? 'bg-saffron scale-125 ring-2 ring-saffron/30' : ''}
                ${!done && !active ? 'bg-border' : ''}
              `} />
              <span className={`
                text-[10px] font-ui transition-colors duration-300
                ${active ? 'text-saffron font-semibold' : ''}
                ${done   ? 'text-forest' : ''}
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
