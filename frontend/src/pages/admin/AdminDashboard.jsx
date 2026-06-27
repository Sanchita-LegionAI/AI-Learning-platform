// pages/admin/AdminDashboard.jsx
import { useEffect, useState, useRef, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'

const TABS = ['Overview', 'Curriculum', 'Analytics', 'Models', 'Logs']

const BASE = () => import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function apiFetch(method, path, body, token) {
  const res = await fetch(`${BASE()}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`)
  return data
}

function readJson(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload  = e => { try { resolve(JSON.parse(e.target.result)) } catch { reject(new Error('Invalid JSON')) } }
    r.onerror = () => reject(new Error('Could not read file'))
    r.readAsText(file)
  })
}

// ─── Shared UI atoms ──────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }) {
  return (
    <div className={`bg-white rounded-xl border p-4 ${accent ? 'border-saffron/30' : 'border-border'}`}>
      <p className="text-xs font-ui text-ink-light mb-1">{label}</p>
      <p className="text-2xl font-bold font-ui text-ink">{value}</p>
      {sub && <p className="text-xs font-ui text-ink-light mt-0.5">{sub}</p>}
    </div>
  )
}

function Toast({ msg, onClose }) {
  if (!msg) return null
  const ok = msg.startsWith('✓')
  return (
    <div className={`flex gap-2 items-start p-3 rounded-lg border text-xs font-ui mb-3
      ${ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
      <span className="shrink-0 font-bold">{ok ? '✓' : '✗'}</span>
      <pre className="whitespace-pre-wrap flex-1">{msg.slice(2).trim()}</pre>
      <button onClick={onClose} className="shrink-0 opacity-40 hover:opacity-100 text-sm leading-none">×</button>
    </div>
  )
}

function Badge({ children, color = 'gray' }) {
  const c = {
    green:  'bg-green-50 text-green-700 border-green-200',
    yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    red:    'bg-red-50 text-red-500 border-red-200',
    gray:   'bg-gray-100 text-gray-500 border-gray-200',
    blue:   'bg-blue-50 text-blue-600 border-blue-200',
  }[color]
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-xs font-ui font-medium ${c}`}>
      {children}
    </span>
  )
}

function Spinner() {
  return <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
}

// ─── Curriculum tab ───────────────────────────────────────────────────────────

const PANEL_NONE          = null
const PANEL_ADD_CLASS     = 'add_class'
const PANEL_ADD_BOOK      = 'add_book'
const PANEL_ADD_CHAPTERS  = 'add_chapters'
const PANEL_ADD_QUESTIONS = 'add_questions'

// Tree: chapter count row
function QuestionCountRow({ ch }) {
  const total = ch.total_questions
  return (
    <tr className="border-t border-border/50 text-xs font-ui hover:bg-gray-50/50">
      <td className="pl-3 pr-1 py-1.5 text-ink-light tabular-nums text-right" style={{width:'28px'}}>{ch.chapter_number}</td>
      <td className="px-2 py-1.5 bn leading-snug text-ink" style={{width:'auto'}}>
        <span className="block truncate" title={ch.name_bn}>{ch.name_bn}</span>
      </td>
      <td className="px-1 py-1.5 tabular-nums font-semibold text-right" style={{width:'36px'}}>
        <span className={total === 0 ? 'text-red-400' : 'text-ink'}>{total}</span>
      </td>
      <td className="pl-1 pr-2 py-1.5 text-right" style={{width:'60px'}}>
        {ch.ready_for_exam
          ? <Badge color="green">Ready</Badge>
          : total === 0
            ? <Badge color="red">Empty</Badge>
            : <Badge color="yellow">Part.</Badge>}
      </td>
    </tr>
  )
}

// Tree: one book card
function BookNode({ book, subj, cls, isActive, onSelect, onAction, token, onDeleted }) {
  const [open, setOpen] = useState(false)
  const ready = book.chapters.filter(c => c.ready_for_exam).length
  const total = book.chapters.length

  const handleDelete = async () => {
    if (!confirm(`Delete "${book.title_bn}" and ALL chapters + questions?\n\nCannot be undone.`)) return
    try {
      await apiFetch('DELETE', `/api/admin/curriculum/book/${book.book_id_code}`, null, token)
      onDeleted(book.book_id_code)
    } catch (e) { alert(e.message) }
  }

  return (
    <div className={`mb-1.5 rounded-lg border transition-all
      ${isActive ? 'border-saffron/40 bg-saffron/5' : 'border-border bg-white hover:border-gray-300'}`}>

      {/* Book header row */}
      <div className="flex items-center gap-1 px-2 py-2">
        <button onClick={() => setOpen(o => !o)}
          className="text-ink-light hover:text-ink w-4 text-[10px] text-center transition-colors shrink-0">
          {open ? '▼' : '▶'}
        </button>
        <button onClick={() => onSelect(book, subj, cls)} className="flex-1 text-left min-w-0">
          <p className={`text-xs font-ui font-semibold bn leading-tight truncate
            ${isActive ? 'text-saffron-dark' : 'text-ink'}`}>
            {book.title_bn}
          </p>
          <p className="text-[10px] font-mono text-ink-light/70 truncate">{book.book_id_code}</p>
        </button>
        <Badge color={ready === total && total > 0 ? 'green' : ready > 0 ? 'yellow' : 'red'}>
          {ready}/{total}
        </Badge>
      </div>

      {/* Expanded: chapter table + action buttons */}
      {open && (
        <div className="border-t border-border/50">
          <table className="w-full table-fixed">
            <colgroup>
              <col style={{width:'28px'}} />
              <col style={{width:'auto'}} />
              <col style={{width:'36px'}} />
              <col style={{width:'60px'}} />
            </colgroup>
            <tbody>
              {book.chapters.map(ch => <QuestionCountRow key={ch.chapter_id} ch={ch} />)}
            </tbody>
          </table>
          <div className="flex gap-1.5 px-3 py-2 border-t border-border/50 bg-gray-50/50 flex-wrap">
            <button onClick={() => onAction(PANEL_ADD_CHAPTERS, book, subj, cls)}
              className="text-[11px] font-ui text-blue-600 hover:text-blue-800 border border-blue-200
                hover:border-blue-400 px-2 py-1 rounded-md transition-all bg-white">
              + Add Chapters
            </button>
            <button onClick={() => onAction(PANEL_ADD_QUESTIONS, book, subj, cls)}
              className="text-[11px] font-ui text-saffron hover:text-saffron-dark border border-saffron/30
                hover:border-saffron px-2 py-1 rounded-md transition-all bg-white font-medium">
              ↑ Import Questions
            </button>
            <button onClick={handleDelete}
              className="ml-auto text-[11px] font-ui text-red-400 hover:text-red-600 border border-red-100
                hover:border-red-300 px-2 py-1 rounded-md transition-all bg-white">
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Tree: full class › subject › book hierarchy
function CurriculumTree({ tree, activeBook, onSelect, onAction, token, onDeleted, loading, onRefresh, onAddBook, onAddClass }) {
  return (
    <div className="w-80 shrink-0 flex flex-col gap-2">
      {/* Tree header */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-ui font-semibold text-ink">Curriculum</p>
        <div className="flex items-center gap-1.5">
          <button onClick={onAddClass}
            className="text-[11px] font-ui px-2.5 py-1 rounded-lg border transition-all border-border text-ink hover:border-blue-300 hover:text-blue-600">
            + Class
          </button>
          <button onClick={onAddBook}
            className="text-[11px] font-ui px-2.5 py-1 rounded-lg border transition-all border-border text-ink hover:border-saffron/50">
            + Book
          </button>
          <button onClick={onRefresh} disabled={loading}
            className="text-[11px] font-ui text-ink-light hover:text-ink disabled:opacity-40 transition-colors px-1">
            {loading ? <Spinner /> : '↻'}
          </button>
        </div>
      </div>

      {/* Tree body */}
      <div className="bg-white rounded-xl border border-border p-3 overflow-y-auto flex-1 max-h-[620px]">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-ink-light"><Spinner /></div>
        ) : tree.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-xs font-ui text-ink-light mb-2">No classes or books yet.</p>
            <button onClick={onAddClass}
              className="text-xs font-ui text-blue-600 hover:text-blue-800 font-medium block mx-auto mb-1">
              + Add a class first →
            </button>
            <button onClick={onAddBook}
              className="text-xs font-ui text-saffron hover:text-saffron-dark font-medium block mx-auto">
              or add a book directly →
            </button>
          </div>
        ) : (
          tree.map(cls => (
            <div key={cls.class_id} className="mb-4">
              {/* Class label */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[9px] font-ui font-bold uppercase tracking-widest text-ink-light/50">Class</span>
                <span className="text-xs font-ui font-bold text-ink bn">{cls.class_name}</span>
              </div>

              {cls.subjects.map(subj => (
                <div key={subj.subject_id} className="mb-3">
                  {/* Subject label */}
                  <div className="flex items-center gap-1.5 mb-1.5 pl-1">
                    <span className="w-1 h-1 rounded-full bg-saffron/50 shrink-0" />
                    <span className="text-[11px] font-ui text-ink-light bn">{subj.subject_bn}</span>
                  </div>

                  {subj.books.map(book => (
                    <BookNode
                      key={book.book_id}
                      book={book} subj={subj} cls={cls}
                      isActive={activeBook?.book_id === book.book_id}
                      onSelect={onSelect}
                      onAction={onAction}
                      token={token}
                      onDeleted={onDeleted}
                    />
                  ))}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ─── Right panels ─────────────────────────────────────────────────────────────

// Context banner shown at top of every action panel
function ContextBanner({ cls, subj, book }) {
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2.5 border border-border mb-4">
      <p className="text-[10px] font-ui text-ink-light uppercase tracking-wide">
        {cls.class_name} › <span className="bn">{subj.subject_bn}</span>
      </p>
      <p className="text-sm font-ui font-semibold text-ink bn mt-0.5">{book.title_bn}</p>
      <p className="text-[10px] font-mono text-ink-light">{book.book_id_code} · {book.chapters.length} chapters</p>
    </div>
  )
}

function PanelAddClass({ token, onDone }) {
  const [busy, setBusy] = useState(false)
  const [msg,  setMsg]  = useState('')
  const [name,    setName]    = useState('')   // e.g. "Class 9"
  const [nameBn,  setNameBn]  = useState('')   // e.g. "নবম শ্রেণী"

  // Quick presets for common cases
  const PRESETS = [
    { name: 'Class 6',  bn: 'ষষ্ঠ শ্রেণী' },
    { name: 'Class 7',  bn: 'সপ্তম শ্রেণী' },
    { name: 'Class 8',  bn: 'অষ্টম শ্রেণী' },
    { name: 'Class 9',  bn: 'নবম শ্রেণী' },
    { name: 'Class 10', bn: 'দশম শ্রেণী' },
  ]

  const submit = async () => {
    if (!name.trim() || !nameBn.trim()) { setMsg('✗ Both fields are required'); return }
    setBusy(true); setMsg('')
    try {
      await apiFetch('POST', '/api/admin/curriculum/seed-class', { name: name.trim(), display_name_bn: nameBn.trim() }, token)
      setMsg(`✓ Class "${name}" added`)
      setName(''); setNameBn('')
      onDone()
    } catch (e) { setMsg(`✗ ${e.message}`) }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-ui font-semibold text-ink">Add New Class</h3>
        <p className="text-xs font-ui text-ink-light mt-0.5">
          Creates a class that books can be added to. Safe to submit if it already exists — it will be skipped.
        </p>
      </div>
      <Toast msg={msg} onClose={() => setMsg('')} />

      {/* Quick presets */}
      <div>
        <label className="text-xs font-ui font-medium text-ink-light block mb-1.5">Quick select</label>
        <div className="flex gap-2 flex-wrap">
          {PRESETS.map(p => (
            <button key={p.name}
              onClick={() => { setName(p.name); setNameBn(p.bn) }}
              className={`text-xs font-ui px-3 py-1.5 rounded-lg border transition-all
                ${name === p.name
                  ? 'bg-saffron text-white border-saffron'
                  : 'border-border hover:border-saffron/50 text-ink bg-white'}`}>
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Manual fields */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-ui font-medium text-ink-light block mb-1">Class name (English) *</label>
          <input placeholder="e.g. Class 9"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full text-xs font-ui border border-border rounded-lg px-3 py-2
              focus:outline-none focus:border-saffron/60 placeholder:text-ink-light/40" />
        </div>
        <div>
          <label className="text-xs font-ui font-medium text-ink-light block mb-1">বাংলা নাম *</label>
          <input placeholder="নবম শ্রেণী"
            value={nameBn}
            onChange={e => setNameBn(e.target.value)}
            className="w-full text-xs font-ui border border-border rounded-lg px-3 py-2 bn
              focus:outline-none focus:border-saffron/60 placeholder:text-ink-light/40" />
        </div>
      </div>

      <button onClick={submit} disabled={busy}
        className="w-full text-sm font-ui font-semibold bg-saffron text-white py-2.5 rounded-xl
          hover:bg-saffron-dark disabled:opacity-50 transition-all flex items-center justify-center gap-2">
        {busy ? <><Spinner /> Adding…</> : 'Add Class'}
      </button>
    </div>
  )
}

function PanelAddBook({ token, tree, onDone }) {
  const [busy, setBusy] = useState(false)
  const [msg,  setMsg]  = useState('')
  const [form, setForm] = useState({
    class_name: '', subject_name: '', subject_display_bn: '', book_id_code: '', title_bn: '',
  })
  const [chapters, setChapters] = useState([
    { chapter_number: 1, name_bn: '', subtitle_bn: '' },
  ])

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const addCh    = () => setChapters(p => [...p, { chapter_number: p.length + 1, name_bn: '', subtitle_bn: '' }])
  const removeCh = i  => setChapters(p => p.filter((_, j) => j !== i).map((c, j) => ({ ...c, chapter_number: j + 1 })))
  const setCh    = (i, k, v) => setChapters(p => p.map((c, j) => j === i ? { ...c, [k]: v } : c))

  const classOptions   = tree.map(c => c.class_name)
  const subjectOptions = form.class_name
    ? (tree.find(c => c.class_name === form.class_name)?.subjects || [])
    : []

  const submit = async () => {
    if (!form.class_name || !form.subject_name || !form.book_id_code || !form.title_bn) {
      setMsg('✗ Class, subject, book ID and title are required'); return
    }
    if (chapters.some(c => !c.name_bn.trim())) {
      setMsg('✗ All chapters need a name'); return
    }
    setBusy(true); setMsg('')
    try {
      const res = await apiFetch('POST', '/api/admin/curriculum/seed-book', {
        ...form, total_chapters: chapters.length, chapters,
      }, token)
      setMsg(
        `✓ Done\n` +
        `${res.book_created ? '• Book created' : '• Book already existed'}\n` +
        `${res.subject_created ? '• Subject created' : '• Subject already existed'}\n` +
        `• ${res.chapters_inserted} chapters added, ${res.chapters_skipped} skipped`
      )
      onDone()
    } catch (e) { setMsg(`✗ ${e.message}`) }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-ui font-semibold text-ink">Add New Book</h3>
        <p className="text-xs font-ui text-ink-light mt-0.5">
          Creates a new subject (if needed), then the book and its chapters.
        </p>
      </div>
      <Toast msg={msg} onClose={() => setMsg('')} />

      {/* Class */}
      <div>
        <label className="text-xs font-ui font-medium text-ink-light block mb-1.5">Class *</label>
        <div className="flex gap-2 flex-wrap items-center">
          {classOptions.map(cn => (
            <button key={cn} onClick={() => set('class_name', cn)}
              className={`text-xs font-ui px-3 py-1.5 rounded-lg border transition-all bn
                ${form.class_name === cn
                  ? 'bg-saffron text-white border-saffron'
                  : 'border-border hover:border-saffron/50 text-ink bg-white'}`}>
              {cn}
            </button>
          ))}
          <input
            placeholder="or type new, e.g. Class 9"
            value={classOptions.includes(form.class_name) ? '' : form.class_name}
            onChange={e => set('class_name', e.target.value)}
            className="text-xs font-ui border border-border rounded-lg px-3 py-1.5 flex-1 min-w-[140px]
              focus:outline-none focus:border-saffron/60 placeholder:text-ink-light/40"
          />
        </div>
      </div>

      {/* Subject */}
      <div>
        <label className="text-xs font-ui font-medium text-ink-light block mb-1.5">Subject *</label>
        {subjectOptions.length > 0 && (
          <div className="flex gap-2 flex-wrap mb-2">
            {subjectOptions.map(s => (
              <button key={s.subject_id}
                onClick={() => { set('subject_display_bn', s.subject_bn); set('subject_name', s.subject_bn) }}
                className={`text-xs font-ui px-3 py-1.5 rounded-lg border transition-all bn
                  ${form.subject_display_bn === s.subject_bn
                    ? 'bg-saffron text-white border-saffron'
                    : 'border-border hover:border-saffron/50 text-ink bg-white'}`}>
                {s.subject_bn}
              </button>
            ))}
            <span className="text-[11px] font-ui text-ink-light self-center">or add new:</span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <input placeholder="English name e.g. History *"
            value={form.subject_name}
            onChange={e => set('subject_name', e.target.value)}
            className="text-xs font-ui border border-border rounded-lg px-3 py-1.5
              focus:outline-none focus:border-saffron/60 placeholder:text-ink-light/40" />
          <input placeholder="বাংলা নাম যেমন ইতিহাস *"
            value={form.subject_display_bn}
            onChange={e => set('subject_display_bn', e.target.value)}
            className="text-xs font-ui border border-border rounded-lg px-3 py-1.5 bn
              focus:outline-none focus:border-saffron/60 placeholder:text-ink-light/40" />
        </div>
      </div>

      {/* Book ID + Title */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-ui font-medium text-ink-light block mb-1">Book ID code *</label>
          <input placeholder="e.g. otit_o_oitijhyo"
            value={form.book_id_code}
            onChange={e => set('book_id_code', e.target.value.toLowerCase().replace(/\s+/g, '_'))}
            className="w-full text-xs font-mono border border-border rounded-lg px-3 py-1.5
              focus:outline-none focus:border-saffron/60 placeholder:text-ink-light/40" />
          <p className="text-[10px] font-ui text-ink-light mt-0.5">lowercase, underscores</p>
        </div>
        <div>
          <label className="text-xs font-ui font-medium text-ink-light block mb-1">Book title (Bengali) *</label>
          <input placeholder="অতীত ও ঐতিহ্য"
            value={form.title_bn}
            onChange={e => set('title_bn', e.target.value)}
            className="w-full text-xs font-ui border border-border rounded-lg px-3 py-1.5 bn
              focus:outline-none focus:border-saffron/60 placeholder:text-ink-light/40" />
        </div>
      </div>

      {/* Chapters */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-ui font-medium text-ink-light">Chapters ({chapters.length})</label>
          <button onClick={addCh}
            className="text-xs font-ui text-saffron hover:text-saffron-dark font-medium transition-colors">
            + Add row
          </button>
        </div>
        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
          {chapters.map((ch, i) => (
            <div key={i} className="flex gap-1.5 items-center">
              <span className="text-[10px] font-mono text-ink-light w-5 text-right shrink-0">{ch.chapter_number}</span>
              <input placeholder="অধ্যায়ের নাম *"
                value={ch.name_bn}
                onChange={e => setCh(i, 'name_bn', e.target.value)}
                className="flex-1 text-xs font-ui border border-border rounded-lg px-2 py-1 bn min-w-0
                  focus:outline-none focus:border-saffron/60 placeholder:text-ink-light/40" />
              <input placeholder="subtitle (optional)"
                value={ch.subtitle_bn}
                onChange={e => setCh(i, 'subtitle_bn', e.target.value)}
                className="flex-1 text-xs font-ui border border-border rounded-lg px-2 py-1 bn min-w-0
                  focus:outline-none focus:border-saffron/60 placeholder:text-ink-light/40" />
              <button onClick={() => removeCh(i)}
                className="text-ink-light/40 hover:text-red-400 transition-colors text-sm shrink-0">×</button>
            </div>
          ))}
        </div>
      </div>

      <button onClick={submit} disabled={busy}
        className="w-full text-sm font-ui font-semibold bg-saffron text-white py-2.5 rounded-xl
          hover:bg-saffron-dark disabled:opacity-50 transition-all flex items-center justify-center gap-2">
        {busy ? <><Spinner /> Adding…</> : 'Add Book & Chapters'}
      </button>
    </div>
  )
}

function PanelAddChapters({ book, subj, cls, token, onDone }) {
  const [busy,     setBusy]     = useState(false)
  const [msg,      setMsg]      = useState('')
  const [chapters, setChapters] = useState([{ chapter_number: '', name_bn: '', subtitle_bn: '' }])

  const existingNums = new Set(book.chapters.map(c => c.chapter_number))

  const addRow    = () => setChapters(p => [...p, { chapter_number: '', name_bn: '', subtitle_bn: '' }])
  const removeRow = i  => setChapters(p => p.filter((_, j) => j !== i))
  const setRow    = (i, k, v) => setChapters(p => p.map((c, j) => j === i ? { ...c, [k]: v } : c))

  const submit = async () => {
    if (chapters.some(c => !c.name_bn.trim() || !c.chapter_number)) {
      setMsg('✗ All rows need a chapter number and name'); return
    }
    setBusy(true); setMsg('')
    try {
      const res = await apiFetch('POST', '/api/admin/curriculum/seed-book', {
        book_id_code:       book.book_id_code,
        title_bn:           book.title_bn,
        subject_name:       subj.subject_name || subj.subject_bn,
        subject_display_bn: subj.subject_bn,
        class_name:         cls.class_name,
        total_chapters:     book.chapters.length + chapters.length,
        chapters: chapters.map(c => ({ ...c, chapter_number: Number(c.chapter_number) })),
      }, token)
      setMsg(`✓ ${res.chapters_inserted} chapters added, ${res.chapters_skipped} already existed`)
      onDone()
    } catch (e) { setMsg(`✗ ${e.message}`) }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-ui font-semibold text-ink">Add Chapters</h3>
      <ContextBanner cls={cls} subj={subj} book={book} />
      <Toast msg={msg} onClose={() => setMsg('')} />

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-ui font-medium text-ink-light">
            New chapters &mdash; existing ch numbers are skipped
          </label>
          <button onClick={addRow}
            className="text-xs font-ui text-saffron hover:text-saffron-dark font-medium">+ Add row</button>
        </div>
        <div className="space-y-1.5">
          {chapters.map((ch, i) => {
            const conflict = existingNums.has(Number(ch.chapter_number))
            return (
              <div key={i} className="flex gap-1.5 items-center">
                <input type="number" placeholder="Ch#"
                  value={ch.chapter_number}
                  onChange={e => setRow(i, 'chapter_number', e.target.value)}
                  className={`w-12 text-xs font-mono border rounded-lg px-2 py-1 text-center
                    focus:outline-none focus:border-saffron/60
                    ${conflict ? 'border-yellow-300 bg-yellow-50' : 'border-border'}`}
                />
                <input placeholder="অধ্যায়ের নাম *"
                  value={ch.name_bn}
                  onChange={e => setRow(i, 'name_bn', e.target.value)}
                  className="flex-1 text-xs font-ui border border-border rounded-lg px-2 py-1 bn min-w-0
                    focus:outline-none focus:border-saffron/60 placeholder:text-ink-light/40" />
                <input placeholder="subtitle (optional)"
                  value={ch.subtitle_bn}
                  onChange={e => setRow(i, 'subtitle_bn', e.target.value)}
                  className="flex-1 text-xs font-ui border border-border rounded-lg px-2 py-1 bn min-w-0
                    focus:outline-none focus:border-saffron/60 placeholder:text-ink-light/40" />
                <button onClick={() => removeRow(i)}
                  className="text-ink-light/40 hover:text-red-400 transition-colors text-sm shrink-0">×</button>
              </div>
            )
          })}
        </div>
        {chapters.some(c => existingNums.has(Number(c.chapter_number))) && (
          <p className="text-[11px] font-ui text-yellow-600 mt-1.5">
            ⚠ Yellow rows already exist and will be skipped.
          </p>
        )}
      </div>

      <button onClick={submit} disabled={busy}
        className="w-full text-sm font-ui font-semibold bg-saffron text-white py-2.5 rounded-xl
          hover:bg-saffron-dark disabled:opacity-50 transition-all flex items-center justify-center gap-2">
        {busy ? <><Spinner /> Saving…</> : 'Save Chapters'}
      </button>
    </div>
  )
}

function PanelImportQuestions({ book, subj, cls, token, onDone }) {
  const [busy,     setBusy]     = useState(false)
  const [msg,      setMsg]      = useState('')
  const [qFiles,   setQFiles]   = useState([])
  const [progress, setProgress] = useState(null)

  const bookChapterNums = new Set(book.chapters.map(c => c.chapter_number))

  const onDrop = async (files) => {
    for (const file of files) {
      try {
        const data = await readJson(file)
        // Validate it's for this book
        if (data.book_id && data.book_id !== book.book_id_code) {
          setMsg(`✗ ${file.name}: book_id "${data.book_id}" doesn't match "${book.book_id_code}"`)
          continue
        }
        setQFiles(prev => {
          const key = `ch${data.chapter_no}`
          const idx = prev.findIndex(f => `ch${f.data.chapter_no}` === key)
          const next = [...prev]
          if (idx >= 0) next[idx] = { name: file.name, data }
          else next.push({ name: file.name, data })
          return next.sort((a, b) => a.data.chapter_no - b.data.chapter_no)
        })
      } catch (e) { setMsg(`✗ ${file.name}: ${e.message}`) }
    }
  }

  const submit = async () => {
    if (!qFiles.length) return
    setBusy(true); setMsg('')
    const results = []
    for (let i = 0; i < qFiles.length; i++) {
      const { name, data } = qFiles[i]
      setProgress({ done: i, total: qFiles.length, name })
      try {
        const res = await apiFetch('POST', '/api/admin/curriculum/seed-questions', data, token)
        results.push(`Ch ${data.chapter_no}: ${res.inserted} inserted, ${res.skipped} skipped${res.errors?.length ? ` ⚠ ${res.errors[0]}` : ''}`)
      } catch (e) { results.push(`Ch ${data.chapter_no}: ✗ ${e.message}`) }
    }
    setProgress(null); setBusy(false); setQFiles([])
    setMsg('✓ Import complete\n' + results.join('\n'))
    onDone()
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-ui font-semibold text-ink">Import Questions</h3>
      <ContextBanner cls={cls} subj={subj} book={book} />
      <Toast msg={msg} onClose={() => setMsg('')} />

      {/* Chapter status strip */}
      <div>
        <p className="text-[11px] font-ui text-ink-light mb-1.5">Chapter status:</p>
        <div className="flex flex-wrap gap-1">
          {book.chapters.map(ch => (
            <span key={ch.chapter_id}
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded border cursor-default
                ${ch.ready_for_exam
                  ? 'bg-green-50 border-green-200 text-green-700'
                  : ch.total_questions > 0
                    ? 'bg-yellow-50 border-yellow-200 text-yellow-700'
                    : 'bg-gray-50 border-gray-200 text-gray-400'}`}
              title={`Ch ${ch.chapter_number}: ${ch.total_questions} questions`}>
              {ch.chapter_number}
            </span>
          ))}
        </div>
        <p className="text-[10px] font-ui text-ink-light mt-1">
          <span className="text-green-600">■</span> ready &nbsp;
          <span className="text-yellow-600">■</span> partial &nbsp;
          <span className="text-gray-400">■</span> empty
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); onDrop(Array.from(e.dataTransfer.files)) }}
        onClick={() => {
          const inp = document.createElement('input')
          inp.type = 'file'; inp.accept = '.json'; inp.multiple = true
          inp.onchange = e => onDrop(Array.from(e.target.files))
          inp.click()
        }}
        className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed
          py-5 cursor-pointer transition-all select-none
          ${busy ? 'opacity-40 pointer-events-none' : 'border-border hover:border-saffron/50 hover:bg-gray-50'}`}>
        <span className="text-xl">📦</span>
        <p className="text-xs font-ui font-medium text-ink">Drop chapter question JSON files</p>
        <p className="text-[11px] font-ui text-ink-light">Multiple files OK — processed in chapter order</p>
      </div>

      {/* Queued file list */}
      {qFiles.length > 0 && (
        <div className="space-y-1">
          {qFiles.map((f, i) => {
            const chNum    = f.data.chapter_no
            const chExists = bookChapterNums.has(chNum)
            const qCount   = Object.values(f.data.questions || {}).reduce((s, a) => s + a.length, 0)
            return (
              <div key={i} className={`flex items-center gap-2 rounded-lg px-3 py-2 border text-xs font-ui
                ${!chExists ? 'bg-red-50 border-red-200' : 'bg-white border-border'}`}>
                <span className="font-mono text-ink-light w-8 shrink-0">ch{String(chNum).padStart(2,'0')}</span>
                <span className="text-ink flex-1 truncate">{f.name}</span>
                <span className="text-ink-light shrink-0">{qCount} Qs</span>
                {!chExists && <Badge color="red">chapter missing</Badge>}
                <button onClick={() => setQFiles(p => p.filter((_, j) => j !== i))}
                  disabled={busy}
                  className="text-ink-light/40 hover:text-red-400 transition-colors ml-1">×</button>
              </div>
            )
          })}

          {qFiles.some(f => !bookChapterNums.has(f.data.chapter_no)) && (
            <p className="text-[11px] font-ui text-red-600">
              ✗ Red files reference chapters that don't exist — add those chapters first.
            </p>
          )}

          {progress ? (
            <div className="pt-1">
              <p className="text-[11px] font-ui text-ink-light mb-1">
                Processing {progress.done + 1}/{progress.total}: {progress.name}
              </p>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-saffron rounded-full transition-all"
                  style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              </div>
            </div>
          ) : (
            <button onClick={submit} disabled={busy || qFiles.some(f => !bookChapterNums.has(f.data.chapter_no))}
              className="w-full text-sm font-ui font-semibold bg-saffron text-white py-2.5 rounded-xl mt-1
                hover:bg-saffron-dark disabled:opacity-50 transition-all flex items-center justify-center gap-2">
              {busy ? <><Spinner /> Importing…</> : `Import ${qFiles.length} file${qFiles.length > 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// Empty state when nothing is selected in the right panel
function PanelEmpty({ context, onAction }) {
  if (!context) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center">
        <p className="text-xs font-ui text-ink-light">Select a book from the tree</p>
        <p className="text-xs font-ui text-ink-light mt-0.5">or use <strong>+ Class</strong> / <strong>+ Book</strong> to add content</p>
      </div>
    )
  }
  const { book, subj, cls } = context
  return (
    <div className="flex flex-col items-center justify-center h-48 text-center">
      <p className="text-[10px] font-ui text-ink-light uppercase tracking-wide mb-1">
        {cls.class_name} › <span className="bn">{subj.subject_bn}</span>
      </p>
      <p className="text-base font-ui font-semibold text-ink bn mb-1">{book.title_bn}</p>
      <p className="text-[10px] font-mono text-ink-light mb-4">{book.book_id_code}</p>
      <div className="flex gap-2">
        <button onClick={() => onAction(PANEL_ADD_CHAPTERS)}
          className="text-xs font-ui border border-border px-4 py-2 rounded-xl hover:border-saffron/50 transition-all text-ink">
          + Add Chapters
        </button>
        <button onClick={() => onAction(PANEL_ADD_QUESTIONS)}
          className="text-xs font-ui bg-saffron text-white px-4 py-2 rounded-xl hover:bg-saffron-dark transition-all font-semibold">
          ↑ Import Questions
        </button>
      </div>
    </div>
  )
}

// ─── Analytics tab ────────────────────────────────────────────────────────────

function AnalyticsTab({ token }) {
  const [sessions,  setSessions]  = useState([])
  const [chStats,   setChStats]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [subTab,    setSubTab]    = useState('users')   // users | chapters | answers
  const [search,    setSearch]    = useState('')
  const [gradeFilter, setGradeFilter] = useState('')
  const [selectedExam, setSelectedExam] = useState(null)
  const [examDetail,   setExamDetail]   = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    Promise.all([
      apiFetch('GET', '/api/admin/exam-sessions', null, token),
      apiFetch('GET', '/api/admin/chapter-stats', null, token),
    ]).then(([sessData, chData]) => {
      setSessions(sessData.sessions || [])
      setChStats(chData.stats || [])
    }).catch(console.error)
    .finally(() => setLoading(false))
  }, [token])

  // ── summary stats ──────────────────────────────────────────────────────────
  const completed = sessions.filter(s => s.completed)
  const totalAttempts = completed.length
  const uniqueStudents = new Set(completed.map(s => s.user_id)).size
  const avgScore = totalAttempts > 0
    ? (completed.reduce((sum, s) => sum + (parseFloat(s.score_awarded) || 0), 0) / totalAttempts).toFixed(1)
    : '—'
  const avgPct = totalAttempts > 0
    ? Math.round(completed.reduce((sum, s) => {
        const max = parseFloat(s.score_max) || 1
        return sum + ((parseFloat(s.score_awarded) || 0) / max) * 100
      }, 0) / totalAttempts)
    : '—'

  // ── filtered sessions ──────────────────────────────────────────────────────
  const filteredSessions = completed.filter(s => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      (s.display_name || '').toLowerCase().includes(q) ||
      (s.chapter_name || '').toLowerCase().includes(q) ||
      (s.subject_name || '').toLowerCase().includes(q)
    const matchGrade = !gradeFilter || s.grade === gradeFilter
    return matchSearch && matchGrade
  }).sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at))

  const GRADE_COLORS = {
    'A+': 'bg-green-50 text-green-700 border-green-200',
    'A':  'bg-green-50 text-green-600 border-green-200',
    'B+': 'bg-blue-50 text-blue-700 border-blue-200',
    'B':  'bg-blue-50 text-blue-600 border-blue-200',
    'C':  'bg-yellow-50 text-yellow-700 border-yellow-200',
    'D':  'bg-red-50 text-red-600 border-red-200',
  }

  // Load full session detail when a row is clicked
  useEffect(() => {
    if (!selectedExam) { setExamDetail(null); return }
    setDetailLoading(true)
    apiFetch('GET', `/api/exam/session/${selectedExam.id}`, null, token)
      .then(d => setExamDetail(d))
      .catch(() => setExamDetail(null))
      .finally(() => setDetailLoading(false))
  }, [selectedExam, token])

  const fmt = iso => iso ? new Date(iso).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—'

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-ink-light font-ui text-sm">
      <Spinner /> <span className="ml-2">Loading analytics…</span>
    </div>
  )

  return (
    <div className="space-y-5">

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total attempts" value={totalAttempts} />
        <StatCard label="Unique students" value={uniqueStudents} />
        <StatCard label="Avg score" value={avgScore} sub="marks" accent />
        <StatCard label="Avg percentage" value={`${avgPct}%`} />
      </div>

      {/* Sub tabs */}
      <div className="flex gap-1 border-b border-border">
        {[['users', 'Student Exams'], ['chapters', 'Chapter Stats'], ['answers', 'Written Answers']].map(([key, label]) => (
          <button key={key} onClick={() => setSubTab(key)}
            className={`py-2 px-4 text-sm font-ui font-medium border-b-2 transition-colors
              ${subTab === key ? 'border-saffron text-saffron' : 'border-transparent text-ink-light hover:text-ink'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Student Exams ── */}
      {subTab === 'users' && (
        <div className="space-y-3">
          {/* Filters */}
          <div className="flex gap-2 flex-wrap">
            <input
              placeholder="Search student, chapter, subject…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 min-w-[200px] text-xs font-ui border border-border rounded-lg px-3 py-2
                focus:outline-none focus:border-saffron/60 placeholder:text-ink-light/40"
            />
            <select
              value={gradeFilter}
              onChange={e => setGradeFilter(e.target.value)}
              className="text-xs font-ui border border-border rounded-lg px-3 py-2 focus:outline-none focus:border-saffron/60 bg-white"
            >
              <option value="">All grades</option>
              {['A+','A','B+','B','C','D'].map(g => <option key={g}>{g}</option>)}
            </select>
            <span className="text-xs font-ui text-ink-light self-center">
              {filteredSessions.length} results
            </span>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-xs font-ui min-w-[700px]">
              <thead className="bg-gray-50 text-ink-light">
                <tr>
                  {['Student', 'Subject', 'Chapter', 'Score', 'P1', 'P2', 'Grade', 'Date'].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredSessions.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-8 text-ink-light">No results</td></tr>
                ) : filteredSessions.map((s, i) => (
                  <tr key={s.id || i}
                    className="border-t border-border hover:bg-saffron/5 cursor-pointer transition-colors"
                    onClick={() => setSelectedExam(s)}
                    title="Click to view full evaluation"
                  >
                    <td className="px-3 py-2 font-medium text-ink max-w-[120px] truncate">
                      {s.display_name || s.email || s.phone || s.user_id?.slice(0,8) + '…'}
                    </td>
                    <td className="px-3 py-2 text-ink-light bn max-w-[80px] truncate">{s.subject_name}</td>
                    <td className="px-3 py-2 bn max-w-[140px] truncate" title={s.chapter_name}>
                      Ch{s.chapter_number} {s.chapter_name}
                    </td>
                    <td className="px-3 py-2 font-semibold text-ink">
                      {s.score_awarded}/{s.score_max}
                      <span className="text-ink-light font-normal ml-1">
                        ({s.score_max > 0 ? Math.round((s.score_awarded/s.score_max)*100) : 0}%)
                      </span>
                    </td>
                    <td className="px-3 py-2 text-ink-light">
                      {s.part1_score_awarded ?? '—'}/{s.part1_score_max ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-ink-light">
                      {s.part2_score_awarded !== null ? `${s.part2_score_awarded}/${s.part2_score_max}` : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {s.grade ? (
                        <span className={`px-1.5 py-0.5 rounded border text-xs font-semibold ${GRADE_COLORS[s.grade] || ''}`}>
                          {s.grade}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2 text-ink-light whitespace-nowrap">{fmt(s.submitted_at)}</td>
                    <td className="px-3 py-2 text-ink-light/40 text-xs">→</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedExam && (
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-border">
              <div>
                <p className="text-xs font-ui font-semibold text-ink">
                  {selectedExam.display_name} — Ch{selectedExam.chapter_number} {selectedExam.chapter_name}
                </p>
                <p className="text-[11px] font-ui text-ink-light mt-0.5">
                  {fmt(selectedExam.submitted_at)} · Score: {selectedExam.score_awarded}/{selectedExam.score_max} · Grade: {selectedExam.grade}
                </p>
              </div>
              <button onClick={() => setSelectedExam(null)}
                className="text-ink-light hover:text-ink text-lg leading-none px-2">×</button>
            </div>

            {detailLoading ? (
              <div className="flex items-center justify-center py-8 gap-2">
                <Spinner /><span className="text-xs font-ui text-ink-light">Loading evaluation…</span>
              </div>
            ) : examDetail ? (
              <div className="divide-y divide-border max-h-96 overflow-y-auto">
                {/* Part 1 summary */}
                <div className="px-4 py-3 bg-blue-50/30">
                  <p className="text-xs font-ui font-semibold text-ink mb-1">
                    অংশ ১ — {selectedExam.part1_score_awarded}/{selectedExam.part1_score_max}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {(examDetail.part1_evals || []).map((e, i) => (
                      <span key={i} title={`Q: ${e.question_bn}
StudentAns: ${e.student_answer}
Correct: ${e.correct_answer}`}
                        className={`text-[10px] font-ui px-1.5 py-0.5 rounded border cursor-help
                          ${e.is_correct ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-500'}`}>
                        Q{i+1} {e.is_correct ? '✓' : '✗'} {e.marks_awarded}/{e.marks_max}
                      </span>
                    ))}
                    {(examDetail.part1_evals || []).length === 0 && (
                      <span className="text-[10px] font-ui text-ink-light">No Part 1 evaluation data</span>
                    )}
                  </div>
                </div>

                {/* Part 2 detail */}
                <div className="px-4 py-3">
                  <p className="text-xs font-ui font-semibold text-ink mb-2">
                    অংশ ২ — {selectedExam.part2_score_awarded ?? 'বাদ'}/{selectedExam.part2_score_max}
                  </p>
                  {(examDetail.part2_evals || []).length === 0 ? (
                    <p className="text-[11px] font-ui text-ink-light">
                      {selectedExam.part2_score_awarded === 0 && selectedExam.part2_completed
                        ? 'Part 2 was skipped (-1 mark penalty)'
                        : 'No Part 2 data'}
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {examDetail.part2_evals.map((e, i) => (
                        <div key={i} className="space-y-1">
                          <div className="flex items-start gap-2">
                            <span className={`flex-shrink-0 text-[10px] font-ui font-semibold px-1.5 py-0.5 rounded border mt-0.5
                              ${e.is_correct ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-500'}`}>
                              {e.marks_awarded}/{e.marks_max}
                            </span>
                            <p className="bn text-xs text-ink leading-snug">{e.question_bn}</p>
                          </div>
                          <div className="ml-8 flex flex-wrap gap-x-4 gap-y-0.5">
                            <span className="text-[10px] font-ui text-ink-light">
                              ছাত্র: <span className="bn font-semibold text-ink">{e.student_answer || '—'}</span>
                            </span>
                            <span className="text-[10px] font-ui text-ink-light">
                              সঠিক: <span className="bn font-semibold text-forest">{e.correct_answer || '—'}</span>
                            </span>
                          </div>
                          {e.feedback_bn && (
                            <p className="ml-8 bn text-[10px] text-ink-light italic leading-snug">{e.feedback_bn}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="px-4 py-8 text-center">
                <p className="text-xs font-ui text-ink-light">Could not load evaluation details</p>
              </div>
            )}
          </div>
        )}

      {/* ── Chapter Stats ── */}
      {subTab === 'chapters' && (
        <div className="bg-white rounded-xl border border-border overflow-x-auto">
          <table className="w-full text-xs font-ui min-w-[500px]">
            <thead className="bg-gray-50 text-ink-light">
              <tr>
                {['Book', 'Chapter', 'Attempts', 'Avg Score', 'Last attempt'].map(h => (
                  <th key={h} className="text-left px-3 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {chStats.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-ink-light">No data yet</td></tr>
              ) : chStats.map((s, i) => (
                <tr key={i} className="border-t border-border hover:bg-gray-50">
                  <td className="px-3 py-2 text-ink-light">{s.chapters?.books?.title_bn || '—'}</td>
                  <td className="px-3 py-2 bn text-ink max-w-[200px] truncate">
                    Ch{s.chapters?.chapter_number} {s.chapters?.name_bn}
                  </td>
                  <td className="px-3 py-2 font-semibold text-ink">{s.total_attempts}</td>
                  <td className="px-3 py-2 text-ink">
                    {s.average_score != null ? parseFloat(s.average_score).toFixed(1) : '—'}
                  </td>
                  <td className="px-3 py-2 text-ink-light">{fmt(s.last_updated)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Written Answers ── */}
      {subTab === 'answers' && (
        <WrittenAnswersPanel token={token} sessions={completed} fmt={fmt} />
      )}
    </div>
  )
}

function WrittenAnswersPanel({ token, sessions, fmt }) {
  const [selectedSession, setSelectedSession] = useState(null)
  const [answers,         setAnswers]         = useState(null)
  const [loading,         setLoading]         = useState(false)

  const sessionsWithP2 = sessions.filter(s =>
    s.part2_completed && parseFloat(s.part2_score_max) > 0
  )

  const loadAnswers = async (session) => {
    setSelectedSession(session)
    setLoading(true)
    try {
      const d = await apiFetch('GET', `/api/exam/session/${session.id}`, null, token)
      setAnswers(d)
    } catch (e) { setAnswers(null) }
    finally { setLoading(false) }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-white rounded-xl border border-border overflow-y-auto max-h-[520px]">
        <div className="px-3 py-2 border-b border-border bg-gray-50">
          <p className="text-xs font-ui font-semibold text-ink-light">
            {sessionsWithP2.length} sessions with Part 2
          </p>
        </div>
        {sessionsWithP2.length === 0 ? (
          <p className="text-xs font-ui text-ink-light text-center py-8">No Part 2 submissions yet</p>
        ) : sessionsWithP2.map((s, i) => (
          <button key={i} onClick={() => loadAnswers(s)}
            className={`w-full text-left px-3 py-3 border-t border-border transition-colors
              ${selectedSession?.id === s.id ? 'bg-saffron/5 border-l-2 border-l-saffron' : 'hover:bg-gray-50'}`}>
            <p className="text-xs font-ui font-semibold text-ink truncate">
              {s.display_name || s.user_id?.slice(0,8)}
            </p>
            <p className="text-[11px] font-ui text-ink-light bn truncate mt-0.5">
              Ch{s.chapter_number} {s.chapter_name}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] font-ui text-ink-light">{fmt(s.submitted_at)}</span>
              <span className="text-[10px] font-ui font-semibold text-saffron-dark">
                P2: {s.part2_score_awarded}/{s.part2_score_max}
              </span>
            </div>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-border">
        {!selectedSession && (
          <div className="flex items-center justify-center h-48 text-ink-light text-xs font-ui">
            Select a session to view answers
          </div>
        )}
        {loading && (
          <div className="flex items-center justify-center h-48 gap-2">
            <Spinner /><span className="text-xs font-ui text-ink-light">Loading…</span>
          </div>
        )}
        {answers && !loading && (
          <div className="overflow-y-auto max-h-[520px]">
            <div className="px-4 py-3 border-b border-border bg-gray-50">
              <p className="text-xs font-ui font-semibold text-ink">
                {selectedSession.display_name} · Ch{selectedSession.chapter_number}
              </p>
              <p className="text-[11px] font-ui text-ink-light bn">{selectedSession.chapter_name}</p>
            </div>
            <div className="divide-y divide-border">
              {/* Use evaluations if available (have student_answer, correct_answer, feedback)
                  Otherwise fall back to question list with ocr_answers map */}
              {(answers.part2_evals?.length > 0
                ? answers.part2_evals.map((ev, i) => ({
                    slotId:       i + 1,
                    questionBn:   ev.question_bn,
                    studentAns:   ev.student_answer,
                    correctAns:   ev.correct_answer,
                    marksAwarded: ev.marks_awarded,
                    marksMax:     ev.marks_max,
                    isCorrect:    ev.is_correct,
                    feedbackBn:   ev.feedback_bn,
                  }))
                : (answers.session?.part2_questions || []).map((q, i) => {
                    const slotId = q.answer_slot_id
                    const ocrAns = answers.session?.part2_ocr_answers?.[slotId]
                                ?? answers.session?.part2_ocr_answers?.[String(slotId)]
                    return {
                      slotId,
                      questionBn:   q.question_bn,
                      studentAns:   ocrAns || null,
                      correctAns:   q.expected_answer || null,
                      marksAwarded: null,
                      marksMax:     null,
                      isCorrect:    null,
                      feedbackBn:   null,
                    }
                  })
              ).map(({ slotId, questionBn, studentAns, correctAns, marksAwarded, marksMax, isCorrect, feedbackBn }, i) => {
                const displayAnswer = studentAns || '—'

                return (
                  <div key={i} className="px-4 py-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-pink-400 text-white text-[10px] font-bold font-ui flex items-center justify-center mt-0.5">
                        {slotId}
                      </span>
                      <p className="bn text-xs text-ink leading-relaxed font-medium">{questionBn}</p>
                    </div>
                    <div className="ml-7 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-ui text-ink-light">ছাত্রের উত্তর:</span>
                        <span className="bn text-xs font-semibold text-ink bg-gray-50 px-2 py-0.5 rounded border border-border">
                          {displayAnswer}
                        </span>
                      </div>
                      {correctAns && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-ui text-ink-light">সঠিক উত্তর:</span>
                          <span className="bn text-xs text-forest font-semibold">{correctAns}</span>
                        </div>
                      )}
                      {marksAwarded !== null && (
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-ui font-semibold px-1.5 py-0.5 rounded border
                            ${isCorrect ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                            {marksAwarded}/{marksMax} নম্বর
                          </span>
                          <span className="text-[10px] font-ui text-ink-light">
                            {isCorrect ? '✓ সঠিক' : '✗ ভুল'}
                          </span>
                        </div>
                      )}
                      {feedbackBn && (
                        <p className="bn text-[10px] text-ink-light leading-snug italic">{feedbackBn}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}



function CurriculumTab({ token }) {
  const [tree,       setTree]       = useState([])
  const [loading,    setLoading]    = useState(true)
  const [panel,      setPanel]      = useState(PANEL_NONE)
  const [context,    setContext]    = useState(null)   // { book, subj, cls }
  const [activeBook, setActiveBook] = useState(null)

  const loadTree = useCallback(async () => {
    setLoading(true)
    try {
      const d = await apiFetch('GET', '/api/admin/curriculum/tree', null, token)
      setTree(d.tree)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [token])

  useEffect(() => { loadTree() }, [loadTree])

  const selectBook = (book, subj, cls) => {
    setActiveBook(book); setContext({ book, subj, cls }); setPanel(PANEL_NONE)
  }
  const selectAction = (action, book, subj, cls) => {
    setActiveBook(book); setContext({ book, subj, cls }); setPanel(action)
  }
  const onDeleted = code => {
    setTree(prev => prev
      .map(cls => ({
        ...cls,
        subjects: cls.subjects
          .map(s => ({ ...s, books: s.books.filter(b => b.book_id_code !== code) }))
          .filter(s => s.books.length > 0),
      }))
      .filter(c => c.subjects.length > 0))
    setPanel(PANEL_NONE); setActiveBook(null); setContext(null)
  }
  const onDone = () => loadTree()

  return (
    <div className="flex gap-4 items-start min-h-[600px]">

      {/* Left: tree */}
      <CurriculumTree
        tree={tree} loading={loading}
        activeBook={activeBook}
        onSelect={selectBook}
        onAction={selectAction}
        token={token}
        onDeleted={onDeleted}
        onRefresh={loadTree}
        onAddClass={() => { setPanel(PANEL_ADD_CLASS); setActiveBook(null); setContext(null) }}
        onAddBook={() => { setPanel(PANEL_ADD_BOOK); setActiveBook(null); setContext(null) }}
      />

      {/* Right: action panel */}
      <div className="flex-1 min-w-0 bg-white rounded-xl border border-border p-5">
        {panel === PANEL_ADD_CLASS &&
          <PanelAddClass token={token} onDone={onDone} />}
        {panel === PANEL_ADD_BOOK &&
          <PanelAddBook token={token} tree={tree} onDone={onDone} />}
        {panel === PANEL_ADD_CHAPTERS && context &&
          <PanelAddChapters {...context} token={token} onDone={onDone} />}
        {panel === PANEL_ADD_QUESTIONS && context &&
          <PanelImportQuestions {...context} token={token} onDone={onDone} />}
        {panel === PANEL_NONE &&
          <PanelEmpty context={context}
            onAction={action => context && selectAction(action, context.book, context.subj, context.cls)} />}
      </div>
    </div>
  )
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { token, signOut } = useAuth()
  const [tab,       setTab]       = useState('Curriculum')
  const [summary,   setSummary]   = useState(null)
  const [providers, setProviders] = useState(null)
  const [logs,      setLogs]      = useState([])
  const [msg,       setMsg]       = useState('')

  useEffect(() => {
    if (tab === 'Overview') api.getUsageSummary(token).then(d => setSummary(d)).catch(() => {})
    if (tab === 'Models')   api.getAdminConfig(token).then(d => setProviders(d.providers)).catch(() => {})
    if (tab === 'Logs')     api.getUsageLogs(token, { limit: 50 }).then(d => setLogs(d.logs)).catch(() => {})
  }, [tab, token])

  const switchProvider = async (purpose, providerName, modelName) => {
    setMsg('')
    try {
      await api.updateProvider(purpose, providerName, modelName, token)
      setMsg(`✓ Switched ${purpose} to ${providerName} / ${modelName}`)
      api.getAdminConfig(token).then(d => setProviders(d.providers))
    } catch (e) { setMsg(`✗ ${e.message}`) }
  }

  const clearLogs = async () => {
    if (!confirm('Clear all API logs?')) return
    await api.clearLogs(token); setLogs([]); setMsg('✓ Logs cleared')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-ink text-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-saffron font-bold text-lg">📚</span>
          <span className="font-ui font-semibold">Admin Dashboard</span>
        </div>
        <button onClick={signOut} className="text-xs text-white/60 hover:text-white font-ui transition-colors">
          Sign out
        </button>
      </div>

      <div className="bg-white border-b border-border px-6 flex gap-1">
        {TABS.map(t => (
          <button key={t} onClick={() => { setTab(t); setMsg('') }}
            className={`py-3 px-4 text-sm font-ui font-medium border-b-2 transition-colors
              ${tab === t ? 'border-saffron text-saffron' : 'border-transparent text-ink-light hover:text-ink'}`}>
            {t}
          </button>
        ))}
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {msg && tab !== 'Curriculum' && <Toast msg={msg} onClose={() => setMsg('')} />}

        {tab === 'Curriculum' && <CurriculumTab token={token} />}

        {tab === 'Analytics' && <AnalyticsTab token={token} />}

        {tab === 'Overview' && (
          <div className="space-y-6">
            <h2 className="text-base font-ui font-semibold text-ink">Usage Overview (last 30 days)</h2>
            {!summary ? (
              <div className="bg-white rounded-xl border border-border px-6 py-10 text-center">
                <p className="text-sm font-ui text-ink-light">Loading usage data…</p>
                <p className="text-xs font-ui text-ink-light/60 mt-1">
                  If this persists, check that api_calls table has data and v_cost_summary view exists.
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCard label="Total calls" value={summary.summary?.reduce((a, r) => a + r.calls, 0) ?? 0} />
                  <StatCard label="Total cost (₹)" accent value={`₹${(summary.summary?.reduce((a, r) => a + r.total_cost_inr, 0) ?? 0).toFixed(2)}`} />
                  <StatCard label="Avg cost/call" value={
                    summary.summary?.length > 0
                      ? `₹${(summary.summary.reduce((a,r) => a + r.total_cost_inr, 0) / summary.summary.reduce((a,r) => a + r.calls, 0)).toFixed(4)}`
                      : '—'
                  } sub="per API call" />
                  <StatCard label="Call types" value={new Set(summary.summary?.map(r => r.call_type)).size ?? 0} sub="distinct" />
                </div>
                <div className="bg-white rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-sm font-ui">
                    <thead className="bg-gray-50 text-xs text-ink-light">
                      <tr>{['Day','Type','Provider','Model','Calls','Input tok','Output tok','Cost (₹)'].map(h => (
                        <th key={h} className="text-left px-3 py-2">{h}</th>
                      ))}</tr>
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

        {tab === 'Models' && providers && (
          <div className="space-y-6">
            <h2 className="text-base font-ui font-semibold text-ink">LLM Provider Config</h2>
            <p className="text-sm font-ui text-ink-light">Switching takes effect immediately — no restart needed.</p>
            {Object.entries(providers).map(([purpose, data]) => (
              <div key={purpose} className="bg-white rounded-xl border border-border p-5">
                <h3 className="font-ui font-semibold text-sm text-ink mb-3 capitalize">{purpose.replace('_', ' ')}</h3>
                <div className="space-y-2">
                  {data.active && (
                    <div className="flex items-center justify-between bg-forest-light border border-forest/30 rounded-xl px-4 py-3">
                      <div>
                        <span className="text-xs font-ui text-forest font-semibold">ACTIVE</span>
                        <p className="text-sm font-ui text-ink mt-0.5">{data.active.provider_name} / {data.active.model_name}</p>
                        <p className="text-xs text-ink-light font-ui">${data.active.cost_input_per_m}/${data.active.cost_output_per_m} per M tokens{data.active.vision_enabled ? ' · vision ✓' : ''}</p>
                      </div>
                      <span className="text-green-500 text-xl">●</span>
                    </div>
                  )}
                  {data.available?.map(p => (
                    <div key={p.id} className="flex items-center justify-between border border-border rounded-xl px-4 py-3">
                      <div>
                        <p className="text-sm font-ui text-ink">{p.provider_name} / {p.model_name}</p>
                        <p className="text-xs text-ink-light font-ui">${p.cost_input_per_m}/${p.cost_output_per_m} per M tokens{p.vision_enabled ? ' · vision ✓' : ''}</p>
                      </div>
                      <button onClick={() => switchProvider(purpose, p.provider_name, p.model_name)}
                        className="text-xs font-ui font-semibold text-saffron border border-saffron/30 px-3 py-1.5 rounded-lg hover:bg-saffron hover:text-white transition-all">
                        Switch
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'Logs' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-ui font-semibold text-ink">API Call Logs</h2>
              <button onClick={clearLogs} className="text-xs font-ui text-red-500 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-all">
                Clear all logs
              </button>
            </div>
            <div className="bg-white rounded-xl border border-border overflow-x-auto">
              <table className="w-full text-xs font-ui min-w-[700px]">
                <thead className="bg-gray-50 text-ink-light">
                  <tr>{['Time','Type','Provider','Model','In tok','Out tok','₹','OK'].map(h => (
                    <th key={h} className="text-left px-3 py-2">{h}</th>
                  ))}</tr>
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
                        <span className={log.success ? 'text-green-600' : 'text-red-600'}>{log.success ? '✓' : '✗'}</span>
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
