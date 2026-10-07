import type { ReactElement, ReactNode } from 'react'
import { render, type RenderOptions } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { AuthProvider } from '../context/AuthContext'

function AllProviders({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter>
      <AuthProvider>{children}</AuthProvider>
    </MemoryRouter>
  )
}

export function renderWithProviders(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, { wrapper: AllProviders, ...options })
}

type Handler = object | ((url: string, init?: RequestInit) => object | { status: number; body: object })

export function mockFetch(handlers: Record<string, Handler>) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const key = Object.keys(handlers).find((k) => url.includes(k))
    if (!key) {
      return new Response(JSON.stringify({ error: `No mock handler for ${url}` }), { status: 404 })
    }
    const handler = handlers[key]
    const result = typeof handler === 'function' ? handler(url, init) : handler
    const status = 'status' in result && 'body' in result ? (result as { status: number }).status : 200
    const body = 'status' in result && 'body' in result ? (result as { body: object }).body : result
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

export * from '@testing-library/react'
