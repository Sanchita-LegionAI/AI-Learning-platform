// pages/admin/AdminDashboard.jsx
import { useEffect, useState, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'

const TABS = ['Overview', 'Curriculum', 'Models', 'Logs']

// ─── tiny helpers ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }) {
  return (
    <div className={`bg-white rounded-xl border p-4 ${accent ? 'border-saffron/30' : 'border-border'}`}>
      <p className="text-xs font-ui text-ink-light mb-1">{label}</p>
      <p className="text-2xl font-bold font-ui text-ink">{value}</p>
      {sub && <p className="text-xs font-ui text-ink-light mt-0.5">{sub}</p>}
    </div>
  )
}

function Badge({ children, color = 'gray' }) {
  const colors = {
    green:  'bg-green-50 text-green-700 border-green-200',
    red:    'bg-red-50 text-red-600 border-red-200',
    yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    gray:   'bg-gray-50 text-gray-500 border-gray-200',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-ui font-medium ${colors[color]}`}>
      {children}
    </span>
  )
}

function Msg({ text, onClose }) {
  if (!text) return null
  const ok = text.startsWith('✓')
  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border text-sm font-ui mb-4
      ${ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
      <span className="text-lg leading-none mt-0.5">{ok ? '✓' : '✗'}</span>
      <pre className="whitespace-pre-wrap flex-1 text-xs">{text.slice(2).trim()}</pre>
      <button onClick={onClose} className="text-current opacity-50 hover:opacity-100 leading-none text-lg">×</button>
    </div>
  )
}

// Read a JSON file from an <input type="file"> and return parsed object
function readJsonFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = e => { try { resolve(JSON.parse(e.target.result)) } catch { reject(new Error('Invalid JSON file')) } }
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsText(file)
  })
}

// ─── new api calls (will add to api.js below) ────────────────────────────────
// These call the new backend endpoints directly so no api.js edit is needed
// until you copy this file; the inline fetch keeps everything self-contained.

async function apiPost(path, body, token) {
  const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'
  const res  = await fetch(`${BASE}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body:    JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`)
  return data
}

async function apiGet(path, token) {
  const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'
  const res  = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`)
  return data
}

async function apiDelete(path, token) {
  const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'
  const res  = await fetch(`${BASE}${path}`, {
    method:  'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`)
  return data
}

// ─── Curriculum tab ───────────────────────────────────────────────────────────

function FileDropZone({ label, accept, onFile, busy }) {
  const ref = useRef()
  const [dragging, setDragging] = useState(false)

  const handle = async (file) => {
    if (!file) return
    try { onFile(await readJsonFile(file), file.name) }
    catch (e) { onFile(null, null, e.message) }
  }

  return (
    <div
      onClick={() => !busy && ref.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); handle(e.dataTransfer.files[0]) }}
      className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed
        py-8 px-4 cursor-pointer transition-all select-none
        ${busy ? 'opacity-50 cursor-not-allowed' : ''}
        ${dragging ? 'border-saffron bg-saffron/5' : 'border-border hover:border-saffron/50 hover:bg-gray-50'}`}
    >
      <input ref={ref} type="file" accept={accept} className="sr-only"
        onChange={e => handle(e.target.files[0])} disabled={busy} />
      <span className="text-2xl">📄</span>
      <p className="text-sm font-ui font-medium text-ink">{label}</p>
      <p className="text-xs font-ui text-ink-light">drag & drop or click to browse</p>
    </div>
  )
}

function ChapterRow({ ch }) {
  const total = ch.total_questions
  const ready = ch.ready_for_exam
  return (
    <tr className="border-t border-border hover:bg-gray-50 text-sm font-ui">
      <td className="px-3 py-2 text-ink-light tabular-nums">{ch.chapter_number}</td>
      <td className="px-3 py-2 bn text-xs leading-snug">{ch.name_bn}</td>
      <td className={`px-3 py-2 font-semibold tabular-nums ${total === 0 ? 'text-red-400' : 'text-ink'}`}>
        {total}
      </td>
      <td className="px-3 py-2 text-ink-light tabular-nums text-xs">{ch.q_mcq}</td>
      <td className="px-3 py-2 text-ink-light tabular-nums text-xs">{ch.q_match_pairs}</td>
      <td className="px-3 py-2 text-ink-light tabular-nums text-xs">{ch.q_true_false}</td>
      <td className="px-3 py-2 text-ink-light tabular-nums text-xs">{ch.q_tap_sequence}</td>
      <td className="px-3 py-2 text-ink-light tabular-nums text-xs">{ch.q_categorize}</td>
      <td className="px-3 py-2 text-ink-light tabular-nums text-xs">{ch.q_short_write}</td>
      <td className="px-3 py-2">
        {ready
          ? <Badge color="green">Ready</Badge>
          : total === 0
            ? <Badge color="red">Empty</Badge>
            : <Badge color="yellow">Partial</Badge>}
      </td>
    </tr>
  )
}

function BookCard({ book, onDelete, token }) {
  const [open,    setOpen]    = useState(false)
  const [delBusy, setDelBusy] = useState(false)

  const totalQ = book.chapters.reduce((s, c) => s + (c.total_questions || 0), 0)
  const ready  = book.chapters.filter(c => c.ready_for_exam).length

  const handleDelete = async () => {
    if (!confirm(`Delete "${book.title_bn}" and ALL its chapters and questions?\n\nThis cannot be undone.`)) return
    setDelBusy(true)
    try {
      await apiDelete(`/api/admin/curriculum/book/${book.book_id_code}`, token)
      onDelete(book.book_id_code)
    } catch (e) {
      alert(`Error: ${e.message}`)
    } finally {
      setDelBusy(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-border overflow-hidden">
      {/* Book header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-border">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => setOpen(o => !o)} className="text-ink-light hover:text-ink transition-colors">
            <span className={`inline-block transition-transform text-xs ${open ? 'rotate-90' : ''}`}>▶</span>
          </button>
          <div className="min-w-0">
            <p className="text-sm font-ui font-semibold text-ink bn leading-tight">{book.title_bn}</p>
            <p className="text-xs font-ui text-ink-light font-mono">{book.book_id_code}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-3">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-ui text-ink-light">{book.chapters.length} chapters</p>
            <p className="text-xs font-ui text-ink-light">{totalQ.toLocaleString()} questions</p>
          </div>
          <Badge color={ready === book.chapters.length ? 'green' : ready > 0 ? 'yellow' : 'red'}>
            {ready}/{book.chapters.length} ready
          </Badge>
          <button
            onClick={handleDelete}
            disabled={delBusy}
            className="text-xs font-ui text-red-400 hover:text-red-600 border border-red-200 hover:border-red-400
              px-2 py-1 rounded-lg transition-all disabled:opacity-40"
          >
            {delBusy ? '…' : 'Delete'}
          </button>
        </div>
      </div>

      {/* Chapter table */}
      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-ui min-w-[640px]">
            <thead className="bg-gray-50/50 text-xs text-ink-light">
              <tr>
                {['#', 'Chapter', 'Total', 'MCQ', 'Match', 'T/F', 'Seq', 'Cat', 'SW', 'Status'].map(h => (
                  <th key={h} className="text-left px-3 py-1.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {book.chapters.map(ch => <ChapterRow key={ch.chapter_id} ch={ch} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function CurriculumTab({ token }) {
  const [tree,      setTree]      = useState([])
  const [treeLoad,  setTreeLoad]  = useState(true)
  const [msg,       setMsg]       = useState('')

  // Book seeder state
  const [bookFile,  setBookFile]  = useState(null)
  const [bookName,  setBookName]  = useState('')
  const [bookBusy,  setBookBusy]  = useState(false)

  // Question seeder state
  const [qFiles,    setQFiles]    = useState([])   // [{name, data}]
  const [qBusy,     setQBusy]     = useState(false)
  const [qProgress, setQProgress] = useState(null) // { done, total, current }

  const loadTree = async () => {
    setTreeLoad(true)
    try {
      const d = await apiGet('/api/admin/curriculum/tree', token)
      setTree(d.tree)
    } catch (e) {
      setMsg(`✗ Could not load curriculum: ${e.message}`)
    } finally {
      setTreeLoad(false)
    }
  }

  useEffect(() => { loadTree() }, [])

  // ── Book JSON upload ────────────────────────────────────────────────────────
  const onBookFile = (data, name, err) => {
    if (err) { setMsg(`✗ ${err}`); return }
    setBookFile(data)
    setBookName(name)
    setMsg('')
  }

  const seedBook = async () => {
    if (!bookFile) return
    setBookBusy(true)
    setMsg('')
    try {
      const res = await apiPost('/api/admin/curriculum/seed-book', bookFile, token)
      setMsg(
        `✓ Book seeded: ${res.book_id_code}\n` +
        `${res.book_created ? '• Book created' : '• Book already existed'}\n` +
        `${res.subject_created ? '• Subject created' : '• Subject already existed'}\n` +
        `• ${res.chapters_inserted} chapters inserted, ${res.chapters_skipped} skipped`
      )
      setBookFile(null)
      setBookName('')
      loadTree()
    } catch (e) {
      setMsg(`✗ ${e.message}`)
    } finally {
      setBookBusy(false)
    }
  }

  // ── Questions JSON upload ───────────────────────────────────────────────────
  const onQFiles = async (file) => {
    if (!file) return
    try {
      const data = await readJsonFile(file)
      setQFiles(prev => {
        // replace if same chapter already queued
        const key = `${data.book_id}_ch${data.chapter_no}`
        const exists = prev.findIndex(f => `${f.data.book_id}_ch${f.data.chapter_no}` === key)
        const updated = [...prev]
        if (exists >= 0) updated[exists] = { name: file.name, data }
        else updated.push({ name: file.name, data })
        return updated
      })
      setMsg('')
    } catch (e) {
      setMsg(`✗ ${e.message}`)
    }
  }

  const removeQFile = (idx) => setQFiles(prev => prev.filter((_, i) => i !== idx))

  const seedQuestions = async () => {
    if (qFiles.length === 0) return
    setQBusy(true)
    setMsg('')
    const results = []
    for (let i = 0; i < qFiles.length; i++) {
      const { name, data } = qFiles[i]
      setQProgress({ done: i, total: qFiles.length, current: name })
      try {
        const res = await apiPost('/api/admin/curriculum/seed-questions', data, token)
        results.push(`ch${data.chapter_no}: ${res.inserted} inserted, ${res.skipped} skipped${res.errors?.length ? ` ⚠ ${res.errors[0]}` : ''}`)
      } catch (e) {
        results.push(`ch${data.chapter_no}: ✗ ${e.message}`)
      }
    }
    setQProgress(null)
    setQBusy(false)
    setQFiles([])
    setMsg('✓ Questions import complete\n' + results.join('\n'))
    loadTree()
  }

  // ── Delete a book from the tree ─────────────────────────────────────────────
  const onBookDeleted = (code) => {
    setTree(prev => prev.map(cls => ({
      ...cls,
      subjects: cls.subjects.map(subj => ({
        ...subj,
        books: subj.books.filter(b => b.book_id_code !== code),
      })).filter(subj => subj.books.length > 0),
    })).filter(cls => cls.subjects.length > 0))
    setMsg(`✓ Book deleted`)
  }

  return (
    <div className="space-y-6">
      <Msg text={msg} onClose={() => setMsg('')} />

      {/* ── Step 1: Add a Book ───────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-border p-5 space-y-4">
        <div>
          <h3 className="text-sm font-ui font-semibold text-ink">Step 1 — Add a Book &amp; Chapters</h3>
          <p className="text-xs font-ui text-ink-light mt-0.5">
            Upload a <span className="font-mono">chapters.json</span> file to create a new subject, book, and all its chapters.
            Safe to re-upload — existing chapters are skipped.
          </p>
        </div>

        {/* JSON format hint */}
        <details className="text-xs font-ui">
          <summary className="cursor-pointer text-saffron hover:text-saffron-dark font-medium select-none">
            View expected JSON format
          </summary>
          <pre className="mt-2 bg-gray-50 rounded-lg p-3 text-xs font-mono text-ink-light overflow-x-auto">{`{
  "book_id_code": "otit_o_oitijhyo",
  "title_bn": "অতীত ও ঐতিহ্য",
  "subject_name": "History",
  "subject_display_bn": "ইতিহাস",
  "class_name": "Class 7",
  "total_chapters": 9,
  "chapters": [
    { "chapter_number": 1, "name_bn": "ইতিহাসের ধারণা", "subtitle_bn": "..." },
    { "chapter_number": 2, "name_bn": "...", "subtitle_bn": "..." }
  ]
}`}</pre>
        </details>

        {bookFile ? (
          <div className="flex items-center justify-between bg-saffron/5 border border-saffron/20 rounded-xl px-4 py-3">
            <div>
              <p className="text-sm font-ui font-medium text-ink">{bookName}</p>
              <p className="text-xs font-ui text-ink-light mt-0.5">
                <span className="font-semibold text-ink">{bookFile.book_id_code}</span>
                {' · '}{bookFile.chapters?.length ?? 0} chapters
                {' · '}<span className="bn">{bookFile.title_bn}</span>
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setBookFile(null); setBookName('') }}
                className="text-xs font-ui text-ink-light hover:text-ink px-2 py-1 rounded-lg border border-border transition-all"
              >
                Remove
              </button>
              <button
                onClick={seedBook}
                disabled={bookBusy}
                className="text-xs font-ui font-semibold bg-saffron text-white px-4 py-1.5 rounded-lg
                  hover:bg-saffron-dark disabled:opacity-50 transition-all"
              >
                {bookBusy ? 'Adding…' : 'Add Book'}
              </button>
            </div>
          </div>
        ) : (
          <FileDropZone
            label="Drop chapters JSON here"
            accept=".json,application/json"
            onFile={onBookFile}
            busy={bookBusy}
          />
        )}
      </div>

      {/* ── Step 2: Import Questions ─────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-border p-5 space-y-4">
        <div>
          <h3 className="text-sm font-ui font-semibold text-ink">Step 2 — Import Questions</h3>
          <p className="text-xs font-ui text-ink-light mt-0.5">
            Upload one or more chapter question JSON files.
            You can drop multiple files at once. Each file is processed independently — already-imported questions are skipped.
          </p>
        </div>

        <details className="text-xs font-ui">
          <summary className="cursor-pointer text-saffron hover:text-saffron-dark font-medium select-none">
            View expected JSON format
          </summary>
          <pre className="mt-2 bg-gray-50 rounded-lg p-3 text-xs font-mono text-ink-light overflow-x-auto">{`{
  "book_id": "otit_o_oitijhyo",
  "chapter_no": 1,
  "chapter_title_bn": "ইতিহাসের ধারণা",
  "questions": {
    "mcq":          [{ "id": "..._ch01_mcq_001", "type": "mcq", "part": 1, ... }],
    "match_pairs":  [...],
    "true_false":   [...],
    "tap_sequence": [...],
    "categorize":   [...],
    "short_write":  [{ "id": "..._ch01_sw_001", "part": 2, "answer_slot_id": 1, ... }]
  }
}`}</pre>
        </details>

        {/* Drop zone — supports multiple files */}
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={async e => {
            e.preventDefault()
            for (const file of Array.from(e.dataTransfer.files)) await onQFiles(file)
          }}
          onClick={() => {
            const inp = document.createElement('input')
            inp.type = 'file'; inp.accept = '.json'; inp.multiple = true
            inp.onchange = async e => { for (const f of e.target.files) await onQFiles(f) }
            inp.click()
          }}
          className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed
            py-6 px-4 cursor-pointer transition-all
            ${qBusy ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'border-border hover:border-saffron/50 hover:bg-gray-50'}`}
        >
          <span className="text-2xl">📦</span>
          <p className="text-sm font-ui font-medium text-ink">Drop chapter JSON files here</p>
          <p className="text-xs font-ui text-ink-light">multiple files supported</p>
        </div>

        {/* Queued files list */}
        {qFiles.length > 0 && (
          <div className="space-y-1.5">
            {qFiles.map((f, i) => (
              <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                <div>
                  <p className="text-xs font-ui font-medium text-ink">{f.name}</p>
                  <p className="text-xs font-ui text-ink-light font-mono">
                    {f.data.book_id} · ch{f.data.chapter_no}
                    {' · '}{Object.values(f.data.questions || {}).reduce((s, a) => s + a.length, 0)} questions
                  </p>
                </div>
                <button
                  onClick={() => removeQFile(i)}
                  disabled={qBusy}
                  className="text-xs text-ink-light hover:text-red-500 transition-colors ml-3"
                >
                  ×
                </button>
              </div>
            ))}

            {/* Progress or action */}
            {qProgress ? (
              <div className="text-xs font-ui text-ink-light px-1 py-2">
                Processing {qProgress.done + 1}/{qProgress.total}: {qProgress.current}…
                <div className="mt-1.5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-saffron rounded-full transition-all"
                    style={{ width: `${((qProgress.done) / qProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between pt-1">
                <p className="text-xs font-ui text-ink-light">
                  {qFiles.length} file{qFiles.length > 1 ? 's' : ''} queued
                </p>
                <button
                  onClick={seedQuestions}
                  disabled={qBusy}
                  className="text-sm font-ui font-semibold bg-saffron text-white px-5 py-2 rounded-xl
                    hover:bg-saffron-dark disabled:opacity-50 transition-all"
                >
                  Import {qFiles.length} File{qFiles.length > 1 ? 's' : ''}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Curriculum tree ──────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-ui font-semibold text-ink">Current Curriculum</h3>
          <button
            onClick={loadTree}
            disabled={treeLoad}
            className="text-xs font-ui text-saffron hover:text-saffron-dark font-medium disabled:opacity-40 transition-colors"
          >
            {treeLoad ? 'Loading…' : '↻ Refresh'}
          </button>
        </div>

        {treeLoad ? (
          <div className="text-xs font-ui text-ink-light py-8 text-center">Loading…</div>
        ) : tree.length === 0 ? (
          <div className="text-xs font-ui text-ink-light py-8 text-center bg-white rounded-xl border border-border">
            No books seeded yet. Upload a chapters JSON above to get started.
          </div>
        ) : (
          <div className="space-y-6">
            {tree.map(cls => (
              <div key={cls.class_id}>
                <p className="text-xs font-ui font-semibold text-ink-light uppercase tracking-wide mb-2 bn">
                  {cls.class_name}
                </p>
                <div className="space-y-4">
                  {cls.subjects.map(subj => (
                    <div key={subj.subject_id}>
                      <p className="text-xs font-ui text-ink-light mb-1.5 bn">{subj.subject_bn}</p>
                      <div className="space-y-3">
                        {subj.books.map(book => (
                          <BookCard
                            key={book.book_id}
                            book={book}
                            onDelete={onBookDeleted}
                            token={token}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { token, signOut } = useAuth()
  const [tab, setTab] = useState('Curriculum')

  // Other tabs state
  const [summary,   setSummary]   = useState(null)
  const [providers, setProviders] = useState(null)
  const [logs,      setLogs]      = useState([])
  const [msg,       setMsg]       = useState('')
  const [loading,   setLoading]   = useState(false)

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
  }, [tab, token])

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

  const clearLogs = async () => {
    if (!confirm('Clear all API logs? This cannot be undone.')) return
    await api.clearLogs(token)
    setLogs([])
    setMsg('✓ Logs cleared')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-ink text-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-saffron font-bold text-lg">📚</span>
          <span className="font-ui font-semibold">Admin Dashboard</span>
        </div>
        <button onClick={signOut} className="text-xs text-white/60 hover:text-white font-ui transition-colors">
          Sign out
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-border px-6 flex gap-1">
        {TABS.map(t => (
          <button key={t} onClick={() => { setTab(t); setMsg('') }}
            className={`py-3 px-4 text-sm font-ui font-medium border-b-2 transition-colors
              ${tab === t ? 'border-saffron text-saffron' : 'border-transparent text-ink-light hover:text-ink'}`}>
            {t}
          </button>
        ))}
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6">
        {msg && tab !== 'Curriculum' && (
          <Msg text={msg} onClose={() => setMsg('')} />
        )}

        {/* ── Curriculum ── */}
        {tab === 'Curriculum' && (
          <CurriculumTab token={token} />
        )}

        {/* ── Overview ── */}
        {tab === 'Overview' && (
          <div className="space-y-6">
            <h2 className="text-base font-ui font-semibold text-ink">Usage Overview (last 30 days)</h2>
            {summary && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCard label="Total calls" value={summary.summary.reduce((a, r) => a + r.calls, 0)} />
                  <StatCard label="Total cost (₹)" accent
                    value={`₹${summary.summary.reduce((a, r) => a + r.total_cost_inr, 0).toFixed(2)}`} />
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
                        {['Day', 'Type', 'Provider', 'Model', 'Calls', 'Input tok', 'Output tok', 'Cost (₹)'].map(h => (
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
                        <p className="text-sm font-ui text-ink">{p.provider_name} / {p.model_name}</p>
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
                    {['Time', 'Type', 'Provider', 'Model', 'In tok', 'Out tok', '₹', 'Success'].map(h => (
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
      </div>
    </div>
  )
}
