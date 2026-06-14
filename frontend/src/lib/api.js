// lib/api.js
// All calls to the FastAPI backend

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function request(path, options = {}, token = null) {
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, { ...options, headers })
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
  // Auth
  verifyToken: (token) =>
    request('/api/auth/verify', { method: 'POST' }, token),

  // Curriculum
  getCurriculum: (token) =>
    request('/api/curriculum', {}, token),

  getChapters: (bookId, token) =>
    request(`/api/chapters/${bookId}`, {}, token),

  // Exam flow
  generateExam: (chapterId, token, configId = null) =>
    request('/api/exam/generate', {
      method: 'POST',
      body: JSON.stringify({ chapter_id: chapterId, config_id: configId }),
    }, token),

  uploadAnswer: (sessionId, imageBase64, contentType, token) =>
    request('/api/exam/upload-answer', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId, image_base64: imageBase64, content_type: contentType }),
    }, token),

  evaluateExam: (sessionId, token) =>
    request('/api/exam/evaluate', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId }),
    }, token),

  getSession: (sessionId, token) =>
    request(`/api/exam/session/${sessionId}`, {}, token),

  // Admin
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
}
