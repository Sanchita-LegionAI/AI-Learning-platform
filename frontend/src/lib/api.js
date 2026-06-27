// lib/api.js
// All calls to the FastAPI backend

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function request(path, options = {}, token = null) {
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res  = await fetch(`${BASE}${path}`, { ...options, headers })
  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    const msg = data?.detail?.message_bn || data?.detail || `HTTP ${res.status}`
    const err = new Error(msg)
    err.status = res.status
    err.detail = data?.detail
    throw err
  }
  return data
}

export const api = {
  // ── Auth ────────────────────────────────────────────────────────────────────
  verifyToken: (token) =>
    request('/api/auth/verify', { method: 'POST' }, token),

  // ── Curriculum ───────────────────────────────────────────────────────────────
  getCurriculum: (token) =>
    request('/api/curriculum', {}, token),

  // ── Exam flow ────────────────────────────────────────────────────────────────

  // Step 1: generate exam (returns part1_questions + part2_questions)
  generateExam: (chapterId, token, configId = null) =>
    request('/api/exam/generate', {
      method: 'POST',
      body: JSON.stringify({ chapter_id: chapterId, config_id: configId }),
    }, token),

  // Step 2: submit Part 1 answers — instant server-side evaluation, no LLM
  submitPart1: (sessionId, answers, token) =>
    request('/api/exam/submit-part1', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId, answers }),
    }, token),

  // Step 2b: SKIP Part 2 — deducts 1 mark, completes session immediately
  skipPart2: (sessionId, token) =>
    request('/api/exam/skip-part2', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId }),
    }, token),

  // Step 3: upload Part 2 answer sheet photo to R2
  uploadAnswer: (sessionId, imageBase64, contentType, token) =>
    request('/api/exam/upload-answer', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId, image_base64: imageBase64, content_type: contentType }),
    }, token),

  // Step 4a: OCR — Gemini reads slot-by-slot (1-3 words per slot)
  runOcr: (sessionId, token) =>
    request('/api/exam/ocr', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId }),
    }, token),

  // Step 4b: student confirms (or edits) OCR results
  submitOcrAnswers: (sessionId, confirmedAnswers, token) =>
    request('/api/exam/submit-ocr-answers', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId, confirmed_answers: confirmedAnswers }),
    }, token),

  // Step 5: LLM evaluates Part 2 short-write answers
  evaluatePart2: (sessionId, token) =>
    request('/api/exam/evaluate-part2', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId }),
    }, token),

  // ── AI Evaluation ─────────────────────────────────────────────────────────
  // Request a new AI evaluation (once per day)
  requestAiEvaluation: (token) =>
    request('/api/exam/ai-evaluation', { method: 'POST', body: '{}' }, token),

  // Get all saved AI evaluations for this user
  getAiEvaluations: (token) =>
    request('/api/exam/ai-evaluations', {}, token),

  // ── Session management ────────────────────────────────────────────────────────
  getSession: (sessionId, token) =>
    request(`/api/exam/session/${sessionId}`, {}, token),

  getMySessions: (token) =>
    request('/api/exam/my-sessions', {}, token),

  deleteSession: (sessionId, token) =>
    request(`/api/exam/session/${sessionId}`, { method: 'DELETE' }, token),

  // ── Admin ─────────────────────────────────────────────────────────────────────
  getAdminConfig: (token) =>
    request('/api/admin/config', {}, token),

  updateProvider: (purpose, providerName, modelName, token) =>
    request('/api/admin/config', {
      method: 'POST',
      body: JSON.stringify({ purpose, provider_name: providerName, model_name: modelName }),
    }, token),

  getUsageSummary: (token) =>
    request('/api/admin/usage-summary', {}, token),

  getUsageLogs: (token, params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request(`/api/admin/usage-logs${qs ? '?' + qs : ''}`, {}, token)
  },

  clearLogs: (token) =>
    request('/api/admin/logs', { method: 'DELETE' }, token),

  getAdminChapters: (token) =>
    request('/api/admin/chapters', {}, token),

  getChapterStats: (token) =>
    request('/api/admin/chapter-stats', {}, token),

  triggerImport: (token) =>
    request('/api/admin/questions/import', { method: 'POST' }, token),

  getExamConfigs: (token) =>
    request('/api/admin/exam-config', {}, token),

  activateExamConfig: (configId, token) =>
    request(`/api/admin/exam-config/${configId}/activate`, { method: 'PATCH' }, token),

  getAdminExamLogs: (token, params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request(`/api/admin/exam-logs${qs ? '?' + qs : ''}`, {}, token)
  },

  deleteAdminExam: (sessionId, token) =>
    request(`/api/admin/exam/${sessionId}`, { method: 'DELETE' }, token),
}
