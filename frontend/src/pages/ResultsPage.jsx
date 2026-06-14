// pages/ResultsPage.jsx
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import ProgressBar from '../components/ProgressBar'

const GRADE_COLORS = {
  'A+': { ring: 'border-forest', text: 'text-forest', bg: 'bg-forest-light' },
  'A':  { ring: 'border-forest', text: 'text-forest', bg: 'bg-forest-light' },
  'B+': { ring: 'border-saffron', text: 'text-saffron', bg: 'bg-saffron-light' },
  'B':  { ring: 'border-saffron', text: 'text-saffron', bg: 'bg-saffron-light' },
  'C':  { ring: 'border-amber-400', text: 'text-amber-600', bg: 'bg-amber-50' },
  'D':  { ring: 'border-red-400', text: 'text-red-600', bg: 'bg-red-50' },
}

function ScoreCircle({ awarded, max, grade }) {
  const pct     = max > 0 ? Math.round((awarded / max) * 100) : 0
  const colors  = GRADE_COLORS[grade] || GRADE_COLORS['B']
  const radius  = 40
  const circ    = 2 * Math.PI * radius
  const dash    = (pct / 100) * circ

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-32 h-32">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="#E8E0D0" strokeWidth="8" />
          <circle
            cx="50" cy="50" r={radius} fill="none"
            strokeWidth="8"
            stroke={grade?.startsWith('A') ? '#2D7A4F' : grade === 'B+' || grade === 'B' ? '#E8871E' : '#EF4444'}
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 1s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold font-ui text-ink">{awarded}/{max}</span>
          <span className="text-xs font-ui text-ink-light">{pct}%</span>
        </div>
      </div>
      <div className={`mt-3 px-4 py-1.5 rounded-full ${colors.bg} border ${colors.ring}`}>
        <span className={`text-lg font-bold font-ui ${colors.text}`}>{grade}</span>
      </div>
    </div>
  )
}

function QuestionResult({ result, index, question }) {
  const [showAnswer, setShowAnswer] = useState(false)
  const pct = result.max > 0 ? Math.round((result.awarded / result.max) * 100) : 0
  const full = result.awarded === result.max

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1">
          <p className="font-ui text-xs text-ink-light mb-1">প্রশ্ন {index + 1}</p>
          <p className="bn text-sm text-ink leading-relaxed">{question?.question || result.generated_question}</p>
        </div>
        <div className="flex-shrink-0 text-center">
          <div className={`
            text-sm font-bold font-ui px-2.5 py-1 rounded-lg
            ${full ? 'bg-forest-light text-forest' : pct >= 50 ? 'bg-saffron-light text-saffron-dark' : 'bg-red-50 text-red-600'}
          `}>
            {result.awarded}/{result.max}
          </div>
        </div>
      </div>

      {/* Feedback */}
      {result.feedback && (
        <div className="bg-cream border border-border rounded-xl px-3 py-2.5 mb-3">
          <p className="font-ui text-xs text-ink-light mb-1">মতামত</p>
          <p className="bn text-sm text-ink leading-relaxed">{result.feedback}</p>
        </div>
      )}

      {/* Model answer toggle */}
      <button
        onClick={() => setShowAnswer(!showAnswer)}
        className={`
          text-sm font-ui font-medium w-full text-left px-3 py-2 rounded-lg transition-colors
          ${showAnswer ? 'text-saffron' : 'text-ink-light hover:text-saffron'}
        `}
      >
        {showAnswer ? '▲ আদর্শ উত্তর লুকান' : '▼ আদর্শ উত্তর দেখুন'}
      </button>

      {showAnswer && result.model_answer && (
        <div className="mt-2 bg-saffron-light border border-saffron/30 rounded-xl px-3 py-2.5">
          <p className="font-ui text-xs text-saffron-dark mb-1">আদর্শ উত্তর</p>
          <p className="bn text-sm text-ink leading-relaxed">{result.model_answer}</p>
        </div>
      )}
    </div>
  )
}

export default function ResultsPage() {
  const { state } = useLocation()
  const navigate  = useNavigate()

  if (!state?.result) {
    navigate('/exam/select')
    return null
  }

  const { result } = state
  const { score_awarded, score_max, percentage, grade, overall_feedback, results } = result

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <ProgressBar currentStep="results" />

      <div className="flex-1 max-w-app mx-auto w-full px-4 py-5 page-enter">

        {/* Score card */}
        <div className="card mb-5 text-center">
          <h1 className="bn text-lg font-bold text-ink mb-4">ফলাফল</h1>
          <ScoreCircle awarded={score_awarded} max={score_max} grade={grade} />
          {overall_feedback && (
            <p className="bn text-sm text-ink-light mt-4 leading-relaxed px-2">
              {overall_feedback}
            </p>
          )}
        </div>

        {/* Per-question results */}
        <h2 className="bn text-base font-bold text-ink mb-3">প্রশ্নওয়ারি ফলাফল</h2>
        <div className="space-y-3 mb-8">
          {results.map((r, i) => (
            <QuestionResult
              key={i}
              result={r}
              index={i}
              question={null}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="pb-8 space-y-3">
          <button
            onClick={() => navigate('/exam/select')}
            className="btn-primary"
          >
            আবার পরীক্ষা দিন
          </button>
          <button
            onClick={() => navigate('/exam/select')}
            className="btn-secondary"
          >
            অন্য অধ্যায় বেছে নিন
          </button>
        </div>
      </div>
    </div>
  )
}
