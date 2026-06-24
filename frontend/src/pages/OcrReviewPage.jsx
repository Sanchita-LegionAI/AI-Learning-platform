// pages/OcrReviewPage.jsx
// Student reviews slot-by-slot OCR results, edits if needed, then confirms for evaluation.

import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import ProgressBar from '../components/ProgressBar'

function FullScreenLoader({ message, subMessage }) {
  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <ProgressBar currentStep="upload" />
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="flex gap-2 mb-4">
          {[0,150,300].map(d => (
            <span key={d} className="w-3 h-3 rounded-full bg-saffron animate-bounce" style={{animationDelay:`${d}ms`}} />
          ))}
        </div>
        <p className="bn text-base font-medium text-ink mb-1">{message}</p>
        {subMessage && <p className="text-xs font-ui text-ink-light">{subMessage}</p>}
      </div>
    </div>
  )
}

export default function OcrReviewPage() {
  const { state }  = useLocation()
  const navigate   = useNavigate()
  const { token }  = useAuth()

  if (!state?.session_id || !state?.ocr_results) {
    navigate('/exam/select')
    return null
  }

  const { session_id, ocr_results, part2_questions = [], part1_result, examData } = state

  // editedAnswers: { slot_id (string): text }
  const [editedAnswers, setEditedAnswers] = useState(() => {
    const init = {}
    for (const r of ocr_results) {
      init[String(r.slot_id)] = r.ocr_text || ''
    }
    return init
  })

  const [saving,      setSaving]      = useState(false)
  const [evaluating,  setEvaluating]  = useState(false)
  const [error,       setError]       = useState('')

  const updateAnswer = (slotId, text) => {
    // Enforce max_words limit
    const q        = part2_questions.find(q => q.answer_slot_id === slotId)
    const maxWords = q?.max_words || 3
    const words    = text.trim().split(/\s+/).filter(Boolean)
    if (words.length > maxWords) return  // block if too many words
    setEditedAnswers(prev => ({ ...prev, [String(slotId)]: text }))
  }

  const handleConfirm = async () => {
    setError('')
    setSaving(true)

    // Convert keys to int for backend
    const confirmed = {}
    for (const [k, v] of Object.entries(editedAnswers)) {
      confirmed[parseInt(k)] = v.trim() || 'কোনো উত্তর লেখা হয়নি'
    }

    try {
      await api.submitOcrAnswers(session_id, confirmed, token)
    } catch (e) {
      setError(e.message || 'সংরক্ষণ করা যায়নি।')
      setSaving(false)
      return
    }
    setSaving(false)

    // Now evaluate Part 2
    setEvaluating(true)
    try {
      const result = await api.evaluatePart2(session_id, token)
      navigate('/exam/results', {
        state: { result, part1_result, fromEval: true }
      })
    } catch (e) {
      setError(e.message || 'মূল্যায়ন করা যায়নি। আবার চেষ্টা করুন।')
      setEvaluating(false)
    }
  }

  if (saving)     return <FullScreenLoader message="উত্তর সংরক্ষণ হচ্ছে..." />
  if (evaluating) return <FullScreenLoader message="মূল্যায়ন হচ্ছে..." subMessage="GPT তোমার উত্তর দেখছে" />

  const blankCount = Object.values(editedAnswers).filter(v => !v.trim()).length

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <ProgressBar currentStep="upload" />

      <div className="flex-1 max-w-app mx-auto w-full px-4 py-5 page-enter space-y-4">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">🤖</span>
            <h1 className="bn text-xl font-bold text-ink">উত্তর যাচাই করো</h1>
          </div>
          <p className="bn text-sm text-ink-light">
            AI তোমার লেখা পড়েছে। ভুল থাকলে সংশোধন করো, তারপর নিশ্চিত করো।
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="bn text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Summary */}
        <div className={`rounded-xl px-4 py-3 border ${
          blankCount > 0 ? 'bg-amber-50 border-amber-200' : 'bg-forest-light border-forest/30'
        }`}>
          <p className={`bn text-sm font-medium ${blankCount > 0 ? 'text-amber-700' : 'text-forest'}`}>
            {blankCount > 0
              ? `⚠️ ${blankCount}টি প্রশ্নের উত্তর ফাঁকা`
              : `✓ সব ${ocr_results.length}টি উত্তর পাওয়া গেছে`}
          </p>
        </div>

        {/* Per-slot review */}
        <div className="space-y-3">
          {ocr_results.map((item) => {
            const q       = part2_questions.find(q => q.answer_slot_id === item.slot_id)
            const val     = editedAnswers[String(item.slot_id)] || ''
            const maxWords = q?.max_words || 3
            const blank   = !val.trim()

            return (
              <div key={item.slot_id} className="card space-y-3">
                {/* Question */}
                <div className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-pink-400 text-white text-xs font-bold font-ui flex items-center justify-center mt-0.5">
                    {item.slot_id}
                  </span>
                  <div className="flex-1">
                    <p className="bn text-sm text-ink leading-relaxed">{item.question_bn}</p>
                    <span className="text-xs font-ui text-pink-600 mt-0.5 inline-block">
                      সর্বোচ্চ {maxWords} শব্দ
                    </span>
                  </div>
                </div>

                <div className="h-px bg-border" />

                {/* Editable OCR answer */}
                <div>
                  <p className="text-xs font-ui text-ink-light mb-1.5">🤖 AI যা পড়েছে (সংশোধন করতে পারো):</p>
                  <input
                    type="text"
                    value={val}
                    onChange={e => updateAnswer(item.slot_id, e.target.value)}
                    placeholder="উত্তর লেখা হয়নি"
                    className={`w-full bn text-sm px-3 py-2.5 rounded-xl border-2 outline-none transition-all
                      ${blank
                        ? 'bg-red-50 border-red-200 text-red-500 placeholder-red-300 focus:border-red-400'
                        : 'bg-blue-50 border-blue-300 text-ink focus:border-saffron'}`}
                  />
                  {blank && (
                    <p className="bn text-xs text-amber-600 mt-1">⚠️ ফাঁকা থাকলে ০ নম্বর পাবে</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Actions */}
        <div className="pb-8 space-y-3">
          <button onClick={handleConfirm} className="btn-primary">
            নিশ্চিত করো ও মূল্যায়ন করো →
          </button>
          <button
            onClick={() => navigate('/exam/upload', { state: { session_id, part2_questions, part1_result, examData } })}
            className="btn-secondary"
          >
            ← আবার ছবি তোলো
          </button>
        </div>
      </div>
    </div>
  )
}
