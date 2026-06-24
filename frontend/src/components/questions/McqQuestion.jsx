// components/questions/McqQuestion.jsx
export function McqQuestion({ question, answer, onChange }) {
  return (
    <div className="space-y-3">
      <p className="bn text-base text-ink leading-relaxed font-medium">{question.question_bn}</p>
      <div className="space-y-2">
        {(question.options || []).map((opt, i) => {
          const selected = answer === opt
          return (
            <button
              key={i}
              onClick={() => onChange(opt)}
              className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all
                ${selected
                  ? 'bg-saffron border-saffron text-white'
                  : 'bg-white border-border text-ink hover:border-saffron/50'}`}
            >
              <span className={`text-xs font-ui mr-2 ${selected ? 'text-white/70' : 'text-ink-light'}`}>
                {String.fromCharCode(65 + i)}.
              </span>
              <span className="bn text-sm">{opt}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
