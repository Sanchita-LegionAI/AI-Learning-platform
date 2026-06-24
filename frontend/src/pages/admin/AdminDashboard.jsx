// pages/admin/AdminDashboard.jsx
import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'

const TABS = ['Overview', 'Models', 'Logs', 'Exams', 'Content']

function StatCard({ label, value, sub, accent }) {
  return (
    <div className={`bg-white rounded-xl border p-4 ${accent ? 'border-saffron/30' : 'border-border'}`}>
      <p className="text-xs font-ui text-ink-light mb-1">{label}</p>
      <p className="text-2xl font-bold font-ui text-ink">{value}</p>
      {sub && <p className="text-xs font-ui text-ink-light mt-0.5">{sub}</p>}
    </div>
  )
}

function formatDT(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short' }) + ' ' +
         d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })
}

export default function AdminDashboard() {
  const { token, signOut } = useAuth()
  const [tab, setTab]       = useState('Overview')

  const [summary,   setSummary]   = useState(null)
  const [providers, setProviders] = useState(null)
  const [logs,      setLogs]      = useState([])
  const [examLogs,  setExamLogs]  = useState([])
  const [chapters,  setChapters]  = useState([])
  const [stats,     setStats]     = useState([])
  const [loading,   setLoading]   = useState(false)
  const [msg,       setMsg]       = useState('')

  // Exam logs filter
  const [examFilter, setExamFilter] = useState('all') // all | active | completed

  useEffect(() => {
    if (tab === 'Overview') {
      api.getUsageSummary(token).then(d => setSummary(d)).catch(() => {})
    }
    if (tab === 'Models') {
      api.getAdminConfig(token).then(d => setProviders(d.providers)).catch(() => {})
    }
    if (tab === 'Logs') {
      api.getUsageLogs(token, { limit: 50 }).then(d => setLogs(d.logs)).catch(() => {})
    }
    if (tab === 'Exams') {
      loadExamLogs()
    }
    if (tab === 'Content') {
      api.getAdminChapters(token).then(d => setChapters(d.chapters)).catch(() => {})
      api.getChapterStats(token).then(d => setStats(d.stats)).catch(() => {})
    }
  }, [tab, token])

  const loadExamLogs = (filter = examFilter) => {
    const params = { limit: 100 }
    if (filter === 'active')    params.completed = false
    if (filter === 'completed') params.completed = true
    api.getAdminExamLogs(token, params).then(d => setExamLogs(d.exam_logs || [])).catch(() => {})
  }

  const switchProvider = async (purpose, providerName, modelName) => {
    setMsg('')
    try {
      await api.updateProvider(purpose, providerName, modelName, token)
      setMsg(`✓ Switched ${purpose} to ${providerName} / ${modelName}`)
      api.getAdminConfig(token).then(d => setProviders(d.providers))
    } catch (e) {
      setMsg(`✗ ${e.message}`)
    }
  }

  const triggerImport = async () => {
    setLoading(true)
    setMsg('')
    try {
      const res = await api.triggerImport(token)
      const detail = res.log || res.stdout || ''
      const s = res.stats || {}
      const summary = s.inserted !== undefined ? `inserted=${s.inserted} skipped=${s.skipped} errors=${s.errors}` : ''
      setMsg(res.success ? `✓ Import complete — ${summary}\n${detail}` : `✗ Import failed — ${summary}\n${detail}`)
      api.getAdminChapters(token).then(d => setChapters(d.chapters))
    } catch (e) {
      setMsg(`✗ ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  const clearLogs = async () => {
    if (!confirm('Clear all API logs? This cannot be undone.')) return
    await api.clearLogs(token)
    setLogs([])
    setMsg('✓ Logs cleared')
  }

  const deleteExam = async (sessionId) => {
    if (!confirm('Delete this exam session? This will also delete the uploaded image reference.')) return
    try {
      await api.deleteAdminExam(sessionId, token)
      setExamLogs(prev => prev.filter(e => e.id !== sessionId))
      setMsg('✓ Exam session deleted')
    } catch (e) {
      setMsg(`✗ ${e.message}`)
    }
  }

  const activeCount    = examLogs.filter(e => !e.completed).length
  const completedCount = examLogs.filter(e => e.completed).length

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-ink text-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-saffron font-bold text-lg">📚</span>
          <span className="font-ui font-semibold">বাংলা AI টিউটর — Admin</span>
        </div>
        <button onClick={signOut} className="text-xs text-white/60 hover:text-white font-ui transition-colors">
          Sign out
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-border px-6 flex gap-1 overflow-x-auto">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`py-3 px-4 text-sm font-ui font-medium border-b-2 transition-colors whitespace-nowrap
              ${tab === t ? 'border-saffron text-saffron' : 'border-transparent text-ink-light hover:text-ink'}`}>
            {t}
            {t === 'Exams' && examLogs.filter(e => !e.completed).length > 0 && (
              <span className="ml-1.5 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                {examLogs.filter(e => !e.completed).length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6">
        {msg && (
          <pre className={`mb-4 text-xs font-mono p-3 rounded-xl whitespace-pre-wrap
            ${msg.startsWith('✓') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {msg}
          </pre>
        )}

        {/* ── Overview ── */}
        {tab === 'Overview' && (
          <div className="space-y-6">
            <h2 className="text-base font-ui font-semibold text-ink">Usage Overview (last 30 days)</h2>
            {summary && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCard label="Total calls" value={summary.summary.reduce((a,r) => a + r.calls, 0)} />
                  <StatCard label="Total cost (₹)" accent
                    value={`₹${summary.summary.reduce((a,r) => a + r.total_cost_inr, 0).toFixed(2)}`} />
                  <StatCard label="Projection 1k/day"
                    value={`₹${summary.projection?.inr_1k_per_month?.toLocaleString() || '—'}`}
                    sub="per month" />
                  <StatCard label="Projection 5k/day"
                    value={`₹${summary.projection?.inr_5k_per_month?.toLocaleString() || '—'}`}
                    sub="per month" />
                </div>

                <div className="bg-white rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-sm font-ui">
                    <thead className="bg-gray-50 text-xs text-ink-light">
                      <tr>
                        {['Day','Type','Provider','Model','Calls','Input tok','Output tok','Cost (₹)'].map(h => (
                          <th key={h} className="text-left px-3 py-2">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {summary.summary.map((row, i) => (
                        <tr key={i} className="border-t border-border hover:bg-gray-50">
                          <td className="px-3 py-2">{row.day}</td>
                          <td className="px-3 py-2">{row.call_type}</td>
                          <td className="px-3 py-2">{row.provider}</td>
                          <td className="px-3 py-2 text-xs">{row.model}</td>
                          <td className="px-3 py-2">{row.calls}</td>
                          <td className="px-3 py-2">{row.total_input_tokens?.toLocaleString()}</td>
                          <td className="px-3 py-2">{row.total_output_tokens?.toLocaleString()}</td>
                          <td className="px-3 py-2 font-semibold text-saffron-dark">₹{row.total_cost_inr}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Models ── */}
        {tab === 'Models' && providers && (
          <div className="space-y-6">
            <h2 className="text-base font-ui font-semibold text-ink">LLM Provider Config</h2>
            <p className="text-sm font-ui text-ink-light">
              Switching takes effect immediately — no restart needed.
            </p>
            {Object.entries(providers).map(([purpose, data]) => (
              <div key={purpose} className="bg-white rounded-xl border border-border p-5">
                <h3 className="font-ui font-semibold text-sm text-ink mb-3 capitalize">
                  {purpose.replace('_', ' ')}
                </h3>
                <div className="space-y-2">
                  {data.active && (
                    <div className="flex items-center justify-between bg-forest-light border border-forest/30 rounded-xl px-4 py-3">
                      <div>
                        <span className="text-xs font-ui text-forest font-semibold">ACTIVE</span>
                        <p className="text-sm font-ui text-ink mt-0.5">
                          {data.active.provider_name} / {data.active.model_name}
                        </p>
                        <p className="text-xs text-ink-light font-ui">
                          ${data.active.cost_input_per_m}/${data.active.cost_output_per_m} per M tokens
                          {data.active.vision_enabled ? ' · vision ✓' : ''}
                        </p>
                      </div>
                      <span className="text-green-500 text-xl">●</span>
                    </div>
                  )}
                  {data.available?.map(p => (
                    <div key={p.id} className="flex items-center justify-between border border-border rounded-xl px-4 py-3">
                      <div>
                        <p className="text-sm font-ui text-ink">
                          {p.provider_name} / {p.model_name}
                        </p>
                        <p className="text-xs text-ink-light font-ui">
                          ${p.cost_input_per_m}/${p.cost_output_per_m} per M tokens
                          {p.vision_enabled ? ' · vision ✓' : ''}
                        </p>
                      </div>
                      <button
                        onClick={() => switchProvider(purpose, p.provider_name, p.model_name)}
                        className="text-xs font-ui font-semibold text-saffron border border-saffron/30 px-3 py-1.5 rounded-lg hover:bg-saffron hover:text-white transition-all"
                      >
                        Switch
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Logs ── */}
        {tab === 'Logs' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-ui font-semibold text-ink">API Call Logs</h2>
              <button onClick={clearLogs}
                className="text-xs font-ui text-red-500 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-all">
                Clear all logs
              </button>
            </div>
            <div className="bg-white rounded-xl border border-border overflow-x-auto">
              <table className="w-full text-xs font-ui min-w-[700px]">
                <thead className="bg-gray-50 text-ink-light">
                  <tr>
                    {['Time','Type','Provider','Model','In tok','Out tok','₹','Success'].map(h => (
                      <th key={h} className="text-left px-3 py-2">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, i) => (
                    <tr key={i} className={`border-t border-border ${!log.success ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                      <td className="px-3 py-2">{new Date(log.timestamp).toLocaleTimeString()}</td>
                      <td className="px-3 py-2">{log.call_type}</td>
                      <td className="px-3 py-2">{log.provider}</td>
                      <td className="px-3 py-2">{log.model}</td>
                      <td className="px-3 py-2">{log.input_tokens}</td>
                      <td className="px-3 py-2">{log.output_tokens}</td>
                      <td className="px-3 py-2 font-semibold">₹{log.cost_inr?.toFixed(4)}</td>
                      <td className="px-3 py-2">
                        <span className={log.success ? 'text-green-600' : 'text-red-600'}>
                          {log.success ? '✓' : '✗'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Exams ── */}
        {tab === 'Exams' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-base font-ui font-semibold text-ink">Student Exam Sessions</h2>
                <p className="text-xs text-ink-light font-ui mt-0.5">
                  {activeCount} active · {completedCount} completed
                </p>
              </div>
              <div className="flex gap-2">
                {['all','active','completed'].map(f => (
                  <button
                    key={f}
                    onClick={() => {
                      setExamFilter(f)
                      loadExamLogs(f)
                    }}
                    className={`text-xs font-ui px-3 py-1.5 rounded-lg border transition-all ${
                      examFilter === f
                        ? 'bg-saffron text-white border-saffron'
                        : 'border-border text-ink-light hover:text-ink'
                    }`}
                  >
                    {f === 'all' ? 'All' : f === 'active' ? 'Active' : 'Completed'}
                  </button>
                ))}
                <button
                  onClick={() => loadExamLogs(examFilter)}
                  className="text-xs font-ui text-ink-light border border-border px-3 py-1.5 rounded-lg hover:text-ink transition-colors"
                >
                  ↻ Refresh
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-border overflow-x-auto">
              <table className="w-full text-xs font-ui min-w-[800px]">
                <thead className="bg-gray-50 text-ink-light">
                  <tr>
                    {['Student','Chapter','Subject','Started','Submitted','Score','Grade','Status',''].map(h => (
                      <th key={h} className="text-left px-3 py-2">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {examLogs.length === 0 && (
                    <tr><td colSpan={9} className="text-center py-6 text-ink-light">No exam sessions found</td></tr>
                  )}
                  {examLogs.map((e, i) => (
                    <tr key={i} className={`border-t border-border hover:bg-gray-50 ${!e.completed ? 'bg-amber-50/30' : ''}`}>
                      <td className="px-3 py-2">
                        <p className="font-medium text-ink">{e.student_name || '—'}</p>
                        <p className="text-ink-light">{e.student_phone || e.user_id?.slice(0,8)}</p>
                      </td>
                      <td className="px-3 py-2 max-w-[120px]">
                        <span className="bn">{e.chapter_name || '—'}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="bn">{e.subject_name || '—'}</span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{formatDT(e.started_at)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{formatDT(e.submitted_at)}</td>
                      <td className="px-3 py-2 font-semibold">
                        {e.score_awarded != null ? `${e.score_awarded}/${e.score_max}` : '—'}
                      </td>
                      <td className="px-3 py-2 font-bold text-saffron-dark">{e.grade || '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          e.completed
                            ? 'bg-emerald-100 text-emerald-700'
                            : e.answer_image_key
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-blue-100 text-blue-700'
                        }`}>
                          {e.completed ? 'Done' : e.answer_image_key ? 'Uploaded' : 'Pending'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => deleteExam(e.id)}
                          className="text-red-400 hover:text-red-600 transition-colors"
                          title="Delete session"
                        >
                          🗑
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Content ── */}
        {tab === 'Content' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-ui font-semibold text-ink">Question Bank</h2>
              <button onClick={triggerImport} disabled={loading}
                className="text-sm font-ui font-semibold bg-saffron text-white px-4 py-2 rounded-xl hover:bg-saffron-dark disabled:opacity-50 transition-all">
                {loading ? 'Importing...' : '↻ Import from JSON'}
              </button>
            </div>

            <div className="bg-white rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm font-ui">
                <thead className="bg-gray-50 text-xs text-ink-light">
                  <tr>
                    {['Class','Subject','Book','Chapter','Total Q','2m','3m','5m'].map(h => (
                      <th key={h} className="text-left px-3 py-2">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {chapters.map((ch, i) => (
                    <tr key={i} className="border-t border-border hover:bg-gray-50">
                      <td className="px-3 py-2">{ch.class_name}</td>
                      <td className="px-3 py-2">{ch.subject_bn}</td>
                      <td className="px-3 py-2 text-xs">{ch.book_id_code}</td>
                      <td className="px-3 py-2">
                        <span className="bn text-xs">{ch.name_bn}</span>
                      </td>
                      <td className={`px-3 py-2 font-semibold ${ch.total_questions === 0 ? 'text-red-500' : 'text-forest'}`}>
                        {ch.total_questions}
                      </td>
                      <td className="px-3 py-2 text-ink-light">{ch.q_2mark}</td>
                      <td className="px-3 py-2 text-ink-light">{ch.q_3mark}</td>
                      <td className="px-3 py-2 text-ink-light">{ch.q_5mark}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
