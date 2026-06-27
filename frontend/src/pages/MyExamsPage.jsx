// pages/MyExamsPage.jsx
// Shows all exam sessions: active (pending/uploaded) and completed (history)
// Users can resume active exams, cancel/delete pending ones, view results

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import ProgressBar from '../components/ProgressBar'
import LoadingMessage from '../components/LoadingMessage'

const MAX_ACTIVE_EXAMS = 5

const GRADE_COLOR = {
  'A+': 'text-emerald-700 bg-emerald-50 border-emerald-200',
  'A':  'text-emerald-600 bg-emerald-50 border-emerald-200',
  'B+': 'text-blue-700 bg-blue-50 border-blue-200',
  'B':  'text-blue-600 bg-blue-50 border-blue-200',
  'C':  'text-amber-700 bg-amber-50 border-amber-200',
  'D':  'text-red-600 bg-red-50 border-red-200',
}

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('bn-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString('bn-IN', { hour: '2-digit', minute: '2-digit' })
}

export default function MyExamsPage() {
  const { token, signOut } = useAuth()
  const navigate = useNavigate()

  const [sessions, setSessions] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [deleting, setDeleting] = useState(null) // session id being deleted
  const [activeTab, setActiveTab] = useState('active') // active | history

  const load = () => {
    setLoading(true)
    api.getMySessions(token)
      .then(d => setSessions(d.sessions || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [token])

  const activeSessions    = sessions.filter(s => !s.completed)
  const completedSessions = sessions.filter(s => s.completed)
    .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at))

  const handleDelete = async (sessionId) => {
    if (!window.confirm('এই পরীক্ষাটি বাতিল করবেন? এটি ফিরিয়ে আনা যাবে না।')) return
    setDeleting(sessionId)
    try {
      await api.deleteSession(sessionId, token)
      setSessions(prev => prev.filter(s => s.id !== sessionId))
    } catch (e) {
      alert('মুছতে পারা গেল না: ' + e.message)
    } finally {
      setDeleting(null)
    }
  }

  const handleResume = (session) => {
    const examData = {
      session_id:        session.id,
      chapter_name:      session.chapter_name,
      subject:           session.subject_name,
      part1_max_marks:   session.part1_score_max,
      part2_max_marks:   session.part2_score_max,
    }
    const part1_result = session.part1_completed ? {
      score_awarded: session.part1_score_awarded,
      score_max:     session.part1_score_max,
      percentage:    session.part1_score_max > 0
        ? Math.round((session.part1_score_awarded / session.part1_score_max) * 100) : 0,
      grade: '',
    } : null

    if (session.answer_image_key) {
      navigate('/exam/results', { state: { session_id: session.id, fromHistory: true } })
    } else if (session.part2_completed) {
      navigate('/exam/results', { state: { session_id: session.id, fromHistory: true } })
    } else if (session.part1_completed && session.part2_questions?.length > 0) {
      navigate('/exam/transition', {
        state: { session_id: session.id, part1_result, part2_questions: session.part2_questions, examData }
      })
    } else if (session.part1_questions?.length > 0) {
      navigate('/exam/part1', {
        state: { session_id: session.id, part1_questions: session.part1_questions, part2_questions: session.part2_questions || [], examData }
      })
    } else {
      navigate('/exam/select')
    }
  }

  const handleViewResult = (session) => {
    navigate('/exam/results', { state: { session_id: session.id, fromHistory: true } })
  }

  const statusLabel = (s) => {
    if (s.completed)           return { text: 'মূল্যায়িত',    color: 'bg-emerald-100 text-emerald-700' }
    if (s.answer_image_key)    return { text: 'মূল্যায়ন বাকি', color: 'bg-amber-100 text-amber-700' }
    if (s.part1_completed)     return { text: 'উত্তর বাকি',   color: 'bg-blue-100 text-blue-700' }
    if (s.part1_questions?.length > 0) return { text: 'অসমাপ্ত', color: 'bg-gray-100 text-gray-500' }
    return { text: 'শুরু হয়নি',  color: 'bg-gray-100 text-gray-500' }
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <ProgressBar currentStep="select" />

      <div className="flex-1 max-w-app mx-auto w-full px-4 py-6 page-enter">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="bn text-xl font-bold text-ink">আমার পরীক্ষা</h1>
            <p className="text-xs text-ink-light font-ui mt-0.5">পরীক্ষার ইতিহাস ও চলমান পরীক্ষা</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => navigate('/exam/select')}
              className="text-xs font-ui text-saffron border border-saffron/30 px-3 py-1.5 rounded-lg hover:bg-saffron-light transition-colors"
            >
              + নতুন পরীক্ষা
            </button>
            <button
              onClick={signOut}
              className="text-xs text-ink-light font-ui hover:text-saffron transition-colors"
            >
              লগআউট
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
            <p className="bn text-sm text-red-600">{error}</p>
          </div>
        )}

        {loading ? (
          <LoadingMessage message="পরীক্ষা লোড হচ্ছে..." />
        ) : (
          <>
            {/* Active exam count banner */}
            {activeSessions.length > 0 && (
              <div className={`rounded-xl px-4 py-3 mb-5 border ${
                activeSessions.length >= MAX_ACTIVE_EXAMS
                  ? 'bg-red-50 border-red-200'
                  : 'bg-saffron-light border-saffron/30'
              }`}>
                <p className={`bn text-sm font-medium ${activeSessions.length >= MAX_ACTIVE_EXAMS ? 'text-red-700' : 'text-saffron-dark'}`}>
                  {activeSessions.length >= MAX_ACTIVE_EXAMS
                    ? `⚠️ সর্বোচ্চ ${MAX_ACTIVE_EXAMS}টি পরীক্ষা একসাথে চলতে পারে। নতুন পরীক্ষা শুরু করতে একটি বাতিল করুন।`
                    : `${activeSessions.length}টি পরীক্ষা চলছে (সর্বোচ্চ ${MAX_ACTIVE_EXAMS}টি)`
                  }
                </p>
              </div>
            )}

            {/* Tabs */}
            <div className="flex border-b border-border mb-4">
              {[
                { key: 'active',  label: `চলমান (${activeSessions.length})` },
                { key: 'history', label: `ইতিহাস (${completedSessions.length})` },
              ].map(t => (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`bn text-sm font-medium px-4 py-2.5 border-b-2 transition-colors ${
                    activeTab === t.key
                      ? 'border-saffron text-saffron'
                      : 'border-transparent text-ink-light hover:text-ink'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── Active exams ── */}
            {activeTab === 'active' && (
              <div className="space-y-3">
                {activeSessions.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-4xl mb-3">📝</p>
                    <p className="bn text-sm text-ink-light">কোনো চলমান পরীক্ষা নেই</p>
                    <button
                      onClick={() => navigate('/exam/select')}
                      className="mt-4 btn-primary w-auto px-6 inline-block"
                    >
                      নতুন পরীক্ষা শুরু করুন
                    </button>
                  </div>
                ) : activeSessions.map(s => {
                  const status = statusLabel(s)
                  const isDeleting = deleting === s.id
                  return (
                    <div key={s.id} className="card">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="bn text-sm font-semibold text-ink truncate">
                            {s.chapter_name || 'অধ্যায়'}
                          </p>
                          <p className="bn text-xs text-ink-light mt-0.5">
                            {s.subject_name} · {formatDate(s.started_at)} {formatTime(s.started_at)}
                          </p>
                        </div>
                        <span className={`flex-shrink-0 text-xs font-ui px-2 py-0.5 rounded-full ${status.color}`}>
                          {status.text}
                        </span>
                      </div>

                      {s.generated_questions && (
                        <p className="text-xs font-ui text-ink-light mb-3">
                          {s.generated_questions.length}টি প্রশ্ন ·{' '}
                          {s.generated_questions.reduce((t, q) => t + (q.marks || 0), 0)} নম্বর
                        </p>
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={() => handleResume(s)}
                          className="flex-1 py-2 rounded-xl text-sm font-ui font-medium bg-saffron text-white hover:bg-saffron/90 transition-colors"
                        >
                          {s.answer_image_key ? 'ফলাফল দেখুন' : 'চালিয়ে যান →'}
                        </button>
                        <button
                          onClick={() => handleDelete(s.id)}
                          disabled={isDeleting}
                          className="px-3 py-2 rounded-xl text-sm font-ui text-red-500 border border-red-200 hover:bg-red-50 transition-colors"
                        >
                          {isDeleting ? '...' : 'বাতিল'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* ── History ── */}
            {activeTab === 'history' && (
              <div className="space-y-3">
                {completedSessions.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-4xl mb-3">🏆</p>
                    <p className="bn text-sm text-ink-light">এখনও কোনো পরীক্ষা সম্পন্ন হয়নি</p>
                  </div>
                ) : completedSessions.map(s => {
                  const pct = s.score_max ? Math.round((s.score_awarded / s.score_max) * 100) : 0
                  const gradeClass = GRADE_COLOR[s.grade] || 'text-gray-700 bg-gray-50 border-gray-200'
                  return (
                    <div key={s.id} className="card">
                      <div className="flex items-start gap-3">
                        {/* Score circle */}
                        <div className="flex-shrink-0 w-14 h-14 rounded-full border-2 border-saffron/30 bg-saffron-light flex flex-col items-center justify-center">
                          <span className="text-saffron font-bold text-base leading-tight">{s.score_awarded}</span>
                          <span className="text-xs text-saffron-dark font-ui">/{s.score_max}</span>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="bn text-sm font-semibold text-ink truncate flex-1">
                              {s.chapter_name || 'অধ্যায়'}
                            </p>
                            {s.grade && (
                              <span className={`text-xs font-ui font-bold px-2 py-0.5 rounded-lg border flex-shrink-0 ${gradeClass}`}>
                                {s.grade}
                              </span>
                            )}
                          </div>
                          <p className="bn text-xs text-ink-light">
                            {s.subject_name}
                          </p>
                          <p className="text-xs text-ink-light font-ui mt-0.5">
                            {formatDate(s.submitted_at)} · {pct}%
                          </p>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="mt-3 bg-gray-100 rounded-full h-1.5">
                        <div
                          className="h-1.5 rounded-full bg-saffron transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>

                      <button
                        onClick={() => handleViewResult(s)}
                        className="mt-3 w-full py-2 rounded-xl text-sm font-ui border border-border text-ink hover:border-saffron hover:text-saffron transition-colors"
                      >
                        বিস্তারিত ফলাফল →
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
