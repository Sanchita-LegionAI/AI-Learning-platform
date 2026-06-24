// components/questions/TapSequenceQuestion.jsx
// Tap items to build the sequence — no drag needed on mobile
import { useState } from 'react'

export function TapSequenceQuestion({ question, answer, onChange }) {
  // answer: array of items in student's chosen order
  const allItems = question.items || []
  const chosen   = answer || []
  const remaining = allItems.filter(item => !chosen.includes(item))

  const addItem = (item) => onChange([...chosen, item])

  const removeItem = (index) => {
    const next = [...chosen]
    next.splice(index, 1)
    onChange(next)
  }

  return (
    <div className="space-y-4">
      <p className="bn text-base text-ink leading-relaxed font-medium">{question.question_bn}</p>
      <p className="text-xs font-ui text-ink-light">নিচের বাক্সে ট্যাপ করে সঠিক ক্রমে সাজাও</p>

      {/* Student's built sequence */}
      <div className="min-h-[60px] bg-blue-50 border-2 border-blue-200 border-dashed rounded-xl p-2 space-y-1.5">
        {chosen.length === 0 ? (
          <p className="bn text-xs text-blue-400 text-center py-2">এখানে ধাপগুলো আসবে</p>
        ) : (
          chosen.map((item, i) => (
            <button
              key={i}
              onClick={() => removeItem(i)}
              className="w-full flex items-center gap-2 bg-white border border-blue-300 rounded-lg px-3 py-2 text-left hover:bg-red-50 hover:border-red-300 transition-colors"
            >
              <span className="w-5 h-5 rounded-full bg-saffron text-white text-xs font-bold font-ui flex items-center justify-center flex-shrink-0">
                {i + 1}
              </span>
              <span className="bn text-sm text-ink flex-1">{item}</span>
              <span className="text-red-400 text-xs font-ui">✕</span>
            </button>
          ))
        )}
      </div>

      {/* Available items to tap */}
      {remaining.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-ui text-ink-light">এখান থেকে বেছে নাও:</p>
          {remaining.map((item, i) => (
            <button
              key={i}
              onClick={() => addItem(item)}
              className="w-full text-left px-4 py-2.5 rounded-xl bg-white border border-border hover:border-saffron hover:bg-saffron-light transition-all"
            >
              <span className="bn text-sm text-ink">{item}</span>
            </button>
          ))}
        </div>
      )}

      {chosen.length > 0 && remaining.length > 0 && (
        <p className="text-xs font-ui text-ink-light text-center">
          কোনো ধাপে ট্যাপ করলে সরিয়ে দেওয়া যাবে
        </p>
      )}
    </div>
  )
}
