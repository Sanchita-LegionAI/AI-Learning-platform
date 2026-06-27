// pages/Part2Page.jsx
// Two modes:
//   'type'  — student types answers directly (Bengali script or Banglish)
//   'photo' — student writes on paper, then photographs

import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import ProgressBar from '../components/ProgressBar'

// ── Defined OUTSIDE the component to prevent remount on every keystroke ───────
function QuestionItem({ q, showInput, value, onChange }) {
  return (
    <div className="space-y-2">
      <div className="flex gap-3 items-start">
        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-pink-400 text-white text-xs font-bold font-ui flex items-center justify-center mt-0.5">
          {q.answer_slot_id}
        </span>
        <div className="flex-1">
          <p className="bn text-base text-ink leading-relaxed font-medium">{q.question_bn}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs font-ui text-pink-600 bg-pink-50 px-2 py-0.5 rounded-full border border-pink-200">
              {q.marks} নম্বর
            </span>
            <span className="text-xs font-ui text-ink-light">
              সর্বোচ্চ {q.max_words || 2} শব্দ
            </span>
          </div>
        </div>
      </div>

      {showInput ? (
        <div className="ml-10">
          <input
            type="text"
            value={value}
            onChange={e => onChange(q.answer_slot_id, e.target.value)}
            placeholder="এখানে উত্তর লেখো (বাংলা বা Banglish)"
            className="w-full text-sm font-ui border border-pink-200 rounded-xl px-3 py-2.5
              focus:outline-none focus:border-pink-400 bg-pink-50/30 bn
              placeholder:text-ink-light/50"
          />
          <p className="text-[10px] font-ui text-ink-light mt-1">
            বাংলা ফন্টে বা English letters-এ বাংলা (Banglish) — দুটোই চলবে
          </p>
        </div>
      ) : (
        <div className="ml-10 border-b-2 border-dashed border-pink-200 pb-1">
          <span className="text-xs font-ui text-pink-200">উত্তর:</span>
        </div>
      )}
    </div>
  )
}

export default function Part2Page() {
  const { state }  = useLocation()
  const navigate   = useNavigate()
  const { token }  = useAuth()

  if (!state?.session_id || !state?.part2_questions) {
    navigate('/exam/select')
    return null
  }

  const { session_id, part2_questions, part1_result, examData, mode = 'photo' } = state

  const [typedAnswers, setTypedAnswers] = useState(() => {
    const init = {}
    for (const q of part2_questions) init[q.answer_slot_id] = ''
    return init
  })
  const [submitting,  setSubmitting]  = useState(false)
  const [submitError, setSubmitError] = useState('')

  const setAnswer = (slotId, val) => {
    const q = part2_questions.find(q => q.answer_slot_id === slotId)
    const maxWords = q?.max_words || 3
    const words = val.trim().split(/\s+/).filter(Boolean)
    // Allow typing but stop if exceeded by a space (word boundary)
    if (words.length > maxWords && val.endsWith(' ')) return
    setTypedAnswers(prev => ({ ...prev, [slotId]: val }))
  }

  const handleTypedSubmit = async () => {
    setSubmitError('')
    setSubmitting(true)
    const confirmed = {}
    for (const q of part2_questions) {
      confirmed[q.answer_slot_id] = typedAnswers[q.answer_slot_id]?.trim() || 'কোনো উত্তর লেখা হয়নি'
    }
    try {
      await api.submitOcrAnswers(session_id, confirmed, token)
      const evalResult = await api.evaluatePart2(session_id, token)
      navigate('/exam/results', { state: { result: evalResult, part1_result } })
    } catch (e) {
      setSubmitError(e.message || 'উত্তর পাঠানো যায়নি। আবার চেষ্টা করুন।')
      setSubmitting(false)
    }
  }

  // ── PHOTO MODE ──────────────────────────────────────────────────────────────
  if (mode === 'photo') {
    return (
      <div className="min-h-screen bg-cream flex flex-col">
        <ProgressBar currentStep="upload" />
        <div className="flex-1 max-w-app mx-auto w-full px-4 py-5 page-enter space-y-4">
          <div>
            <h1 className="bn text-xl font-bold text-ink mb-1">দ্বিতীয় অংশ</h1>
            <p className="bn text-sm text-ink-light">নিচের প্রশ্নগুলোর উত্তর কাগজে লেখো, তারপর ছবি তোলো</p>
          </div>

          <div className="bg-pink-50 border border-pink-200 rounded-xl px-4 py-3">
            <p className="bn text-sm font-bold text-pink-800 mb-1">মনে রেখো</p>
            <ul className="bn text-xs text-pink-700 space-y-0.5 list-disc list-inside">
              <li>কাগজে প্রশ্ন নম্বর অনুযায়ী উত্তর লেখো</li>
              <li>প্রতিটি উত্তর মাত্র ১-২টি শব্দে</li>
              <li>বড় করে স্পষ্টভাবে লেখো</li>
            </ul>
          </div>

          <div className="card space-y-4">
            <p className="label">দ্বিতীয় অংশের প্রশ্ন ({part2_questions.length}টি)</p>
            {part2_questions.map(q => (
              <QuestionItem key={q.answer_slot_id} q={q} showInput={false} value="" onChange={() => {}} />
            ))}
          </div>

          <div className="pb-8 space-y-3">
            <button
              onClick={() => navigate('/exam/upload', {
                state: { session_id, part2_questions, part1_result, examData }
              })}
              className="btn-primary"
            >
              উত্তর লেখা হয়েছে — ছবি তুলুন 📷
            </button>
            <button onClick={() => navigate(-1)} className="btn-secondary">← আগের পাতায় যান</button>
          </div>
        </div>
      </div>
    )
  }

  // ── TYPE MODE ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <ProgressBar currentStep="upload" />
      <div className="flex-1 max-w-app mx-auto w-full px-4 py-5 page-enter space-y-4">
        <div>
          <h1 className="bn text-xl font-bold text-ink mb-1">দ্বিতীয় অংশ — টাইপ করুন</h1>
          <p className="bn text-sm text-ink-light">প্রতিটি প্রশ্নের উত্তর সরাসরি টাইপ করুন</p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <p className="bn text-xs text-blue-800">
            💡 বাংলা কীবোর্ড না থাকলে English letters-এ বাংলা লেখো — AI বুঝতে পারবে।
            যেমন: "Mughol Samrajyo" → মুঘল সাম্রাজ্য
          </p>
        </div>

        {submitError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="bn text-sm text-red-700">{submitError}</p>
          </div>
        )}

        <div className="card space-y-5">
          <p className="label">দ্বিতীয় অংশের প্রশ্ন ({part2_questions.length}টি)</p>
          {part2_questions.map(q => (
            <QuestionItem
              key={q.answer_slot_id}
              q={q}
              showInput={true}
              value={typedAnswers[q.answer_slot_id] || ''}
              onChange={setAnswer}
            />
          ))}
        </div>

        <div className="pb-8 space-y-3">
          <button
            onClick={handleTypedSubmit}
            disabled={submitting}
            className="btn-primary disabled:opacity-50"
          >
            {submitting ? 'মূল্যায়ন হচ্ছে…' : 'উত্তর জমা দিন ও মূল্যায়ন করুন →'}
          </button>
          <button onClick={() => navigate(-1)} className="btn-secondary">← আগের পাতায় যান</button>
        </div>
      </div>
    </div>
  )
}
