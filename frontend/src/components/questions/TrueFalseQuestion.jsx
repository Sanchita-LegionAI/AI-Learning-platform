// components/questions/TrueFalseQuestion.jsx
export function TrueFalseQuestion({ question, answer, onChange }) {
  return (
    <div className="space-y-4">
      <p className="bn text-base text-ink leading-relaxed font-medium">{question.question_bn}</p>
      <div className="grid grid-cols-2 gap-3">
        {[
          { value: 'true',  label: '✓ সত্য',   active: 'bg-forest border-forest text-white', ring: 'border-forest/50' },
          { value: 'false', label: '✗ মিথ্যা', active: 'bg-red-500 border-red-500 text-white', ring: 'border-red-300' },
        ].map(opt => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`py-4 rounded-2xl border-2 font-ui font-bold text-base transition-all
              ${answer === opt.value
                ? opt.active
                : `bg-white text-ink border-border hover:${opt.ring}`}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}
