/**
 * FedShield API client — calls FastAPI backend & serverless endpoints
 */

const BASE = ""

function getToken() {
  return localStorage.getItem("fedshield_token") || ""
}

async function request(path, options = {}) {
  const token = getToken()
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  }
  const res = await fetch(`${BASE}${path}`, { ...options, headers })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText || `HTTP ${res.status}` }))
    throw new Error(err.error || err.detail || `HTTP ${res.status}`)
  }
  if (res.status === 204) return null

  const contentType = res.headers.get("content-type") || ""
  if (!contentType.includes("application/json")) {
    throw new Error(`API route "${path}" is unavailable.`)
  }
  return res.json().catch(() => {
    throw new Error(`API route "${path}" returned an invalid response.`)
  })
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
      return fetch("/api/datasets/upload", {
        method:  "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "x-filename": file.name,
        },
        body: file,
      }).then(async r => {
        const contentType = r.headers.get("content-type") || ""
        if (!r.ok) {
          const err = await r.json().catch(() => ({ error: r.statusText || `HTTP ${r.status}` }))
          throw new Error(err.error || err.detail || `Upload failed (${r.status})`)
        }
        if (!contentType.includes("application/json")) {
          throw new Error("Upload API returned a non-JSON response.")
        }
        return r.json().catch(() => { throw new Error("Upload API returned an invalid response.") })
      })
    },
    delete: (id) => request(`/api/datasets/delete?id=${id}`, { method: "DELETE" }),
  },

  train: {
    run:         (body) => request("/api/train",          { method: "POST", body: JSON.stringify(body) }),
    experiments: ()     => request("/api/experiments"),
    rounds:      (id)   => request(`/api/experiments?rounds=${id}`),
    delete:      (id)   => request(`/api/experiments?delete=${id}`, { method: "DELETE" }),
  },

  predict: {
    single: (body)  => request("/api/predict", { method: "POST", body: JSON.stringify({ ...body, mode: "single" }) }),
    batch:  (body)  => request("/api/predict", { method: "POST", body: JSON.stringify({ ...body, mode: "batch" }) }),
    experiments: () => request("/api/experiments"),
    delete:      (id) => request(`/api/experiments?delete=${id}`, { method: "DELETE" }),
  },

  compare: {
    all:     (adminView = false) => request(`/api/compare${adminView ? "?admin_view=true" : ""}`),
    rounds:  (id)                => request(`/api/compare?rounds=${id}`),
    summary: ()                  => request("/api/compare?summary=true"),
    delete:  (id)                => request(`/api/compare?delete=${id}`, { method: "DELETE" }),
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
