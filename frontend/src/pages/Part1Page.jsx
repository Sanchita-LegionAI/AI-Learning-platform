// pages/Part1Page.jsx
// Interactive Part 1 — student taps/selects answers, no writing.
// Submitted instantly to backend for server-side evaluation (no LLM).

import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import ProgressBar from '../components/ProgressBar'
import LoadingMessage from '../components/LoadingMessage'
import { McqQuestion }         from '../components/questions/McqQuestion'
import { TrueFalseQuestion }   from '../components/questions/TrueFalseQuestion'
import { MatchPairsQuestion }  from '../components/questions/MatchPairsQuestion'
import { TapSequenceQuestion } from '../components/questions/TapSequenceQuestion'
import { CategorizeQuestion }  from '../components/questions/CategorizeQuestion'

const TYPE_LABEL = {
  mcq:          'বহু নির্বাচনী প্রশ্ন',
  true_false:   'সত্য / মিথ্যা',
  match_pairs:  'মেলাও',
  tap_sequence: 'সঠিক ক্রম সাজাও',
  categorize:   'দলে ভাগ করো',
}

function QuestionComponent({ question, answer, onChange }) {
  const props = { question, answer, onChange }
  switch (question.q_type) {
    case 'mcq':          return <McqQuestion {...props} />
    case 'true_false':   return <TrueFalseQuestion {...props} />
    case 'match_pairs':  return <MatchPairsQuestion {...props} />
    case 'tap_sequence': return <TapSequenceQuestion {...props} />
    case 'categorize':   return <CategorizeQuestion {...props} />
    default:             return <p className="bn text-sm text-red-500">অজানা প্রশ্নের ধরন: {question.q_type}</p>
  }
}

export default function Part1Page() {
  const { state }  = useLocation()
  const navigate   = useNavigate()
  const { token }  = useAuth()

  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers]           = useState({})   // { "question_id": answer_value }
  const [submitting, setSubmitting]     = useState(false)
  const [error, setError]               = useState('')

  if (!state?.examData) {
    navigate('/exam/select')
    return null
  }

  const { examData } = state
  const { session_id, part1_questions = [], part2_questions = [], chapter_name, subject, part1_max_marks } = examData

  const total    = part1_questions.length
  const question = part1_questions[currentIndex]
  const answer   = answers[String(question?.id)]

  const setAnswer = (val) => setAnswers(prev => ({ ...prev, [String(question.id)]: val }))

  const canGoNext = answer !== undefined && answer !== null && answer !== ''
  const isLast    = currentIndex === total - 1

  const goNext = () => {
    if (currentIndex < total - 1) setCurrentIndex(i => i + 1)
  }

  const goPrev = () => {
    if (currentIndex > 0) setCurrentIndex(i => i - 1)
  }

  const handleSubmit = async () => {
    setError('')
    setSubmitting(true)
    try {
      const result = await api.submitPart1(session_id, answers, token)
      // Navigate to transition page with Part 1 results + Part 2 questions
      navigate('/exam/transition', {
        state: {
          session_id,
          part1_result: result,
          part2_questions,
          examData,
        }
      })
    } catch (e) {
      setError(e.message || 'জমা দেওয়া যায়নি। আবার চেষ্টা করুন।')
      setSubmitting(false)
    }
  }

  if (submitting) return (
    <div className="min-h-screen bg-cream flex flex-col">
      <ProgressBar currentStep="paper" />
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="flex gap-2 mb-4">
          {[0,150,300].map(d => (
            <span key={d} className="w-3 h-3 rounded-full bg-saffron animate-bounce" style={{animationDelay:`${d}ms`}} />
          ))}
        </div>
        <p className="bn text-base font-medium text-ink mb-1">উত্তর মূল্যায়ন হচ্ছে...</p>
        <p className="text-xs font-ui text-ink-light">একটু অপেক্ষা করুন</p>
      </div>
    </div>
  )

  // Answer review screen before final submit
  const answeredCount = Object.keys(answers).length
  const unanswered    = total - answeredCount

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <ProgressBar currentStep="paper" />

      <div className="flex-1 max-w-app mx-auto w-full px-4 py-4 flex flex-col">

        {/* Top bar */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="bn text-xs text-ink-light">{chapter_name}</p>
            <p className="text-xs font-ui text-saffron-dark">প্রথম অংশ · {total}টি প্রশ্ন · {part1_max_marks} নম্বর</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-ui text-ink-light">প্রশ্ন</p>
            <p className="text-sm font-bold font-ui text-ink">{currentIndex + 1}/{total}</p>
          </div>
        </div>

        {/* Progress dots */}
        <div className="flex gap-1 mb-4 flex-wrap">
          {part1_questions.map((q, i) => {
            const ans = answers[String(q.id)]
            const done = ans !== undefined && ans !== null && ans !== ''
            return (
              <button
                key={i}
                onClick={() => setCurrentIndex(i)}
                className={`w-6 h-6 rounded-full text-[10px] font-ui font-bold transition-all
                  ${i === currentIndex ? 'bg-saffron text-white scale-110' :
                    done ? 'bg-forest text-white' :
                           'bg-border text-ink-light'}`}
              >
                {i + 1}
              </button>
            )
          })}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-3">
            <p className="bn text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Question card */}
        <div className="card flex-1 mb-4 page-enter" key={currentIndex}>
          {/* Type badge */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-ui font-medium text-saffron-dark bg-saffron-light px-2.5 py-1 rounded-full">
              {TYPE_LABEL[question.q_type] || question.q_type}
            </span>
            <span className="text-xs font-ui text-ink-light bg-cream px-2 py-1 rounded-full">
              {question.marks} নম্বর
            </span>
          </div>

          <QuestionComponent
            question={question}
            answer={answer}
            onChange={setAnswer}
          />
        </div>

        {/* Navigation */}
        <div className="space-y-2 pb-6">
          <div className="flex gap-2">
            <button
              onClick={goPrev}
              disabled={currentIndex === 0}
              className="flex-1 py-3 rounded-xl border border-border font-ui text-sm text-ink disabled:opacity-30 hover:border-saffron hover:text-saffron transition-all"
            >
              ← আগের প্রশ্ন
            </button>

            {!isLast ? (
              <button
                onClick={goNext}
                className={`flex-1 py-3 rounded-xl font-ui text-sm font-medium transition-all
                  ${canGoNext
                    ? 'bg-saffron text-white hover:bg-saffron/90'
                    : 'bg-border text-ink-light'}`}
              >
                পরের প্রশ্ন →
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                className="flex-1 py-3 rounded-xl bg-forest text-white font-ui text-sm font-bold hover:bg-forest/90 transition-all"
              >
                জমা দিন ✓
              </button>
            )}
          </div>

          {/* Unanswered warning on last question */}
          {isLast && unanswered > 0 && (
            <p className="bn text-xs text-amber-600 text-center">
              ⚠️ {unanswered}টি প্রশ্নের উত্তর দেওয়া হয়নি — তবুও জমা দিতে পারবে
            </p>
          )}
          {isLast && unanswered === 0 && (
            <p className="bn text-xs text-forest text-center">
              ✓ সব {total}টি প্রশ্নের উত্তর দেওয়া হয়েছে
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
