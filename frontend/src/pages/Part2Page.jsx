// pages/Part2Page.jsx
// Shows Part 2 short_write questions — student writes answers on paper, then photographs.

import { useLocation, useNavigate } from 'react-router-dom'
import ProgressBar from '../components/ProgressBar'

export default function Part2Page() {
  const { state }  = useLocation()
  const navigate   = useNavigate()

  if (!state?.session_id || !state?.part2_questions) {
    navigate('/exam/select')
    return null
  }

  const { session_id, part2_questions, part1_result, examData } = state

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

              {/* Answer line visual */}
              <div className="mt-3 border-b-2 border-dashed border-pink-300 pb-1">
                <p className="text-xs font-ui text-pink-300">উত্তর:</p>
              </div>
            </div>
          ))}
        </div>

        {/* Proceed */}
        <div className="pb-8 space-y-3">
          <button
            onClick={() => navigate('/exam/upload', {
              state: { session_id, part2_questions, part1_result, examData }
            })}
            className="btn-primary"
          >
            উত্তর লেখা হয়েছে — ছবি তুলুন 📷
          </button>
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
