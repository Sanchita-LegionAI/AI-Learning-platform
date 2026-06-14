// pages/LoginPage.jsx
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import ProgressBar from '../components/ProgressBar'

export default function LoginPage() {
  const [phone, setPhone]       = useState('')
  const [otp, setOtp]           = useState('')
  const [step, setStep]         = useState('phone') // phone | otp
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  // Format phone: ensure +91 prefix for India
  const formatPhone = (raw) => {
    const digits = raw.replace(/\D/g, '')
    if (digits.startsWith('91') && digits.length === 12) return `+${digits}`
    if (digits.length === 10) return `+91${digits}`
    return `+${digits}`
  }

  const sendOtp = async () => {
    setError('')
    setLoading(true)
    try {
      const formatted = formatPhone(phone)
      const { error } = await supabase.auth.signInWithOtp({ phone: formatted })
      if (error) throw error
      setStep('otp')
    } catch (e) {
      setError(e.message || 'OTP পাঠানো যায়নি। আবার চেষ্টা করুন।')
    } finally {
      setLoading(false)
    }
  }

  const verifyOtp = async () => {
    setError('')
    setLoading(true)
    try {
      const formatted = formatPhone(phone)
      const { error } = await supabase.auth.verifyOtp({
        phone: formatted,
        token: otp,
        type: 'sms',
      })
      if (error) throw error
      // Auth state change triggers redirect via AuthContext
    } catch (e) {
      setError(e.message || 'OTP ভুল হয়েছে। আবার চেষ্টা করুন।')
    } finally {
      setLoading(false)
    }
  }

  const signInWithGoogle = async () => {
    setError('')
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <ProgressBar currentStep="login" />

      <div className="flex-1 flex flex-col items-center justify-center px-4 pb-10">
        {/* Logo / header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-saffron rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-card">
            <span className="text-white text-3xl">📚</span>
          </div>
          <h1 className="bn text-2xl font-bold text-ink mb-1">পরীক্ষা টিউটর</h1>
          <p className="text-sm text-ink-light font-ui">
            পশ্চিমবঙ্গ বোর্ড · বাংলা মাধ্যম
          </p>
        </div>

        <div className="card w-full max-w-sm page-enter">
          {step === 'phone' ? (
            <>
              <h2 className="bn text-lg font-bold text-ink mb-1">লগইন করুন</h2>
              <p className="text-sm text-ink-light font-ui mb-5">
                মোবাইল নম্বর দিন — OTP আসবে
              </p>

              <label className="label">মোবাইল নম্বর</label>
              <input
                type="tel"
                inputMode="numeric"
                placeholder="10-সংখ্যার নম্বর"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendOtp()}
                className="input-field mb-4"
              />

              {error && <p className="bn text-red-500 text-sm mb-3">{error}</p>}

              <button
                onClick={sendOtp}
                disabled={loading || phone.length < 10}
                className="btn-primary mb-4"
              >
                {loading ? 'পাঠানো হচ্ছে...' : 'OTP পাঠান'}
              </button>

              <div className="relative flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-ink-light font-ui">অথবা</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <button
                onClick={signInWithGoogle}
                className="btn-secondary flex items-center justify-center gap-2"
              >
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Google দিয়ে লগইন
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setStep('phone')}
                className="text-ink-light text-sm font-ui mb-4 flex items-center gap-1 hover:text-saffron transition-colors"
              >
                ← ফিরে যান
              </button>

              <h2 className="bn text-lg font-bold text-ink mb-1">OTP দিন</h2>
              <p className="text-sm text-ink-light font-ui mb-5">
                {formatPhone(phone)} নম্বরে পাঠানো ৬-সংখ্যার কোড
              </p>

              <label className="label">OTP কোড</label>
              <input
                type="tel"
                inputMode="numeric"
                maxLength={6}
                placeholder="• • • • • •"
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                onKeyDown={e => e.key === 'Enter' && verifyOtp()}
                className="input-field mb-4 text-center text-2xl tracking-[0.4em]"
              />

              {error && <p className="bn text-red-500 text-sm mb-3">{error}</p>}

              <button
                onClick={verifyOtp}
                disabled={loading || otp.length < 6}
                className="btn-primary mb-3"
              >
                {loading ? 'যাচাই হচ্ছে...' : 'যাচাই করুন'}
              </button>

              <button
                onClick={sendOtp}
                disabled={loading}
                className="text-saffron text-sm font-ui text-center w-full hover:underline"
              >
                আবার OTP পাঠান
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
