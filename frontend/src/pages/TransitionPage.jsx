// pages/TransitionPage.jsx
// Shows Part 1 score, then lets student:
//   A) Skip Part 2 entirely (-1 mark)
//   B) Type answers directly
//   C) Write on paper and photograph

import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
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
  const { state }   = useLocation()
  const navigate    = useNavigate()
  const { token }   = useAuth()

  const [showSkipConfirm, setShowSkipConfirm] = useState(false)
  const [skipping,        setSkipping]        = useState(false)
  const [skipError,       setSkipError]       = useState('')

  if (!state?.session_id || !state?.part1_result) {
    navigate('/exam/select')
    return null
  }

  const { session_id, part1_result, part2_questions = [], examData } = state
  const { score_awarded, score_max, percentage, grade } = part1_result
  const gc = GRADE_CONFIG[grade] || GRADE_CONFIG['B']

  const handleSkip = async () => {
    setSkipping(true)
    setSkipError('')
    try {
      const result = await api.skipPart2(session_id, token)
      navigate('/exam/results', {
        state: {
          result: {
            total_score_awarded:  result.total_score,
            total_score_max:      result.total_max,
            grade:                result.grade,
            percentage:           result.percentage,
            part2_score_awarded:  0,
            part2_score_max:      examData?.part2_max_marks ?? 0,
            overall_feedback_bn:  'দ্বিতীয় অংশ বাদ দেওয়া হয়েছে। ১ নম্বর কাটা হয়েছে।',
            results:              [],
            part2_skipped:        true,
            penalty:              result.penalty,
          },
          part1_result,
        }
      })
    } catch (e) {
      setSkipError(e.message)
      setSkipping(false)
      setShowSkipConfirm(false)
    }
  }

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
            <div className="w-px h-10 bg-border" />
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

        {/* Skip error */}
        {skipError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="bn text-sm text-red-700">{skipError}</p>
          </div>
        )}

        {/* Skip confirm dialog */}
        {showSkipConfirm && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-4 space-y-3">
            <p className="bn text-sm font-bold text-amber-800">নিশ্চিত করো</p>
            <p className="bn text-sm text-amber-700">
              দ্বিতীয় অংশ বাদ দিলে <strong>১ নম্বর কাটা</strong> যাবে। তবুও কি বাদ দিতে চাও?
            </p>
            <div className="flex gap-3">
              <button onClick={handleSkip} disabled={skipping}
                className="flex-1 bg-amber-500 text-white font-ui font-semibold text-sm py-2.5 rounded-xl hover:bg-amber-600 disabled:opacity-50 transition-all">
                {skipping ? 'অপেক্ষা করো…' : 'হ্যাঁ, বাদ দাও (-১ নম্বর)'}
              </button>
              <button onClick={() => setShowSkipConfirm(false)} disabled={skipping}
                className="flex-1 btn-secondary">
                না, উত্তর দেব
              </button>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="pb-8 space-y-3">
          {/* Type answers */}
          <button
            onClick={() => navigate('/exam/part2', {
              state: { session_id, part2_questions, part1_result, examData, mode: 'type' }
            })}
            className="btn-primary"
          >
            ✍️ টাইপ করে উত্তর দিন
          </button>

          {/* Write on paper */}
          <button
            onClick={() => navigate('/exam/part2', {
              state: { session_id, part2_questions, part1_result, examData, mode: 'photo' }
            })}
            className="w-full py-3 rounded-xl border border-border font-ui font-medium text-sm text-ink bg-white hover:border-saffron/50 transition-all"
          >
            📷 কাগজে লিখে ছবি তুলুন
          </button>

          {/* Skip */}
          {!showSkipConfirm && (
            <button onClick={() => setShowSkipConfirm(true)}
              className="w-full text-sm font-ui font-medium text-amber-700 border border-amber-300 bg-amber-50 hover:bg-amber-100 py-3 rounded-xl transition-all">
              পরীক্ষা শেষ করুন <span className="font-semibold text-amber-500">(-১ নম্বর)</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
