// components/LoadingMessage.jsx
export default function LoadingMessage({ message = 'অপেক্ষা করুন...' }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div className="bn-loader flex gap-1.5">
        <span className="text-saffron text-2xl">●</span>
        <span className="text-saffron text-2xl">●</span>
        <span className="text-saffron text-2xl">●</span>
      </div>
      <p className="bn text-ink-light text-base text-center px-4">{message}</p>
    </div>
  )
}
