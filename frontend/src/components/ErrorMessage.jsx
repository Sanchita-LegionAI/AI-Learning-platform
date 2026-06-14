// components/ErrorMessage.jsx
export default function ErrorMessage({ message, onRetry }) {
  return (
    <div className="card border-red-200 bg-red-50 text-center">
      <p className="text-3xl mb-2">⚠️</p>
      <p className="bn text-ink text-sm">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-3 btn-secondary text-sm py-2">
          আবার চেষ্টা করুন
        </button>
      )}
    </div>
  )
}
