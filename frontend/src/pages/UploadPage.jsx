// pages/UploadPage.jsx
import { useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import ProgressBar from '../components/ProgressBar'
import LoadingMessage from '../components/LoadingMessage'
import ErrorMessage from '../components/ErrorMessage'

export default function UploadPage() {
  const { token }    = useAuth()
  const { state }    = useLocation()
  const navigate     = useNavigate()
  const fileInputRef = useRef(null)

  const [preview,    setPreview]    = useState(null)
  const [imageData,  setImageData]  = useState(null)  // base64
  const [contentType, setContentType] = useState('image/jpeg')
  const [uploading,  setUploading]  = useState(false)
  const [evaluating, setEvaluating] = useState(false)
  const [error,      setError]      = useState('')

  if (!state?.session_id) {
    navigate('/exam/select')
    return null
  }

  const { session_id } = state

  const handleFile = (file) => {
    if (!file) return
    setContentType(file.type || 'image/jpeg')
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target.result
      setPreview(dataUrl)
      // Strip the "data:image/jpeg;base64," prefix
      setImageData(dataUrl.split(',')[1])
    }
    reader.readAsDataURL(file)
  }

  const onFileChange = (e) => handleFile(e.target.files[0])

  const onDrop = (e) => {
    e.preventDefault()
    handleFile(e.dataTransfer.files[0])
  }

  const submitAnswer = async () => {
    if (!imageData) return
    setError('')
    setUploading(true)

    try {
      await api.uploadAnswer(session_id, imageData, contentType, token)
      setUploading(false)
      setEvaluating(true)

      const result = await api.evaluateExam(session_id, token)
      navigate('/exam/results', { state: { result } })
    } catch (e) {
      setError(e.message || 'কিছু একটা ভুল হয়েছে। আবার চেষ্টা করুন।')
      setUploading(false)
      setEvaluating(false)
    }
  }

  if (uploading)  return <FullScreenLoader message="ছবি আপলোড হচ্ছে..." />
  if (evaluating) return <FullScreenLoader message="উত্তর মূল্যায়ন হচ্ছে... একটু অপেক্ষা করুন।" />

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <ProgressBar currentStep="upload" />

      <div className="flex-1 max-w-app mx-auto w-full px-4 py-5 page-enter">
        <div className="mb-5">
          <h1 className="bn text-xl font-bold text-ink mb-1">উত্তরপত্র আপলোড করুন</h1>
          <p className="bn text-sm text-ink-light">
            সব উত্তর লেখা হলে ছবি তুলুন বা ফাইল বেছে নিন
          </p>
        </div>

        {error && <ErrorMessage message={error} onRetry={() => setError('')} />}

        {/* Upload zone */}
        <div
          className={`
            relative border-2 border-dashed rounded-2xl transition-all cursor-pointer mb-5
            ${preview ? 'border-forest bg-forest-light/30' : 'border-border bg-white hover:border-saffron'}
          `}
          onClick={() => fileInputRef.current?.click()}
          onDrop={onDrop}
          onDragOver={e => e.preventDefault()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"   // opens camera on mobile
            className="hidden"
            onChange={onFileChange}
          />

          {preview ? (
            <div className="p-3">
              <img
                src={preview}
                alt="উত্তরপত্র"
                className="w-full rounded-xl object-contain max-h-80"
              />
              <p className="bn text-xs text-forest text-center mt-2 font-medium">
                ✓ ছবি নির্বাচিত হয়েছে — পরিবর্তন করতে ট্যাপ করুন
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
              <div className="text-5xl mb-3">📷</div>
              <p className="bn text-base font-medium text-ink mb-1">
                ছবি তুলুন বা আপলোড করুন
              </p>
              <p className="bn text-sm text-ink-light">
                মোবাইলে ক্যামেরা খুলবে · ডেস্কটপে ফাইল বেছে নিন
              </p>
            </div>
          )}
        </div>

        {/* Tips */}
        <div className="bg-saffron-light border border-saffron/30 rounded-xl px-4 py-3 mb-6">
          <p className="bn text-sm font-medium text-saffron-dark mb-1.5">ভালো ছবির জন্য</p>
          <ul className="bn text-xs text-ink-light space-y-0.5 list-disc list-inside">
            <li>সমতল জায়গায় খাতা রাখুন</li>
            <li>ভালো আলোতে ছবি তুলুন</li>
            <li>সব লেখা যেন ছবিতে থাকে</li>
            <li>ছবি যেন ঝাপসা না হয়</li>
          </ul>
        </div>

        {/* Submit */}
        <div className="pb-8 space-y-3">
          <button
            onClick={submitAnswer}
            disabled={!imageData}
            className="btn-success"
          >
            মূল্যায়ন করুন →
          </button>
          <button
            onClick={() => navigate(-1)}
            className="btn-secondary"
          >
            ← প্রশ্নপত্র দেখুন
          </button>
        </div>
      </div>
    </div>
  )
}

function FullScreenLoader({ message }) {
  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <ProgressBar currentStep="upload" />
      <LoadingMessage message={message} />
    </div>
  )
}
