// pages/UploadPage.jsx
// After upload: calls /ocr → navigates to OcrReviewPage for student to verify answers

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

  const [preview,     setPreview]     = useState(null)
  const [imageData,   setImageData]   = useState(null)
  const [contentType, setContentType] = useState('image/jpeg')
  const [uploading,   setUploading]   = useState(false)
  const [analysing,   setAnalysing]   = useState(false)
  const [error,       setError]       = useState('')
  const [showQuestions, setShowQuestions] = useState(true)

  if (!state?.session_id) {
    navigate('/exam/select')
    return null
  }

  const { session_id, examData } = state
  const questions = examData?.generated_questions || []

  const handleFile = (file) => {
    if (!file) return
    setContentType(file.type || 'image/jpeg')
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target.result
      setPreview(dataUrl)
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

    // Step 1: Upload image to R2
    setUploading(true)
    try {
      await api.uploadAnswer(session_id, imageData, contentType, token)
    } catch (e) {
      setError(e.message || 'ছবি আপলোড করা যায়নি। আবার চেষ্টা করুন।')
      setUploading(false)
      return
    }
    setUploading(false)

    // Step 2: Run OCR (Gemini reads the image)
    setAnalysing(true)
    try {
      const ocrData = await api.runOcr(session_id, token)
      navigate('/exam/ocr-review', {
        state: {
          session_id,
          examData,
          ocr_results: ocrData.ocr_results,
        }
      })
    } catch (e) {
      setError(e.message || 'ছবি বিশ্লেষণ করা যায়নি। আবার চেষ্টা করুন।')
      setAnalysing(false)
    }
  }

  if (uploading)  return <FullScreenLoader step="upload"  message="ছবি আপলোড হচ্ছে..." />
  if (analysing)  return <FullScreenLoader step="analyse" message="উত্তর বিশ্লেষণ করা হচ্ছে..." subMessage="Gemini AI আপনার হাতের লেখা পড়ছে" />

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <ProgressBar currentStep="upload" />

      <div className="flex-1 max-w-app mx-auto w-full px-4 py-5 page-enter space-y-4">
        <div>
          <h1 className="bn text-xl font-bold text-ink mb-1">উত্তরপত্র আপলোড করুন</h1>
          <p className="bn text-sm text-ink-light">সব উত্তর লেখা হলে ছবি তুলুন বা ফাইল বেছে নিন</p>
        </div>

        {error && <ErrorMessage message={error} onRetry={() => setError('')} />}

        {/* Question reference */}
        {questions.length > 0 && (
          <div className="card">
            <button
              onClick={() => setShowQuestions(!showQuestions)}
              className="w-full flex items-center justify-between"
            >
              <p className="bn text-sm font-semibold text-ink">
                প্রশ্নপত্র ({questions.length}টি প্রশ্ন)
              </p>
              <span className="text-ink-light text-xs font-ui">
                {showQuestions ? '▲ লুকান' : '▼ দেখুন'}
              </span>
            </button>
            {showQuestions && (
              <div className="mt-3 space-y-3">
                {questions.map((q, i) => (
                  <div key={i} className="flex gap-3 bg-cream rounded-xl px-3 py-2.5">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-saffron text-white text-xs font-bold font-ui flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    <div className="flex-1">
                      <p className="bn text-sm text-ink leading-relaxed">{q.question}</p>
                      <span className="inline-block mt-1 text-xs font-ui text-saffron-dark bg-saffron-light px-2 py-0.5 rounded-full">
                        {q.marks} নম্বর
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Upload zone */}
        <div
          className={`relative border-2 border-dashed rounded-2xl transition-all cursor-pointer
            ${preview ? 'border-forest bg-forest-light/30' : 'border-border bg-white hover:border-saffron'}`}
          onClick={() => fileInputRef.current?.click()}
          onDrop={onDrop}
          onDragOver={e => e.preventDefault()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={onFileChange}
          />
          {preview ? (
            <div className="p-3">
              <img src={preview} alt="উত্তরপত্র" className="w-full rounded-xl object-contain max-h-80" />
              <p className="bn text-xs text-forest text-center mt-2 font-medium">
                ✓ ছবি নির্বাচিত — পরিবর্তন করতে ট্যাপ করুন
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
              <div className="text-5xl mb-3">📷</div>
              <p className="bn text-base font-medium text-ink mb-1">ছবি তুলুন বা আপলোড করুন</p>
              <p className="bn text-sm text-ink-light">মোবাইলে ক্যামেরা খুলবে · ডেস্কটপে ফাইল বেছে নিন</p>
            </div>
          )}
        </div>

        {/* Tips */}
        <div className="bg-saffron-light border border-saffron/30 rounded-xl px-4 py-3">
          <p className="bn text-sm font-medium text-saffron-dark mb-1.5">ভালো ছবির জন্য</p>
          <ul className="bn text-xs text-ink-light space-y-0.5 list-disc list-inside">
            <li>সমতল জায়গায় খাতা রাখুন</li>
            <li>ভালো আলোতে ছবি তুলুন</li>
            <li>সব লেখা যেন ছবিতে থাকে</li>
            <li>ছবি যেন ঝাপসা না হয়</li>
          </ul>
        </div>

        <div className="pb-8 space-y-3">
          <button onClick={submitAnswer} disabled={!imageData} className="btn-success">
            মূল্যায়নের জন্য জমা দিন →
          </button>
          <button onClick={() => navigate(-1)} className="btn-secondary">
            ← প্রশ্নপত্র দেখুন
          </button>
        </div>
      </div>
    </div>
  )
}

function FullScreenLoader({ message, subMessage }) {
  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <ProgressBar currentStep="upload" />
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="flex gap-2 mb-4">
          <span className="w-3 h-3 rounded-full bg-saffron animate-bounce" style={{animationDelay:'0ms'}} />
          <span className="w-3 h-3 rounded-full bg-saffron animate-bounce" style={{animationDelay:'150ms'}} />
          <span className="w-3 h-3 rounded-full bg-saffron animate-bounce" style={{animationDelay:'300ms'}} />
        </div>
        <p className="bn text-base font-medium text-ink mb-1">{message}</p>
        {subMessage && <p className="text-xs font-ui text-ink-light">{subMessage}</p>}
      </div>
    </div>
  )
}
