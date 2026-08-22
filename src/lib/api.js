/**
 * FedShield API client — all calls go to Vercel Python serverless functions at /api/*
 * No separate backend URL needed — same domain as the frontend.
 */

const BASE = ""   // same origin — Vercel serves /api/* from Python functions

// Retry configuration for transient failures
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000

function getToken() {
  return localStorage.getItem("fedshield_token") || ""
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function request(path, options = {}) {
  const token = getToken()
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  }

  let lastError
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`, { ...options, headers })
      
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        const errorMsg = err.error || err.detail || `HTTP ${res.status}`
        
        // Retry on 5xx errors or network issues
        if (res.status >= 500 && attempt < MAX_RETRIES) {
          console.warn(`API request failed (attempt ${attempt}/${MAX_RETRIES}): ${errorMsg}`)
          await delay(RETRY_DELAY_MS * attempt)
          continue
        }
        
        throw new Error(errorMsg)
      }
      
      if (res.status === 204) return null
      return res.json()
    } catch (error) {
      lastError = error
      // Retry on network errors
      if (attempt < MAX_RETRIES && error.message.includes('fetch')) {
        console.warn(`Network error (attempt ${attempt}/${MAX_RETRIES}): ${error.message}`)
        await delay(RETRY_DELAY_MS * attempt)
        continue
      }
      throw error
    }
  }
  
  throw lastError || new Error('Request failed after retries')
}

export const api = {
  auth: {
    signUp:        (email, password) => request("/api/auth/signup",   { method: "POST", body: JSON.stringify({ email, password }) }),
    signIn:        (email, password) => request("/api/auth/signin",   { method: "POST", body: JSON.stringify({ email, password }) }),
    signOut:       ()                => request("/api/auth/signout",  { method: "POST" }),
    me:            ()                => request("/api/auth/me"),
    googleUrl:     ()                => request("/api/auth/google"),
  },

  datasets: {
    list:     ()     => request("/api/datasets/index"),
    generate: (opts) => request("/api/datasets/synthetic", { method: "POST", body: JSON.stringify(opts) }),
    upload:   (file) => {
      const token = getToken()
      const form  = new FormData()
      form.append("file", file)
      return fetch("/api/datasets/upload", {
        method:  "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "x-filename": file.name,
        },
        body: file,
      }).then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(new Error(e.error || "Upload failed"))))
    },
    delete: (id) => request(`/api/datasets/delete?id=${id}`, { method: "DELETE" }),
  },

  train: {
    run:         (body) => request("/api/train",          { method: "POST", body: JSON.stringify(body) }),
    experiments: ()     => request("/api/experiments"),
    rounds:      (id)   => request(`/api/experiments?rounds=${id}`),
  },

  predict: {
    single: (body)  => request("/api/predict", { method: "POST", body: JSON.stringify({ ...body, mode: "single" }) }),
    batch:  (body)  => request("/api/predict", { method: "POST", body: JSON.stringify({ ...body, mode: "batch" }) }),
    experiments: () => request("/api/experiments"),
  },

  compare: {
    all:     (adminView = false) => request(`/api/compare${adminView ? "?admin_view=true" : ""}`),
    rounds:  (id)                => request(`/api/compare?rounds=${id}`),
    summary: ()                  => request("/api/compare?summary=true"),
  },

  admin: {
    audit:      (limit = 100) => request(`/api/admin?action=audit&limit=${limit}`),
    users:      ()            => request("/api/admin?action=users"),
    updateRole: (uid, role)   => request("/api/admin?action=role", {
      method: "PATCH",
      body:   JSON.stringify({ user_id: uid, role }),
    }),
    stats: () => request("/api/admin?action=stats"),
  },

  health: {
    run:  () => request("/api/health"),
    ping: () => request("/api/health?ping=true"),
  },
}

export function saveToken(token) { localStorage.setItem("fedshield_token", token) }
export function clearToken()     { localStorage.removeItem("fedshield_token") }
export function hasToken()       { return !!localStorage.getItem("fedshield_token") }
