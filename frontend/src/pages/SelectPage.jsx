// pages/SelectPage.jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import ProgressBar from '../components/ProgressBar'
import LoadingMessage from '../components/LoadingMessage'
import ErrorMessage from '../components/ErrorMessage'

const MAX_ACTIVE_EXAMS = 5

export default function SelectPage() {
  const { token, user, signOut } = useAuth()
  const navigate = useNavigate()

  const [curriculum, setCurriculum] = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')

  const [selectedClass,   setSelectedClass]   = useState(null)
  const [selectedSubject, setSelectedSubject] = useState(null)
  const [selectedBook,    setSelectedBook]    = useState(null)
  const [selectedChapter, setSelectedChapter] = useState(null)
  const [starting, setStarting]               = useState(false)

  const [activeExamCount, setActiveExamCount] = useState(0)

  const displayName = user?.user_metadata?.full_name || user?.email || user?.phone || ''

  useEffect(() => {
    api.getCurriculum(token)
      .then(d => setCurriculum(d.curriculum))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))

    // Check active exam count
    api.getMySessions(token)
      .then(d => {
        const active = (d.sessions || []).filter(s => !s.completed)
        setActiveExamCount(active.length)
      })
      .catch(() => {})
  }, [token])

  const subjects  = selectedClass?.subjects || []
  const books     = selectedSubject?.books || []
  const chapters  = selectedBook?.chapters || []
  const canStart  = selectedChapter !== null

  const startExam = async () => {
    if (activeExamCount >= MAX_ACTIVE_EXAMS) {
      setError(`আপনার ${MAX_ACTIVE_EXAMS}টি পরীক্ষা চলছে। নতুন পরীক্ষা শুরু করতে আগে একটি শেষ করুন বা বাতিল করুন।`)
      return
    }
    setStarting(true)
    try {
      const data = await api.generateExam(selectedChapter.id, token)
      navigate('/exam/paper', { state: { examData: data } })
    } catch (e) {
      setError(e.message)
      setStarting(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-cream flex flex-col">
      <ProgressBar currentStep="select" />
      <LoadingMessage message="পাঠ্যক্রম লোড হচ্ছে..." />
    </div>
  )

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <ProgressBar currentStep="select" />

      <div className="flex-1 max-w-app mx-auto w-full px-4 py-6 space-y-5 page-enter">

        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="bn text-xl font-bold text-ink">পরীক্ষা শুরু করুন</h1>
            {displayName && (
              <p className="text-xs text-ink-light font-ui mt-0.5 truncate">
                স্বাগতম, {displayName}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <button
              onClick={() => navigate('/exam/my-exams')}
              className="relative flex items-center gap-1.5 bg-saffron-light border border-saffron/30 text-saffron-dark text-xs font-ui font-medium px-3 py-1.5 rounded-xl hover:bg-saffron hover:text-white transition-all"
            >
              📋 আমার পরীক্ষা
              {activeExamCount > 0 && (
                <span className="w-4 h-4 bg-saffron text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                  {activeExamCount}
                </span>
              )}
            </button>
            <button
              onClick={signOut}
              className="text-xs text-ink-light font-ui hover:text-saffron transition-colors"
            >
              লগআউট
            </button>
          </div>
        </div>

        {error && <ErrorMessage message={error} onRetry={() => setError('')} />}

        {/* Active exam warning */}
        {activeExamCount >= MAX_ACTIVE_EXAMS && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="bn text-sm text-red-700 font-medium mb-1">
              ⚠️ সর্বোচ্চ পরীক্ষার সীমায় পৌঁছেছেন
            </p>
            <p className="bn text-xs text-red-600">
              নতুন পরীক্ষা শুরু করতে{' '}
              <button
                onClick={() => navigate('/exam/my-exams')}
                className="underline font-medium"
              >
                আমার পরীক্ষায়
              </button>
              {' '}গিয়ে একটি বাতিল করুন।
            </p>
          </div>
        )}

        {starting && <LoadingMessage message="প্রশ্ন তৈরি হচ্ছে..." />}

        {!starting && (
          <>
            {/* Class */}
            <div className="card">
              <p className="label">শ্রেণী</p>
              <div className="grid grid-cols-3 gap-2">
                {curriculum.map(cls => (
                  <button
                    key={cls.id}
                    onClick={() => {
                      setSelectedClass(cls)
                      setSelectedSubject(null)
                      setSelectedBook(null)
                      setSelectedChapter(null)
                    }}
                    className={`py-2.5 rounded-xl text-sm font-ui font-medium border transition-all
                      ${selectedClass?.id === cls.id
                        ? 'bg-saffron text-white border-saffron'
                        : 'bg-white text-ink border-border hover:border-saffron hover:text-saffron'
                      }`}
                  >
                    {cls.display_name_bn}
                  </button>
                ))}
              </div>
            </div>

            {/* Subject */}
            {selectedClass && (
              <div className="card page-enter">
                <p className="label">বিষয়</p>
                <div className="grid grid-cols-2 gap-2">
                  {subjects.map(sub => (
                    <button
                      key={sub.id}
                      onClick={() => {
                        setSelectedSubject(sub)
                        setSelectedBook(sub.books[0] || null)
                        setSelectedChapter(null)
                      }}
                      className={`py-2.5 rounded-xl text-sm font-ui font-medium border transition-all
                        ${selectedSubject?.id === sub.id
                          ? 'bg-saffron text-white border-saffron'
                          : 'bg-white text-ink border-border hover:border-saffron hover:text-saffron'
                        }`}
                    >
                      {sub.display_name_bn}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Chapter */}
            {selectedBook && (
              <div className="card page-enter">
                <p className="label">অধ্যায়</p>
                <div className="space-y-2">
                  {chapters.map(ch => (
                    <button
                      key={ch.id}
                      onClick={() => setSelectedChapter(ch)}
                      className={`w-full text-left px-4 py-3 rounded-xl border transition-all
                        ${selectedChapter?.id === ch.id
                          ? 'bg-saffron-light border-saffron'
                          : 'bg-white border-border hover:border-saffron'
                        }`}
                    >
                      <span className={`text-xs font-ui mr-2 ${selectedChapter?.id === ch.id ? 'text-saffron-dark' : 'text-ink-light'}`}>
                        অধ্যায় {ch.chapter_number}
                      </span>
                      <span className="bn text-sm font-medium text-ink">{ch.name_bn}</span>
                      {ch.subtitle_bn && (
                        <p className={`bn text-xs mt-0.5 ${selectedChapter?.id === ch.id ? 'text-ink-light' : 'text-ink-light/70'}`}>
                          {ch.subtitle_bn}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Start button */}
            {canStart && (
              <div className="page-enter pb-6">
                <div className="bg-saffron-light border border-saffron/30 rounded-xl px-4 py-3 mb-4">
                  <p className="text-xs font-ui text-saffron-dark mb-0.5">নির্বাচিত অধ্যায়</p>
                  <p className="bn text-sm font-medium text-ink">{selectedChapter.name_bn}</p>
                  <p className="text-xs font-ui text-ink-light mt-0.5">
                    {selectedSubject?.display_name_bn} · {selectedClass?.display_name_bn}
                  </p>
                </div>
                <button
                  onClick={startExam}
                  disabled={activeExamCount >= MAX_ACTIVE_EXAMS}
                  className={`btn-primary ${activeExamCount >= MAX_ACTIVE_EXAMS ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  পরীক্ষা শুরু করুন →
                </button>
                {activeExamCount > 0 && activeExamCount < MAX_ACTIVE_EXAMS && (
                  <p className="text-xs text-ink-light font-ui text-center mt-2">
                    {MAX_ACTIVE_EXAMS - activeExamCount}টি পরীক্ষা আর শুরু করা যাবে
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
