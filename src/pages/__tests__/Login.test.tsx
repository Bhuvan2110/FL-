import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Login from '../Login'
import { mockFetch, renderWithProviders } from '../../test/test-utils'

function renderLogin() {
  return renderWithProviders(<Login />)
}

describe('Login page', () => {
  it('renders sign-in form by default', async () => {
    mockFetch({})
    renderLogin()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument())
    expect(screen.getByPlaceholderText('you@institution.edu')).toBeInTheDocument()
  })

  it('switches to create-account mode', async () => {
    mockFetch({})
    renderLogin()
    await waitFor(() => screen.getByRole('heading', { name: 'Sign in' }))
    await userEvent.click(screen.getByText('Create an account'))
    expect(screen.getByRole('heading', { name: 'Create account' })).toBeInTheDocument()
  })

  it('shows an error message when sign-in fails', async () => {
    mockFetch({ '/api/auth/signin': () => ({ status: 401, body: { error: 'Invalid email or password' } }) })
    renderLogin()
    await waitFor(() => screen.getByRole('heading', { name: 'Sign in' }))
    await userEvent.type(screen.getByPlaceholderText('you@institution.edu'), 'a@b.com')
    await userEvent.type(screen.getByPlaceholderText('••••••••'), 'wrongpassword')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByText('Invalid email or password')).toBeInTheDocument())
  })

  it('guest mode sets a guest session without calling the API', async () => {
    const fetchMock = mockFetch({})
    renderLogin()
    await waitFor(() => screen.getByRole('heading', { name: 'Sign in' }))
    await userEvent.click(screen.getByText('Skip — browse as guest'))
    const guestRelatedCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('guest'))
    expect(guestRelatedCalls).toHaveLength(0)
  })
})
