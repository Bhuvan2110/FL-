import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '../../context/AuthContext'
import { AdminRoute, ProtectedRoute } from '../ProtectedRoute'
import { mockFetch } from '../../test/test-utils'

function renderAt(path: string, guard: 'protected' | 'admin') {
  const Guard = guard === 'protected' ? ProtectedRoute : AdminRoute
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<div>Login page</div>} />
          <Route path="/" element={<div>Dashboard home</div>} />
          <Route
            path="/secret"
            element={
              <Guard>
                <div>Secret content</div>
              </Guard>
            }
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  )
}

describe('ProtectedRoute', () => {
  it('redirects to /login when there is no session', async () => {
    mockFetch({})
    renderAt('/secret', 'protected')
    await waitFor(() => expect(screen.getByText('Login page')).toBeInTheDocument())
    expect(screen.queryByText('Secret content')).not.toBeInTheDocument()
  })

  it('renders children once a session is restored', async () => {
    localStorage.setItem('fedshield_token', 'tok')
    mockFetch({ '/api/auth/me': { user: { id: 'u1', email: 'a@b.com' }, profile: { email: 'a@b.com', role: 'user' } } })
    renderAt('/secret', 'protected')
    await waitFor(() => expect(screen.getByText('Secret content')).toBeInTheDocument())
  })
})

describe('AdminRoute', () => {
  it('redirects a non-admin user to /', async () => {
    localStorage.setItem('fedshield_token', 'tok')
    mockFetch({ '/api/auth/me': { user: { id: 'u1', email: 'a@b.com' }, profile: { email: 'a@b.com', role: 'user' } } })
    renderAt('/secret', 'admin')
    await waitFor(() => expect(screen.getByText('Dashboard home')).toBeInTheDocument())
  })

  it('renders children for an admin user', async () => {
    localStorage.setItem('fedshield_token', 'tok')
    mockFetch({ '/api/auth/me': { user: { id: 'u1', email: 'admin@b.com' }, profile: { email: 'admin@b.com', role: 'admin' } } })
    renderAt('/secret', 'admin')
    await waitFor(() => expect(screen.getByText('Secret content')).toBeInTheDocument())
  })
})
