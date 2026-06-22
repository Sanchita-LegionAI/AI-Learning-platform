// pages/OcrReviewPage.jsx
// Shows what Gemini OCR'd from the student's answer sheet.
// Student reviews → confirms → triggers text-only evaluation.

import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import ProgressBar from '../components/ProgressBar'
import LoadingMessage from '../components/LoadingMessage'

export default function OcrReviewPage() {
  const { state }  = useLocation()
  const navigate   = useNavigate()
  const { token }  = useAuth()

  const [evaluating, setEvaluating] = useState(false)
  const [error,      setError]      = useState('')

  if (!state?.session_id || !state?.ocr_results) {
    navigate('/exam/select')
    return null
  }

  const { session_id, examData, ocr_results } = state

  const handleEvaluate = async () => {
    setError('')
    setEvaluating(true)
    try {
      const result = await api.evaluateExam(session_id, token)
      navigate('/exam/results', { state: { result } })
    } catch (e) {
      setError(e.message || 'মূল্যায়ন করা যায়নি। আবার চেষ্টা করুন।')
      setEvaluating(false)
    }
  }

  const handleRetake = () => {
    // Go back to upload with same examData so student can retake photo
    navigate('/exam/upload', { state: { session_id, examData } })
  }

  if (evaluating) return (
    <div className="min-h-screen bg-cream flex flex-col">
      <ProgressBar currentStep="upload" />
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="flex gap-2 mb-4">
          <span className="w-3 h-3 rounded-full bg-saffron animate-bounce" style={{animationDelay:'0ms'}} />
          <span className="w-3 h-3 rounded-full bg-saffron animate-bounce" style={{animationDelay:'150ms'}} />
          <span className="w-3 h-3 rounded-full bg-saffron animate-bounce" style={{animationDelay:'300ms'}} />
        </div>
        <p className="bn text-base font-medium text-ink mb-1">উত্তর মূল্যায়ন হচ্ছে...</p>
        <p className="text-xs font-ui text-ink-light">একটু অপেক্ষা করুন</p>
      </div>
    </div>
  )

  const totalMarks = ocr_results.reduce((s, q) => s + (q.marks || 0), 0)
  const blankCount = ocr_results.filter(q =>
    !q.student_answer || q.student_answer === 'কোনো উত্তর লেখা হয়নি'
  ).length

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <ProgressBar currentStep="upload" />

      <div className="flex-1 max-w-app mx-auto w-full px-4 py-5 page-enter space-y-4">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">🤖</span>
            <h1 className="bn text-xl font-bold text-ink">উত্তর যাচাই করুন</h1>
          </div>
          <p className="bn text-sm text-ink-light">
            AI আপনার হাতের লেখা পড়েছে। মূল্যায়নের আগে একবার দেখুন সব ঠিক আছে কিনা।
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="bn text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Summary banner */}
        <div className={`rounded-xl px-4 py-3 border ${
          blankCount > 0
            ? 'bg-amber-50 border-amber-200'
            : 'bg-forest-light border-forest/30'
        }`}>
          <p className={`bn text-sm font-medium ${blankCount > 0 ? 'text-amber-700' : 'text-forest'}`}>
            {blankCount > 0
              ? `⚠️ ${blankCount}টি প্রশ্নের উত্তর পাওয়া যায়নি`
              : `✓ সব ${ocr_results.length}টি উত্তর পাওয়া গেছে`
            }
          </p>
          <p className="text-xs font-ui text-ink-light mt-0.5">
            মোট নম্বর: {totalMarks} · {ocr_results.length}টি প্রশ্ন
          </p>
        </div>

        {/* Per-question OCR results */}
        <div className="space-y-3">
          {ocr_results.map((item, i) => {
            const blank = !item.student_answer || item.student_answer === 'কোনো উত্তর লেখা হয়নি'
            const unreadable = item.student_answer === 'পাঠযোগ্য নয়'

            return (
              <div key={i} className="card space-y-2">
                {/* Question */}
                <div className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-saffron text-white text-xs font-bold font-ui flex items-center justify-center mt-0.5">
                    {item.question_number || i + 1}
                  </span>
                  <div className="flex-1">
                    <p className="bn text-sm text-ink leading-relaxed">{item.question_text}</p>
                    <span className="inline-block mt-1 text-xs font-ui text-saffron-dark bg-saffron-light px-2 py-0.5 rounded-full">
                      {item.marks} নম্বর
                    </span>
                  </div>
                </div>

                {/* Divider */}
                <div className="h-px bg-border" />

                {/* OCR'd answer */}
                <div>
                  <p className="text-xs font-ui text-ink-light mb-1.5">
                    🤖 AI যা পড়েছে:
                  </p>
                  <div className={`rounded-xl px-3 py-2.5 ${
                    blank || unreadable
                      ? 'bg-red-50 border border-red-200'
                      : 'bg-blue-50 border border-blue-200'
                  }`}>
                    <p className={`bn text-sm leading-relaxed ${
                      blank || unreadable ? 'text-red-500 italic' : 'text-ink'
                    }`}>
                      {item.student_answer || 'কোনো উত্তর লেখা হয়নি'}
                    </p>
                  </div>
                  {(blank || unreadable) && (
                    <p className="bn text-xs text-amber-600 mt-1">
                      {unreadable
                        ? '⚠️ হাতের লেখা পড়া যায়নি — স্পষ্ট করে লিখলে ভালো হয়'
                        : '⚠️ এই প্রশ্নের কোনো উত্তর পাওয়া যায়নি'
                      }
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Action note */}
        <div className="bg-saffron-light border border-saffron/30 rounded-xl px-4 py-3">
          <p className="bn text-sm font-medium text-saffron-dark mb-1">মনে রাখুন</p>
          <p className="bn text-xs text-ink-light leading-relaxed">
            যদি AI ভুল পড়ে থাকে বা কোনো উত্তর মিস হয়ে থাকে, আবার ছবি তুলুন।
            সব ঠিক থাকলে মূল্যায়ন করুন।
          </p>
        </div>

        {/* Actions */}
        <div className="pb-8 space-y-3">
          <button onClick={handleEvaluate} className="btn-primary">
            মূল্যায়ন করুন →
          </button>
          <button onClick={handleRetake} className="btn-secondary">
            ← আবার ছবি তুলুন
          </button>
        </div>

      </div>
    </div>
  )
}
