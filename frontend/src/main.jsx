// src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// React.StrictMode removed — causes double-mount which triggers
// multiple Supabase onAuthStateChange subscriptions and SIGNED_IN events
ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
