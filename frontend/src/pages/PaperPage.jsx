// pages/PaperPage.jsx
import { useLocation, useNavigate } from 'react-router-dom'
import ProgressBar from '../components/ProgressBar'

const MARKS_COLOR = {
  2: 'bg-blue-50 text-blue-700 border-blue-200',
  3: 'bg-amber-50 text-amber-700 border-amber-200',
  5: 'bg-purple-50 text-purple-700 border-purple-200',
}

export default function PaperPage() {
  const { state } = useLocation()
  const navigate  = useNavigate()

  if (!state?.examData) {
    navigate('/exam/select')
    return null
  }

  const { examData } = state
  const { session_id, chapter_name, subject, generated_questions, total_marks } = examData

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <ProgressBar currentStep="paper" />

      <div className="flex-1 max-w-app mx-auto w-full px-4 py-5 page-enter">

        {/* Paper header */}
        <div className="card mb-5 text-center bg-ink text-white border-ink">
          <p className="font-ui text-xs text-white/60 uppercase tracking-wider mb-1">
            পশ্চিমবঙ্গ মধ্যশিক্ষা পর্ষদ
          </p>
          <h1 className="bn text-lg font-bold mb-0.5">{chapter_name}</h1>
          <p className="font-ui text-sm text-white/70">{subject}</p>
          <div className="mt-3 pt-3 border-t border-white/20 flex justify-center gap-6">
            <div>
              <p className="text-xs text-white/50 font-ui">মোট নম্বর</p>
              <p className="text-xl font-bold">{total_marks}</p>
            </div>
            <div>
              <p className="text-xs text-white/50 font-ui">প্রশ্ন সংখ্যা</p>
              <p className="text-xl font-bold">{generated_questions.length}</p>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-forest-light border border-forest/30 rounded-xl px-4 py-3 mb-5">
          <p className="bn text-sm text-forest-dark font-medium mb-1">নির্দেশাবলী</p>
          <ul className="bn text-xs text-forest-dark/80 space-y-0.5 list-disc list-inside">
            <li>খাতায় উত্তর লিখুন</li>
            <li>প্রতিটি প্রশ্নের নম্বর লিখতে ভুলবেন না</li>
            <li>লেখা শেষ হলে ছবি তুলুন</li>
          </ul>
        </div>

        {/* Questions */}
        <div className="space-y-3 mb-6">
          {generated_questions.map((q, i) => (
            <div key={q.id || i} className="card">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="font-ui text-xs text-ink-light mb-1.5">প্রশ্ন {i + 1}</p>
                  <p className="bn text-base text-ink leading-relaxed">{q.question}</p>
                  {q.topic && (
                    <p className="bn text-xs text-ink-light/70 mt-1.5">বিষয়: {q.topic}</p>
                  )}
                </div>
                <span className={`
                  flex-shrink-0 text-xs font-ui font-semibold px-2 py-1 rounded-lg border
                  ${MARKS_COLOR[q.marks] || 'bg-gray-50 text-gray-600 border-gray-200'}
                `}>
                  {q.marks} নম্বর
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Proceed button */}
        <div className="pb-8">
          <button
            onClick={() => navigate('/exam/upload', { state: { session_id, examData } })}
            className="btn-primary"
          >
            উত্তর লিখে ফটো তুলুন →
          </button>
          <p className="bn text-xs text-ink-light text-center mt-3">
            প্রথমে খাতায় সব উত্তর লিখুন, তারপর এগিয়ে যান
          </p>
        </div>
      </div>
    </div>
  )
}
