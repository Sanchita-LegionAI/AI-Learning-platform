// pages/ResultsPage.jsx
// Shows combined Part 1 + Part 2 results with per-question breakdown.

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
  const stroke = grade?.startsWith('A') ? '#2D7A4F' : grade === 'B+' || grade === 'B' ? '#E8871E' : '#EF4444'

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-32 h-32">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="#E8E0D0" strokeWidth="8" />
          <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="8"
            stroke={stroke}
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

// Part 1 question result (machine evaluated)
function Part1Result({ result, index }) {
  const full = result.is_correct
  const pct  = result.marks_max > 0 ? Math.round((result.marks_awarded / result.marks_max) * 100) : 0

  const TYPE_LABEL = {
    mcq: 'MCQ', true_false: 'সত্য/মিথ্যা',
    match_pairs: 'মেলাও', tap_sequence: 'ক্রম', categorize: 'দলভাগ',
  }

  return (
    <div className="card space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-ui text-ink-light bg-cream px-2 py-0.5 rounded-full border border-border">
              {TYPE_LABEL[result.q_type] || result.q_type}
            </span>
          </div>
          <p className="bn text-sm text-ink leading-relaxed">{result.question_bn}</p>
        </div>
        <div className={`flex-shrink-0 text-sm font-bold font-ui px-2.5 py-1 rounded-lg ${
          full ? 'bg-forest-light text-forest' : pct >= 50 ? 'bg-saffron-light text-saffron-dark' : 'bg-red-50 text-red-600'
        }`}>
          {result.marks_awarded}/{result.marks_max}
        </div>
      </div>

      {!full && result.correct_answer !== undefined && result.correct_answer !== null && (
        <div className="bg-forest-light border border-forest/30 rounded-xl px-3 py-2">
          <p className="text-xs font-ui text-forest mb-0.5">সঠিক উত্তর</p>
          <p className="bn text-sm text-ink">
            {typeof result.correct_answer === 'object'
              ? JSON.stringify(result.correct_answer)
              : String(result.correct_answer)}
          </p>
        </div>
      )}
    </div>
  )
}

// Part 2 question result (LLM evaluated)
function Part2Result({ result, index }) {
  const [showModel, setShowModel] = useState(false)
  const full = result.is_correct

  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <span className="text-[10px] font-ui text-ink-light bg-pink-50 border border-pink-200 px-2 py-0.5 rounded-full">
            লেখার উত্তর
          </span>
          <p className="bn text-sm text-ink leading-relaxed mt-1">{result.question_bn}</p>
        </div>
        <div className={`flex-shrink-0 text-sm font-bold font-ui px-2.5 py-1 rounded-lg ${
          full ? 'bg-forest-light text-forest' : 'bg-red-50 text-red-600'
        }`}>
          {result.marks_awarded}/{result.marks_max}
        </div>
      </div>

      {/* Student's answer */}
      <div className={`rounded-xl px-3 py-2.5 border ${
        result.student_answer === 'কোনো উত্তর লেখা হয়নি' || !result.student_answer
          ? 'bg-gray-50 border-gray-200'
          : 'bg-blue-50 border-blue-200'
      }`}>
        <p className="font-ui text-xs text-ink-light mb-0.5">তোমার উত্তর</p>
        <p className="bn text-sm text-ink">{result.student_answer || 'কোনো উত্তর লেখা হয়নি'}</p>
      </div>

      {/* Correct answer */}
      {result.correct_answer && (
        <div className="bg-forest-light border border-forest/30 rounded-xl px-3 py-2">
          <p className="text-xs font-ui text-forest mb-0.5">সঠিক উত্তর</p>
          <p className="bn text-sm text-ink">{result.correct_answer}</p>
        </div>
      )}

      {/* Feedback */}
      {result.feedback_bn && (
        <div className="bg-cream border border-border rounded-xl px-3 py-2.5">
          <p className="font-ui text-xs text-ink-light mb-1">মতামত</p>
          <p className="bn text-sm text-ink leading-relaxed">{result.feedback_bn}</p>
        </div>
      )}
    </div>
  )
}

export default function ResultsPage() {
  const { state }  = useLocation()
  const navigate   = useNavigate()
  const { token }  = useAuth()

  const [loading,     setLoading]     = useState(false)
  const [sessionData, setSessionData] = useState(null)
  const [part1Evals,  setPart1Evals]  = useState([])
  const [part2Evals,  setPart2Evals]  = useState([])
  const [error,       setError]       = useState('')

  useEffect(() => {
    // Fresh evaluation result passed from OcrReviewPage
    if (state?.result) {
      const r = state.result
      setSessionData({
        score_awarded:    r.total_score_awarded,
        score_max:        r.total_score_max,
        grade:            r.grade,
        percentage:       r.percentage,
        overall_feedback: r.overall_feedback_bn,
        p1_awarded:       state.part1_result?.score_awarded,
        p1_max:           state.part1_result?.score_max,
        p2_awarded:       r.part2_score_awarded,
        p2_max:           r.part2_score_max,
      })
      setPart1Evals(state.part1_result?.results || [])
      setPart2Evals(r.results || [])
      return
    }

    // Viewing from history
    if (state?.session_id) {
      setLoading(true)
      api.getSession(state.session_id, token)
        .then(data => {
          const s = data.session
          setSessionData({
            score_awarded:    s.score_awarded,
            score_max:        s.score_max,
            grade:            s.grade,
            percentage:       s.score_max ? Math.round((s.score_awarded / s.score_max) * 100) : 0,
            p1_awarded:       s.part1_score_awarded,
            p1_max:           s.part1_score_max,
            p2_awarded:       s.part2_score_awarded,
            p2_max:           s.part2_score_max,
            chapter_name:     s.chapter_name,
            subject_name:     s.subject_name,
          })
          setPart1Evals((data.part1_evals || []).sort((a,b) => a.question_index - b.question_index))
          setPart2Evals((data.part2_evals || []).sort((a,b) => a.question_index - b.question_index))
        })
        .catch(e => setError(e.message))
        .finally(() => setLoading(false))
      return
    }

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
          <button onClick={() => navigate('/exam/my-exams')} className="btn-secondary">← আমার পরীক্ষা</button>
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

        {/* Overall score card */}
        <div className="card mb-4 text-center">
          {fromHistory && sessionData.chapter_name && (
            <p className="bn text-xs text-ink-light mb-2">{sessionData.chapter_name} · {sessionData.subject_name}</p>
          )}
          <h1 className="bn text-lg font-bold text-ink mb-4">চূড়ান্ত ফলাফল</h1>
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

        {/* Part score breakdown */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="card text-center bg-blue-50 border-blue-200">
            <p className="text-xs font-ui text-blue-600 mb-1">প্রথম অংশ</p>
            <p className="text-xl font-bold font-ui text-blue-800">
              {sessionData.p1_awarded ?? '—'}/{sessionData.p1_max ?? '—'}
            </p>
            <p className="text-xs font-ui text-blue-500 mt-0.5">ট্যাপ করে উত্তর</p>
          </div>
          <div className="card text-center bg-pink-50 border-pink-200">
            <p className="text-xs font-ui text-pink-600 mb-1">দ্বিতীয় অংশ</p>
            <p className="text-xl font-bold font-ui text-pink-800">
              {sessionData.p2_awarded ?? '—'}/{sessionData.p2_max ?? '—'}
            </p>
            <p className="text-xs font-ui text-pink-500 mt-0.5">লেখার উত্তর</p>
          </div>
        </div>

        {/* Part 1 results */}
        {part1Evals.length > 0 && (
          <>
            <h2 className="bn text-base font-bold text-ink mb-3">প্রথম অংশ — বিস্তারিত</h2>
            <div className="space-y-3 mb-5">
              {part1Evals.map((r, i) => (
                <Part1Result key={i} result={r} index={i} />
              ))}
            </div>
          </>
        )}

        {/* Part 2 results */}
        {part2Evals.length > 0 && (
          <>
            <h2 className="bn text-base font-bold text-ink mb-3">দ্বিতীয় অংশ — বিস্তারিত</h2>
            <div className="space-y-3 mb-5">
              {part2Evals.map((r, i) => (
                <Part2Result key={i} result={r} index={i} />
              ))}
            </div>
          </>
        )}

        {/* Actions */}
        <div className="pb-8 space-y-3">
          {fromHistory ? (
            <button onClick={() => navigate('/exam/my-exams')} className="btn-secondary">
              ← আমার পরীক্ষা
            </button>
          ) : (
            <>
              <button onClick={() => navigate('/exam/select')} className="btn-primary">
                আবার পরীক্ষা দাও
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
