// components/AiEvaluationCard.jsx
// Subject-wise AI evaluation (once per WEEK).
// Student picks a subject (book) → backend computes deterministic stats from
// ALL completed exams of that subject → LLM writes grounded Bengali feedback.
// Expanded view shows the hard stats first, AI commentary below.

import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

const COOLDOWN_DAYS = 7

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' })
}

function bnNum(n) {
  return String(n ?? '').replace(/[0-9]/g, d => '০১২৩৪৫৬৭৮৯'[d])
}

// ── Deterministic stats block (rendered from stats_json) ─────────────────────
function StatsBlock({ stats }) {
  if (!stats) return null
  const weakTopics = (stats.topics || []).filter(t => t.accuracy_pct < 60).slice(0, 6)

  return (
    <div className="space-y-3 mb-4">
      {/* Overview line */}
      <div className="flex flex-wrap gap-2">
        <span className="bn text-[11px] px-2 py-1 rounded-lg bg-saffron-light text-ink border border-saffron/30">
          {bnNum(stats.exam_count)}টি পরীক্ষা
        </span>
        <span className="bn text-[11px] px-2 py-1 rounded-lg bg-saffron-light text-ink border border-saffron/30">
          অধ্যায় {bnNum(stats.chapters_attempted)}/{bnNum(stats.chapters_total)}
        </span>
        <span className="bn text-[11px] px-2 py-1 rounded-lg bg-saffron-light text-ink border border-saffron/30">
          সঠিকতা {bnNum(stats.overall_accuracy_pct)}%
        </span>
        <span className="bn text-[11px] px-2 py-1 rounded-lg bg-forest-light text-forest border border-forest/30">
          আয়ত্তে {bnNum(stats.mastered_count)}
        </span>
        {stats.recovered_count > 0 && (
          <span className="bn text-[11px] px-2 py-1 rounded-lg bg-forest-light text-forest border border-forest/30">
            উন্নতি {bnNum(stats.recovered_count)}
          </span>
        )}
      </div>

      {/* Chapter accuracy */}
      {(stats.chapters || []).length > 0 && (
        <div>
          <p className="bn text-xs font-bold text-ink mb-1.5">অধ্যায়ভিত্তিক সঠিকতা</p>
          <div className="space-y-1.5">
            {stats.chapters.map(c => (
              <div key={c.chapter_number}>
                <div className="flex justify-between items-baseline">
                  <p className="bn text-[11px] text-ink truncate pr-2">
                    {bnNum(c.chapter_number)}. {c.name_bn}
                  </p>
                  <p className="text-[11px] font-ui text-ink-light shrink-0">
                    {bnNum(c.accuracy_pct)}% · {bnNum(c.exams)}টি
                  </p>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      c.accuracy_pct >= 75 ? 'bg-forest'
                      : c.accuracy_pct >= 50 ? 'bg-saffron'
                      : 'bg-red-400'}`}
                    style={{ width: `${Math.min(c.accuracy_pct, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weak topics */}
      {weakTopics.length > 0 && (
        <div>
          <p className="bn text-xs font-bold text-ink mb-1">দুর্বল টপিক</p>
          <div className="flex flex-wrap gap-1.5">
            {weakTopics.map((t, i) => (
              <span key={i}
                className="bn text-[11px] px-2 py-1 rounded-lg bg-red-50 text-red-700 border border-red-200">
                {t.topic_bn} ({bnNum(t.accuracy_pct)}%)
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Repeatedly wrong questions */}
      {(stats.repeatedly_wrong || []).length > 0 && (
        <div>
          <p className="bn text-xs font-bold text-red-700 mb-1">
            ⚠ বারবার ভুল হওয়া প্রশ্ন ({bnNum(stats.repeated_wrong_count)}টি)
          </p>
          <ul className="space-y-1">
            {stats.repeatedly_wrong.map((q, i) => (
              <li key={i} className="bn text-[11px] text-ink bg-red-50/60 border border-red-100 rounded-lg px-2 py-1.5">
                {q.question_bn}
                <span className="text-red-600">
                  {' '}— ভুল {bnNum(q.wrong)}/{bnNum(q.attempts)} বার
                  {q.topic_bn ? ` · ${q.topic_bn}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ── Main card ────────────────────────────────────────────────────────────────
export default function AiEvaluationCard() {
  const { token } = useAuth()

  const [evaluations, setEvaluations] = useState([])
  const [books,       setBooks]       = useState([])   // flattened book list
  const [bookId,      setBookId]      = useState('')
  const [loading,     setLoading]     = useState(true)
  const [requesting,  setRequesting]  = useState(false)
  const [expanded,    setExpanded]    = useState(null)
  const [error,       setError]       = useState('')
  const [success,     setSuccess]     = useState('')

  useEffect(() => {
    Promise.all([
      api.getAiEvaluations(token).catch(() => ({ evaluations: [] })),
      api.getCurriculum(token).catch(() => ({ curriculum: [] })),
    ])
      .then(([evalData, currData]) => {
        setEvaluations(evalData.evaluations || [])

        // Flatten curriculum → [{id, label}]
        const flat = []
        for (const cls of currData.curriculum || []) {
          for (const sub of cls.subjects || []) {
            for (const book of sub.books || []) {
              flat.push({
                id:    book.id,
                label: `${sub.display_name_bn} — ${book.title_bn} (${cls.display_name_bn})`,
              })
            }
          }
        }
        setBooks(flat)
        if (flat.length > 0) setBookId(String(flat[0].id))
      })
      .finally(() => setLoading(false))
  }, [token])

  // Weekly limit: latest evaluation + 7 days
  const latest = evaluations[0]
  let nextAvailable = null
  if (latest) {
    const next = new Date(latest.created_at)
    next.setDate(next.getDate() + COOLDOWN_DAYS)
    if (next > new Date()) nextAvailable = next
  }
  const onCooldown = !!nextAvailable

  const handleRequest = async () => {
    if (!bookId) return
    setRequesting(true)
    setError('')
    setSuccess('')
    try {
      const result = await api.requestAiEvaluation(Number(bookId), token)
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
      <div className="flex items-center gap-2">
        <span className="text-xl">🤖</span>
        <div>
          <h2 className="bn text-sm font-bold text-ink">AI মূল্যায়ন</h2>
          <p className="bn text-xs text-ink-light">বিষয়ভিত্তিক বিশ্লেষণ ও পরামর্শ</p>
        </div>
      </div>

      {/* Subject picker + request button */}
      <div className="flex items-center gap-2">
        <select
          value={bookId}
          onChange={e => setBookId(e.target.value)}
          disabled={requesting || onCooldown || books.length === 0}
          className="bn flex-1 text-xs border border-border rounded-xl px-2 py-2 bg-white text-ink disabled:bg-gray-50 disabled:text-gray-400"
        >
          {books.length === 0
            ? <option value="">কোনো বিষয় নেই</option>
            : books.map(b => (
                <option key={b.id} value={b.id}>{b.label}</option>
              ))}
        </select>

        <button
          onClick={handleRequest}
          disabled={requesting || onCooldown || !bookId}
          title={onCooldown ? 'এই সপ্তাহের মূল্যায়ন ইতিমধ্যে নেওয়া হয়েছে' : 'নতুন মূল্যায়ন চাও'}
          className={`text-xs font-ui font-semibold px-3 py-2 rounded-xl border transition-all shrink-0
            ${(onCooldown || !bookId)
              ? 'border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed'
              : 'border-saffron/40 text-saffron bg-saffron-light hover:bg-saffron hover:text-white'}`}
        >
          {requesting ? '…' : onCooldown ? '✓ হয়েছে' : '+ মূল্যায়ন'}
        </button>
      </div>

      {/* Weekly limit note */}
      <p className="bn text-xs text-ink-light">
        {onCooldown
          ? `পরবর্তী মূল্যায়ন: ${formatDate(nextAvailable.toISOString())} · এর মধ্যে আরও পরীক্ষা দাও!`
          : 'সপ্তাহে একবার · নির্বাচিত বিষয়ের সব পরীক্ষার ভিত্তিতে'}
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
            একটি বিষয়ে কমপক্ষে ২টি পরীক্ষা দেওয়ার পর মূল্যায়ন চাইতে পারবে।
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
                  <p className="bn text-xs font-semibold text-ink">
                    {ev.book_title_bn ? `${ev.book_title_bn} · ` : ''}{formatDate(ev.created_at)}
                  </p>
                  <p className="text-[11px] font-ui text-ink-light mt-0.5">
                    {bnNum(ev.session_count)}টি পরীক্ষার ভিত্তিতে
                  </p>
                </div>
                <span className="text-ink-light text-xs ml-2">
                  {expanded === ev.id ? '▲' : '▼'}
                </span>
              </button>

              {/* Expanded content: deterministic stats first, AI text below */}
              {expanded === ev.id && (
                <div className="border-t border-border px-4 py-4 bg-cream/50">
                  <StatsBlock stats={ev.stats_json} />
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
