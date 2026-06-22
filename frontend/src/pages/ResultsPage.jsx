// pages/ResultsPage.jsx
// Shows full result: question → student's answer (OCR) → feedback → model answer
// Works both from fresh evaluation (state.result) and from history (state.session_id)

import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import ProgressBar from '../components/ProgressBar'
import LoadingMessage from '../components/LoadingMessage'

const GRADE_COLORS = {
  'A+': { ring: 'border-forest', text: 'text-forest', bg: 'bg-forest-light' },
  'A':  { ring: 'border-forest', text: 'text-forest', bg: 'bg-forest-light' },
  'B+': { ring: 'border-saffron', text: 'text-saffron', bg: 'bg-saffron-light' },
  'B':  { ring: 'border-saffron', text: 'text-saffron', bg: 'bg-saffron-light' },
  'C':  { ring: 'border-amber-400', text: 'text-amber-600', bg: 'bg-amber-50' },
  'D':  { ring: 'border-red-400', text: 'text-red-600', bg: 'bg-red-50' },
}

function ScoreCircle({ awarded, max, grade }) {
  const pct    = max > 0 ? Math.round((awarded / max) * 100) : 0
  const colors = GRADE_COLORS[grade] || GRADE_COLORS['B']
  const radius = 40
  const circ   = 2 * Math.PI * radius
  const dash   = (pct / 100) * circ
  const strokeColor = grade?.startsWith('A') ? '#2D7A4F' : grade === 'B+' || grade === 'B' ? '#E8871E' : '#EF4444'

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-32 h-32">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="#E8E0D0" strokeWidth="8" />
          <circle
            cx="50" cy="50" r={radius} fill="none"
            strokeWidth="8"
            stroke={strokeColor}
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

function QuestionResult({ result, index }) {
  const [showModel, setShowModel] = useState(false)
  const pct  = result.marks_max > 0 ? Math.round((result.marks_awarded / result.marks_max) * 100) : 0
  const full = result.marks_awarded === result.marks_max
  const blank = result.student_answer_text === 'কোনো উত্তর লেখা হয়নি' || !result.student_answer_text

  return (
    <div className="card space-y-3">

      {/* Question */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="font-ui text-xs text-ink-light mb-1">প্রশ্ন {index + 1}</p>
          <p className="bn text-sm text-ink leading-relaxed font-medium">
            {result.generated_question}
          </p>
        </div>
        <div className={`flex-shrink-0 text-sm font-bold font-ui px-2.5 py-1 rounded-lg ${
          full ? 'bg-forest-light text-forest' :
          pct >= 50 ? 'bg-saffron-light text-saffron-dark' :
          'bg-red-50 text-red-600'
        }`}>
          {result.marks_awarded}/{result.marks_max}
        </div>
      </div>

      {/* Student's answer (OCR) */}
      <div className={`rounded-xl px-3 py-2.5 border ${
        blank
          ? 'bg-gray-50 border-gray-200'
          : 'bg-blue-50 border-blue-200'
      }`}>
        <p className="font-ui text-xs text-ink-light mb-1">তোমার উত্তর</p>
        <p className={`bn text-sm leading-relaxed ${blank ? 'text-ink-light italic' : 'text-ink'}`}>
          {result.student_answer_text || 'কোনো উত্তর লেখা হয়নি'}
        </p>
      </div>

      {/* Feedback */}
      {result.feedback && (
        <div className="bg-cream border border-border rounded-xl px-3 py-2.5">
          <p className="font-ui text-xs text-ink-light mb-1">শিক্ষকের মতামত</p>
          <p className="bn text-sm text-ink leading-relaxed">{result.feedback}</p>
        </div>
      )}

      {/* Model answer toggle */}
      {result.model_answer && (
        <>
          <button
            onClick={() => setShowModel(!showModel)}
            className={`text-sm font-ui font-medium w-full text-left px-3 py-2 rounded-lg transition-colors
              ${showModel ? 'text-saffron' : 'text-ink-light hover:text-saffron'}`}
          >
            {showModel ? '▲ আদর্শ উত্তর লুকান' : '▼ আদর্শ উত্তর দেখুন'}
          </button>
          {showModel && (
            <div className="bg-saffron-light border border-saffron/30 rounded-xl px-3 py-2.5">
              <p className="font-ui text-xs text-saffron-dark mb-1">আদর্শ উত্তর</p>
              <p className="bn text-sm text-ink leading-relaxed">{result.model_answer}</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function ResultsPage() {
  const { state }    = useLocation()
  const navigate     = useNavigate()
  const { token }    = useAuth()

  const [loading,     setLoading]     = useState(false)
  const [sessionData, setSessionData] = useState(null)
  const [evaluations, setEvaluations] = useState([])
  const [error,       setError]       = useState('')

  useEffect(() => {
    // Case 1: fresh evaluation result passed directly (from UploadPage)
    if (state?.result) {
      // result has: score_awarded, score_max, grade, overall_feedback, generated_questions, results
      const r = state.result
      // Merge results with OCR answers and generated questions
      // ocr_answers from backend has student_answer_text per question
      const ocrAnswers = r.ocr_answers || []
      const merged = (r.results || []).map((res, i) => {
        const ocrRow = ocrAnswers[i] || {}
        return {
          generated_question:  r.generated_questions?.[i]?.question || res.generated_question || '',
          marks_awarded:       res.awarded ?? res.marks_awarded ?? 0,
          marks_max:           res.max ?? res.marks_max ?? 0,
          feedback:            res.feedback || '',
          model_answer:        res.model_answer || '',
          // student_answer comes from OCR row, fallback to result field
          student_answer_text: ocrRow.student_answer_text || res.student_answer || res.student_answer_text || '',
        }
      })
      setSessionData({
        score_awarded:    r.score_awarded,
        score_max:        r.score_max,
        grade:            r.grade,
        overall_feedback: r.overall_feedback,
        percentage:       r.percentage,
      })
      setEvaluations(merged)
      return
    }

    // Case 2: viewing from history (session_id passed)
    if (state?.session_id) {
      setLoading(true)
      api.getSession(state.session_id, token)
        .then(data => {
          const s = data.session
          const evals = data.evaluations || []
          setSessionData({
            score_awarded:    s.score_awarded,
            score_max:        s.score_max,
            grade:            s.grade,
            overall_feedback: s.overall_feedback,
            percentage:       s.score_max ? Math.round((s.score_awarded / s.score_max) * 100) : 0,
            chapter_name:     s.chapter_name,
            subject_name:     s.subject_name,
          })
          // Evaluations from DB already have generated_question + student_answer_text
          setEvaluations(evals.sort((a, b) => a.question_index - b.question_index))
        })
        .catch(e => setError(e.message))
        .finally(() => setLoading(false))
      return
    }

    // No state at all
    navigate('/exam/select', { replace: true })
  }, [])

  if (loading) return (
    <div className="min-h-screen bg-cream flex flex-col">
      <ProgressBar currentStep="results" />
      <LoadingMessage message="ফলাফল লোড হচ্ছে..." />
    </div>
  )

  if (error) return (
    <div className="min-h-screen bg-cream flex flex-col">
      <ProgressBar currentStep="results" />
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="card text-center">
          <p className="bn text-red-500 mb-4">{error}</p>
          <button onClick={() => navigate('/exam/my-exams')} className="btn-secondary">
            ← আমার পরীক্ষা
          </button>
        </div>
      </div>
    </div>
  )

  if (!sessionData) return null

  const fromHistory = !!state?.session_id

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <ProgressBar currentStep="results" />

      <div className="flex-1 max-w-app mx-auto w-full px-4 py-5 page-enter">

        {/* Score card */}
        <div className="card mb-5 text-center">
          {fromHistory && sessionData.chapter_name && (
            <p className="bn text-xs text-ink-light mb-2">{sessionData.chapter_name} · {sessionData.subject_name}</p>
          )}
          <h1 className="bn text-lg font-bold text-ink mb-4">ফলাফল</h1>
          <ScoreCircle
            awarded={sessionData.score_awarded}
            max={sessionData.score_max}
            grade={sessionData.grade}
          />
          {sessionData.overall_feedback && (
            <p className="bn text-sm text-ink-light mt-4 leading-relaxed px-2">
              {sessionData.overall_feedback}
            </p>
          )}
        </div>

        {/* Per-question results */}
        <h2 className="bn text-base font-bold text-ink mb-3">প্রশ্নওয়ারি ফলাফল</h2>
        <div className="space-y-3 mb-8">
          {evaluations.map((r, i) => (
            <QuestionResult key={i} result={r} index={i} />
          ))}
        </div>

        {/* Actions */}
        <div className="pb-8 space-y-3">
          {fromHistory ? (
            <button
              onClick={() => navigate('/exam/my-exams')}
              className="btn-secondary"
            >
              ← আমার পরীক্ষা
            </button>
          ) : (
            <>
              <button onClick={() => navigate('/exam/select')} className="btn-primary">
                আবার পরীক্ষা দিন
              </button>
              <button onClick={() => navigate('/exam/my-exams')} className="btn-secondary">
                আমার পরীক্ষার ইতিহাস
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
