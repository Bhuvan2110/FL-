import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import Dashboard from '../Dashboard'
import { mockFetch, renderWithProviders } from '../../test/test-utils'

describe('Dashboard page', () => {
  it('shows stat values once the summary loads', async () => {
    mockFetch({
      '/api/compare?summary=true': { datasets: 3, experiments: 5, best_accuracy: 0.842, latest_epsilon: 1.2 },
      '/api/experiments': { experiments: [] },
    })
    renderWithProviders(<Dashboard />)
    await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument())
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('84.2%')).toBeInTheDocument()
  })

  it('shows an empty state with a link to Train when there are no experiments', async () => {
    mockFetch({
      '/api/compare?summary=true': { datasets: 0, experiments: 0, best_accuracy: null, latest_epsilon: null },
      '/api/experiments': { experiments: [] },
    })
    renderWithProviders(<Dashboard />)
    await waitFor(() => expect(screen.getByText(/No experiments recorded yet/)).toBeInTheDocument())
    expect(screen.getByText('Run your first training job')).toBeInTheDocument()
  })

  it('renders a row per recent experiment with its status', async () => {
    mockFetch({
      '/api/compare?summary=true': { datasets: 1, experiments: 1, best_accuracy: 0.9, latest_epsilon: null },
      '/api/experiments': { experiments: [{ id: 'e1', algorithm: 'fedavg', status: 'completed', created_at: new Date().toISOString() }] },
    })
    renderWithProviders(<Dashboard />)
    await waitFor(() => expect(screen.getByText('FedAvg')).toBeInTheDocument())
    expect(screen.getByText('completed')).toBeInTheDocument()
  })
})
