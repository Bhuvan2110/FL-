import { describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { AuthProvider, useAuth } from '../AuthContext'
import { mockFetch } from '../../test/test-utils'

function wrapper({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter>
      <AuthProvider>{children}</AuthProvider>
    </MemoryRouter>
  )
}

describe('AuthContext', () => {
  it('starts with session=null when no token is stored', async () => {
    mockFetch({})
    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.session).toBeNull())
    expect(result.current.user).toBeNull()
  })

  it('restores a session from a stored token via /api/auth/me', async () => {
    localStorage.setItem('fedshield_token', 'existing-token')
    mockFetch({ '/api/auth/me': { user: { id: 'u1', email: 'a@b.com' }, profile: { email: 'a@b.com', role: 'user' } } })
    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.user?.email).toBe('a@b.com'))
    expect(result.current.profile?.role).toBe('user')
  })

  it('clears the token and session if /api/auth/me rejects it', async () => {
    localStorage.setItem('fedshield_token', 'stale-token')
    mockFetch({ '/api/auth/me': () => ({ status: 401, body: { error: 'Invalid or expired token' } }) })
    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.session).toBeNull())
    expect(localStorage.getItem('fedshield_token')).toBeNull()
  })

  it('signIn stores the token and populates session/profile', async () => {
    mockFetch({ '/api/auth/signin': { access_token: 'new-token', token_type: 'bearer', user: { id: 'u2', email: 'signed-in@b.com' }, profile: { email: 'signed-in@b.com', role: 'admin' } } })
    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.session).toBeNull())
    await act(async () => {
      await result.current.signIn('signed-in@b.com', 'password123')
    })
    expect(result.current.user?.email).toBe('signed-in@b.com')
    expect(result.current.isAdmin).toBe(true)
    expect(localStorage.getItem('fedshield_token')).toBe('new-token')
  })

  it('continueAsGuest sets a guest session without hitting the API', async () => {
    mockFetch({})
    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.session).toBeNull())
    act(() => {
      result.current.continueAsGuest()
    })
    expect(result.current.isGuest).toBe(true)
    expect(result.current.session?.user.id).toBe('guest')
    expect(result.current.isAdmin).toBe(false)
  })

  it('signOut clears session, profile, and token', async () => {
    mockFetch({
      '/api/auth/signin': { access_token: 'tok', token_type: 'bearer', user: { id: 'u3', email: 'x@y.com' }, profile: { email: 'x@y.com', role: 'user' } },
      '/api/auth/signout': { message: 'Signed out successfully' },
    })
    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.session).toBeNull())
    await act(async () => {
      await result.current.signIn('x@y.com', 'password123')
    })
    expect(result.current.session).not.toBeNull()
    await act(async () => {
      await result.current.signOut()
    })
    expect(result.current.session).toBeNull()
    expect(result.current.profile).toBeNull()
    expect(localStorage.getItem('fedshield_token')).toBeNull()
  })

  it('useAuth throws when used outside AuthProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useAuth())).toThrow('useAuth must be within AuthProvider')
    spy.mockRestore()
  })
})
