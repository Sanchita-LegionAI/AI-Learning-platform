// pages/TransitionPage.jsx
// Shows Part 1 score instantly, then guides student to Part 2 (write on paper)

import { useLocation, useNavigate } from 'react-router-dom'
import ProgressBar from '../components/ProgressBar'

const GRADE_CONFIG = {
  'A+': { color: 'text-forest', bg: 'bg-forest-light border-forest/30', emoji: '🌟' },
  'A':  { color: 'text-forest', bg: 'bg-forest-light border-forest/30', emoji: '⭐' },
  'B+': { color: 'text-saffron-dark', bg: 'bg-saffron-light border-saffron/30', emoji: '👍' },
  'B':  { color: 'text-saffron-dark', bg: 'bg-saffron-light border-saffron/30', emoji: '👍' },
  'C':  { color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', emoji: '📖' },
  'D':  { color: 'text-red-600', bg: 'bg-red-50 border-red-200', emoji: '💪' },
}

export default function TransitionPage() {
  const { state }  = useLocation()
  const navigate   = useNavigate()

  if (!state?.session_id || !state?.part1_result) {
    navigate('/exam/select')
    return null
  }

  const { session_id, part1_result, part2_questions = [], examData } = state
  const { score_awarded, score_max, percentage, grade } = part1_result

  const gc = GRADE_CONFIG[grade] || GRADE_CONFIG['B']

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <ProgressBar currentStep="paper" />

      <div className="flex-1 max-w-app mx-auto w-full px-4 py-6 page-enter space-y-5">

        {/* Part 1 result */}
        <div className={`card border ${gc.bg} text-center`}>
          <p className="text-3xl mb-2">{gc.emoji}</p>
          <h1 className="bn text-xl font-bold text-ink mb-1">প্রথম অংশ শেষ!</h1>
          <div className="flex items-center justify-center gap-3 my-3">
            <div>
              <p className="text-3xl font-bold font-ui text-ink">{score_awarded}/{score_max}</p>
              <p className="text-xs font-ui text-ink-light">নম্বর</p>
            </div>
            <div className={`w-px h-10 bg-border`} />
            <div>
              <p className={`text-3xl font-bold font-ui ${gc.color}`}>{grade}</p>
              <p className="text-xs font-ui text-ink-light">গ্রেড</p>
            </div>
            <div className="w-px h-10 bg-border" />
            <div>
              <p className="text-3xl font-bold font-ui text-ink">{percentage}%</p>
              <p className="text-xs font-ui text-ink-light">শতাংশ</p>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-border" />
          <p className="text-xs font-ui text-ink-light">এখন দ্বিতীয় অংশ</p>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Part 2 instructions */}
        <div className="card bg-pink-50 border-pink-200">
          <h2 className="bn text-base font-bold text-pink-800 mb-2">✏️ কাগজে লেখার পালা</h2>
          <p className="bn text-sm text-pink-700 leading-relaxed mb-3">
            এখন নিচের প্রশ্নগুলোর উত্তর কাগজে লিখতে হবে। প্রতিটি উত্তর মাত্র ১-২টি শব্দে।
          </p>
          <ul className="bn text-xs text-pink-600 space-y-1 list-disc list-inside">
            <li>কাগজে নম্বর অনুযায়ী লেখো</li>
            <li>বড় করে স্পষ্টভাবে লেখো</li>
            <li>লেখা শেষে ছবি তুলবে</li>
          </ul>
        </div>

        {/* Part 2 question preview */}
        <div className="card">
          <p className="label mb-3">দ্বিতীয় অংশের প্রশ্ন ({part2_questions.length}টি)</p>
          <div className="space-y-2">
            {part2_questions.map((q) => (
              <div key={q.id} className="flex gap-3 bg-cream rounded-xl px-3 py-2.5">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-pink-400 text-white text-xs font-bold font-ui flex items-center justify-center mt-0.5">
                  {q.answer_slot_id}
                </span>
                <div className="flex-1">
                  <p className="bn text-sm text-ink leading-relaxed">{q.question_bn}</p>
                  <span className="inline-block mt-1 text-xs font-ui text-pink-600 bg-pink-50 px-2 py-0.5 rounded-full border border-pink-200">
                    {q.marks} নম্বর · সর্বোচ্চ {q.max_words || 2} শব্দ
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="pb-8">
          <button
            onClick={() => navigate('/exam/part2', { state: { session_id, part2_questions, part1_result, examData } })}
            className="btn-primary"
          >
            দ্বিতীয় অংশ শুরু করুন →
          </button>
        </div>
      </div>
    </div>
  )
}
