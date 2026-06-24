// components/questions/CategorizeQuestion.jsx
// Tap an item, then tap a category to place it there

export function CategorizeQuestion({ question, answer, onChange }) {
  // answer: { "category_name": ["item1", "item2"], ... }
  const categories  = question.categories || {}
  const categoryNames = Object.keys(categories)
  const allItems    = categoryNames.flatMap(c => categories[c])

  const current = answer || {}

  // Which items have been placed
  const placedItems = new Set(categoryNames.flatMap(c => current[c] || []))
  const unplaced    = allItems.filter(item => !placedItems.has(item))

  const placeItem = (item, cat) => {
    const next = { ...current }
    // Remove from any existing category first
    for (const c of categoryNames) {
      next[c] = (next[c] || []).filter(i => i !== item)
    }
    next[cat] = [...(next[cat] || []), item]
    onChange(next)
  }

  const removeItem = (item, cat) => {
    const next = { ...current }
    next[cat] = (next[cat] || []).filter(i => i !== item)
    onChange(next)
  }

  return (
    <div className="space-y-4">
      <p className="bn text-base text-ink leading-relaxed font-medium">{question.question_bn}</p>
      <p className="text-xs font-ui text-ink-light">প্রতিটি বিষয়কে সঠিক দলে রাখো</p>

      {/* Category drop zones */}
      <div className="space-y-3">
        {categoryNames.map((cat, ci) => {
          const placed = current[cat] || []
          const colors = [
            { bg: 'bg-blue-50', border: 'border-blue-300', header: 'bg-blue-100 text-blue-700', item: 'bg-blue-100 border-blue-300 text-blue-800' },
            { bg: 'bg-emerald-50', border: 'border-emerald-300', header: 'bg-emerald-100 text-emerald-700', item: 'bg-emerald-100 border-emerald-300 text-emerald-800' },
            { bg: 'bg-purple-50', border: 'border-purple-300', header: 'bg-purple-100 text-purple-700', item: 'bg-purple-100 border-purple-300 text-purple-800' },
          ]
          const c = colors[ci % colors.length]

          return (
            <div key={cat} className={`${c.bg} border-2 ${c.border} rounded-xl overflow-hidden`}>
              <div className={`${c.header} px-3 py-2`}>
                <p className="bn text-sm font-bold">{cat}</p>
              </div>
              <div className="p-2 min-h-[48px] flex flex-wrap gap-1.5">
                {placed.length === 0 && (
                  <p className="bn text-xs text-gray-400 px-1 py-1">এখানে রাখো</p>
                )}
                {placed.map((item, i) => (
                  <button
                    key={i}
                    onClick={() => removeItem(item, cat)}
                    className={`${c.item} border rounded-lg px-2.5 py-1 bn text-xs hover:bg-red-50 hover:border-red-300 hover:text-red-700 transition-colors`}
                  >
                    {item} <span className="ml-1 opacity-50">✕</span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Unplaced items */}
      {unplaced.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-ui text-ink-light">এখনো রাখা হয়নি — ট্যাপ করে দলে রাখো:</p>
          <div className="flex flex-wrap gap-2">
            {unplaced.map((item, i) => (
              <div key={i} className="relative group">
                <span className="bn text-sm bg-white border-2 border-border rounded-xl px-3 py-2 block">
                  {item}
                </span>
                {/* Quick-place buttons */}
                <div className="absolute top-full left-0 mt-1 z-10 hidden group-focus-within:flex flex-col gap-1 bg-white border border-border rounded-xl shadow-sm p-1 min-w-[120px]">
                  {categoryNames.map(cat => (
                    <button
                      key={cat}
                      onClick={() => placeItem(item, cat)}
                      className="bn text-xs text-left px-2 py-1.5 rounded-lg hover:bg-saffron-light hover:text-saffron-dark transition-colors"
                    >
                      → {cat}
                    </button>
                  ))}
                </div>
                {/* Always-visible tap buttons below on mobile */}
                <div className="flex gap-1 mt-1">
                  {categoryNames.map((cat, ci) => {
                    const colors = ['bg-blue-100 text-blue-700 border-blue-300', 'bg-emerald-100 text-emerald-700 border-emerald-300', 'bg-purple-100 text-purple-700 border-purple-300']
                    return (
                      <button
                        key={cat}
                        onClick={() => placeItem(item, cat)}
                        className={`${colors[ci % colors.length]} border rounded-lg px-2 py-0.5 text-[10px] font-ui whitespace-nowrap`}
                      >
                        {cat}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
