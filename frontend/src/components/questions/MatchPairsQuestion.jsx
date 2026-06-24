// components/questions/MatchPairsQuestion.jsx
import { useState } from 'react'

export function MatchPairsQuestion({ question, answer, onChange }) {
  // answer shape: { "left_item": "right_item", ... }
  const pairs      = question.pairs || []
  const leftItems  = pairs.map(p => p.left)
  const rightItems = [...pairs.map(p => p.right)].sort(() => Math.random() - 0.5)

  // We only shuffle once — store shuffled order in local state
  const [shuffled] = useState(() => [...pairs.map(p => p.right)].sort(() => Math.random() - 0.5))
  const [selectedLeft, setSelectedLeft] = useState(null)

  const current = answer || {}

  // All matched right-side items
  const matchedRights = new Set(Object.values(current))

  const handleLeft = (left) => {
    // If already matched, unmatch it
    if (current[left]) {
      const next = { ...current }
      delete next[left]
      onChange(next)
      setSelectedLeft(null)
    } else {
      setSelectedLeft(left === selectedLeft ? null : left)
    }
  }

  const handleRight = (right) => {
    if (!selectedLeft) return
    // If this right is already taken by another left, remove that link first
    const next = { ...current }
    const prevLeft = Object.keys(next).find(k => next[k] === right)
    if (prevLeft) delete next[prevLeft]
    next[selectedLeft] = right
    onChange(next)
    setSelectedLeft(null)
  }

  return (
    <div className="space-y-3">
      <p className="bn text-base text-ink leading-relaxed font-medium">{question.question_bn}</p>
      <p className="text-xs font-ui text-ink-light">বাম থেকে একটি বেছে, তারপর ডান থেকে মেলান</p>

      <div className="grid grid-cols-2 gap-2">
        {/* Left column */}
        <div className="space-y-2">
          <p className="text-xs font-ui text-ink-light text-center mb-1">ক-স্তম্ভ</p>
          {leftItems.map((left, i) => {
            const matched  = !!current[left]
            const selected = selectedLeft === left
            return (
              <button
                key={i}
                onClick={() => handleLeft(left)}
                className={`w-full text-left px-3 py-2.5 rounded-xl border-2 text-xs bn leading-snug transition-all
                  ${selected  ? 'bg-saffron border-saffron text-white' :
                    matched   ? 'bg-blue-50 border-blue-400 text-blue-800' :
                                'bg-white border-border text-ink hover:border-saffron/50'}`}
              >
                {left}
                {matched && <span className="ml-1 text-blue-400">✓</span>}
              </button>
            )
          })}
        </div>

        {/* Right column */}
        <div className="space-y-2">
          <p className="text-xs font-ui text-ink-light text-center mb-1">খ-স্তম্ভ</p>
          {shuffled.map((right, i) => {
            const taken    = matchedRights.has(right)
            const isMyMatch = selectedLeft && current[selectedLeft] === right
            return (
              <button
                key={i}
                onClick={() => handleRight(right)}
                disabled={taken && !isMyMatch}
                className={`w-full text-left px-3 py-2.5 rounded-xl border-2 text-xs bn leading-snug transition-all
                  ${isMyMatch ? 'bg-blue-100 border-blue-400 text-blue-800' :
                    taken     ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-default' :
                    selectedLeft ? 'bg-white border-saffron/40 text-ink hover:bg-saffron-light hover:border-saffron' :
                                   'bg-white border-border text-ink'}`}
              >
                {right}
              </button>
            )
          })}
        </div>
      </div>

      {/* Matched pairs summary */}
      {Object.keys(current).length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 space-y-1">
          <p className="text-xs font-ui text-blue-600 mb-1">মেলানো জুটি:</p>
          {Object.entries(current).map(([l, r]) => (
            <p key={l} className="bn text-xs text-blue-800">
              {l} <span className="text-blue-400 font-ui mx-1">→</span> {r}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
