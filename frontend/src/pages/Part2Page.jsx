// pages/Part2Page.jsx
// Shows Part 2 short_write questions.
// Student can either write answers on paper → photograph,
// OR skip Part 2 entirely with a -1 mark penalty.

import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import ProgressBar from '../components/ProgressBar'

export default function Part2Page() {
  const { state }    = useLocation()
  const navigate     = useNavigate()
  const { token }    = useAuth()

  const [skipping,     setSkipping]     = useState(false)
  const [skipError,    setSkipError]    = useState('')
  const [showConfirm,  setShowConfirm]  = useState(false)

  if (!state?.session_id || !state?.part2_questions) {
    navigate('/exam/select')
    return null
  }

  const { session_id, part2_questions, part1_result, examData } = state

  const handleSkip = async () => {
    setSkipping(true)
    setSkipError('')
    try {
      const result = await api.skipPart2(session_id, token)
      // Go straight to results with the skip result
      navigate('/exam/results', {
        state: {
          result: {
            total_score_awarded:  result.total_score,
            total_score_max:      result.total_max,
            grade:                result.grade,
            percentage:           result.percentage,
            part2_score_awarded:  0,
            part2_score_max:      examData?.part2_max_marks ?? 0,
            overall_feedback_bn:  `দ্বিতীয় অংশ বাদ দেওয়া হয়েছে। ১ নম্বর কাটা হয়েছে।`,
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
      setShowConfirm(false)
    }
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <ProgressBar currentStep="upload" />

      <div className="flex-1 max-w-app mx-auto w-full px-4 py-5 page-enter space-y-4">

        {/* Header */}
        <div>
          <h1 className="bn text-xl font-bold text-ink mb-1">দ্বিতীয় অংশ</h1>
          <p className="bn text-sm text-ink-light">
            নিচের প্রশ্নগুলোর উত্তর কাগজে লেখো, তারপর ছবি তোলো
          </p>
        </div>

        {/* Reminder */}
        <div className="bg-pink-50 border border-pink-200 rounded-xl px-4 py-3">
          <p className="bn text-sm font-bold text-pink-800 mb-1">মনে রেখো</p>
          <ul className="bn text-xs text-pink-700 space-y-0.5 list-disc list-inside">
            <li>কাগজে প্রশ্ন নম্বর অনুযায়ী উত্তর লেখো</li>
            <li>প্রতিটি উত্তর মাত্র ১-২টি শব্দে</li>
            <li>বড় করে স্পষ্টভাবে লেখো যাতে AI পড়তে পারে</li>
          </ul>
        </div>

        {/* Questions */}
        <div className="space-y-3">
          {part2_questions.map((q) => (
            <div key={q.id} className="card">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-pink-400 text-white font-bold font-ui flex items-center justify-center text-sm">
                  {q.answer_slot_id}
                </div>
                <div className="flex-1">
                  <p className="bn text-base text-ink leading-relaxed font-medium">{q.question_bn}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs font-ui text-pink-600 bg-pink-50 px-2 py-0.5 rounded-full border border-pink-200">
                      {q.marks} নম্বর
                    </span>
                    <span className="text-xs font-ui text-ink-light">
                      সর্বোচ্চ {q.max_words || 2} শব্দ
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-3 border-b-2 border-dashed border-pink-300 pb-1">
                <p className="text-xs font-ui text-pink-300">উত্তর:</p>
              </div>
            </div>
          ))}
        </div>

        {/* Skip error */}
        {skipError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="bn text-sm text-red-700">{skipError}</p>
          </div>
        )}

        {/* Confirm skip dialog */}
        {showConfirm && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-4 space-y-3">
            <p className="bn text-sm font-bold text-amber-800">নিশ্চিত করো</p>
            <p className="bn text-sm text-amber-700">
              দ্বিতীয় অংশ বাদ দিলে তোমার মোট নম্বর থেকে <strong>১ নম্বর কাটা</strong> যাবে।
              তবুও কি বাদ দিতে চাও?
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleSkip}
                disabled={skipping}
                className="flex-1 bg-amber-500 text-white font-ui font-semibold text-sm py-2.5 rounded-xl
                  hover:bg-amber-600 disabled:opacity-50 transition-all"
              >
                {skipping ? 'অপেক্ষা করো…' : 'হ্যাঁ, বাদ দাও (-১ নম্বর)'}
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                disabled={skipping}
                className="flex-1 btn-secondary"
              >
                না, লিখব
              </button>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="pb-8 space-y-3">
          {/* Primary: proceed to photo */}
          <button
            onClick={() => navigate('/exam/upload', {
              state: { session_id, part2_questions, part1_result, examData }
            })}
            className="btn-primary"
          >
            উত্তর লেখা হয়েছে — ছবি তুলুন 📷
          </button>

          {/* Secondary: skip with penalty */}
          {!showConfirm && (
            <button
              onClick={() => setShowConfirm(true)}
              className="w-full text-sm font-ui font-medium text-amber-700 border border-amber-300
                bg-amber-50 hover:bg-amber-100 py-3 rounded-xl transition-all"
            >
              পরীক্ষা শেষ করুন  <span className="text-amber-500 font-semibold">(-১ নম্বর)</span>
            </button>
          )}

          <button
            onClick={() => navigate(-1)}
            className="btn-secondary"
          >
            ← আগের পাতায় যান
          </button>
        </div>
      </div>
    </div>
  )
}
