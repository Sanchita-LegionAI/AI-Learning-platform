// pages/SelectPage.jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import ProgressBar from '../components/ProgressBar'
import LoadingMessage from '../components/LoadingMessage'
import ErrorMessage from '../components/ErrorMessage'

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

  useEffect(() => {
    api.getCurriculum(token)
      .then(d => setCurriculum(d.curriculum))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [token])

  const subjects  = selectedClass?.subjects || []
  const books     = selectedSubject?.books || []
  const chapters  = selectedBook?.chapters || []

  const canStart = selectedChapter !== null

  const startExam = async () => {
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="bn text-xl font-bold text-ink">পরীক্ষা শুরু করুন</h1>
            <p className="text-sm text-ink-light font-ui">বিষয় ও অধ্যায় বেছে নিন</p>
          </div>
          <button
            onClick={signOut}
            className="text-xs text-ink-light font-ui hover:text-saffron transition-colors"
          >
            লগআউট
          </button>
        </div>

        {error && <ErrorMessage message={error} onRetry={() => setError('')} />}

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
                      <span className={`bn text-sm font-medium ${selectedChapter?.id === ch.id ? 'text-ink' : 'text-ink'}`}>
                        {ch.name_bn}
                      </span>
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
                <button onClick={startExam} className="btn-primary">
                  পরীক্ষা শুরু করুন →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
