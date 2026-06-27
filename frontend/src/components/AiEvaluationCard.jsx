// components/AiEvaluationCard.jsx
// Shows past AI evaluations and lets the student request a new one (once/day).

import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function AiEvaluationCard() {
  const { token } = useAuth()

  const [evaluations, setEvaluations] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [requesting,  setRequesting]  = useState(false)
  const [expanded,    setExpanded]    = useState(null)   // id of expanded eval
  const [error,       setError]       = useState('')
  const [success,     setSuccess]     = useState('')

  useEffect(() => {
    api.getAiEvaluations(token)
      .then(d => setEvaluations(d.evaluations || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [token])

  // Check if today's evaluation already done
  const today = new Date().toDateString()
  const hasToday = evaluations.some(e => new Date(e.created_at).toDateString() === today)

  const handleRequest = async () => {
    setRequesting(true)
    setError('')
    setSuccess('')
    try {
      const result = await api.requestAiEvaluation(token)
      setEvaluations(prev => [result, ...prev])
      setExpanded(result.id)
      setSuccess('নতুন AI মূল্যায়ন তৈরি হয়েছে!')
    } catch (e) {
      setError(e.message)
    } finally {
      setRequesting(false)
    }
  }

  return (
    <div className="card space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">🤖</span>
          <div>
            <h2 className="bn text-sm font-bold text-ink">AI মূল্যায়ন</h2>
            <p className="bn text-xs text-ink-light">তোমার পরীক্ষার বিশ্লেষণ ও পরামর্শ</p>
          </div>
        </div>

        {/* Request button */}
        <button
          onClick={handleRequest}
          disabled={requesting || hasToday}
          title={hasToday ? 'আজকের মূল্যায়ন ইতিমধ্যে নেওয়া হয়েছে' : 'নতুন মূল্যায়ন চাও'}
          className={`text-xs font-ui font-semibold px-3 py-2 rounded-xl border transition-all shrink-0
            ${hasToday
              ? 'border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed'
              : 'border-saffron/40 text-saffron bg-saffron-light hover:bg-saffron hover:text-white'}`}
        >
          {requesting
            ? '…'
            : hasToday
              ? '✓ আজ মূল্যায়ন হয়েছে'
              : '+ নতুন মূল্যায়ন'}
        </button>
      </div>

      {/* Daily limit note */}
      <p className="text-xs font-ui text-ink-light">
        প্রতিদিন একবার · শেষ ১০টি পরীক্ষার ভিত্তিতে
      </p>

      {/* Error / success */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <p className="bn text-xs text-red-700">{error}</p>
        </div>
      )}
      {success && (
        <div className="bg-forest-light border border-forest/30 rounded-lg px-3 py-2">
          <p className="bn text-xs text-forest">{success}</p>
        </div>
      )}

      {/* List of evaluations */}
      {loading ? (
        <p className="bn text-xs text-ink-light text-center py-3">লোড হচ্ছে…</p>
      ) : evaluations.length === 0 ? (
        <div className="bg-cream border border-border rounded-xl px-4 py-5 text-center">
          <p className="text-2xl mb-2">📋</p>
          <p className="bn text-sm text-ink-light">এখনো কোনো মূল্যায়ন নেই।</p>
          <p className="bn text-xs text-ink-light mt-1">
            কমপক্ষে একটি পরীক্ষা দেওয়ার পর মূল্যায়ন চাইতে পারবে।
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {evaluations.map(ev => (
            <div key={ev.id}
              className="border border-border rounded-xl overflow-hidden">

              {/* Eval header row */}
              <button
                className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 transition-colors text-left"
                onClick={() => setExpanded(expanded === ev.id ? null : ev.id)}
              >
                <div>
                  <p className="bn text-xs font-semibold text-ink">{formatDate(ev.created_at)}</p>
                  <p className="text-[11px] font-ui text-ink-light mt-0.5">
                    {String(ev.session_count).replace(/[0-9]/g, d => "০১২৩৪৫৬৭৮৯"[d])}টি পরীক্ষার ভিত্তিতে
                  </p>
                </div>
                <span className="text-ink-light text-xs ml-2">
                  {expanded === ev.id ? '▲' : '▼'}
                </span>
              </button>

              {/* Expanded content */}
              {expanded === ev.id && (
                <div className="border-t border-border px-4 py-4 bg-cream/50">
                  <p className="bn text-sm text-ink leading-relaxed whitespace-pre-wrap">
                    {ev.full_response_bn}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
