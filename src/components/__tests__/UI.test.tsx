import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AlgoBadge, ErrorBox, EncryptionBadge, GuestNotice, StatCard } from '../UI'

describe('StatCard', () => {
  it('renders label, value, and optional sub text', () => {
    render(<StatCard label="Datasets" value={7} sub="uploaded or synthetic" />)
    expect(screen.getByText('Datasets')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('uploaded or synthetic')).toBeInTheDocument()
  })

  it('omits the sub line when not provided', () => {
    render(<StatCard label="Experiments" value={3} />)
    expect(screen.queryByText(/uploaded/)).not.toBeInTheDocument()
  })
})

describe('EncryptionBadge', () => {
  it('shows the active label by default', () => {
    render(<EncryptionBadge />)
    expect(screen.getByText('AES-256-GCM Active')).toBeInTheDocument()
  })

  it('shows the inactive state when active=false', () => {
    render(<EncryptionBadge active={false} />)
    expect(screen.getByText('Not Encrypted')).toBeInTheDocument()
  })
})

describe('ErrorBox', () => {
  it('renders nothing when no message is given', () => {
    const { container } = render(<ErrorBox />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the message and applies className to the icon', () => {
    render(<ErrorBox message="Dataset not found" />)
    expect(screen.getByText('Dataset not found')).toBeInTheDocument()
    const icon = document.querySelector('.material-symbols-outlined')
    expect(icon).not.toBeNull()
    expect(icon).toHaveClass('material-symbols-outlined')
  })
})

describe('GuestNotice', () => {
  it('mentions the given feature name', () => {
    render(<GuestNotice feature="predictions" />)
    expect(screen.getByText(/predictions/)).toBeInTheDocument()
  })
})

describe('AlgoBadge', () => {
  it('renders the human label for a known algorithm', () => {
    render(<AlgoBadge algo="fedavg" />)
    expect(screen.getByText('FedAvg')).toBeInTheDocument()
  })

  it('falls back to the raw string for an unknown algorithm', () => {
    render(<AlgoBadge algo="mystery-algo" />)
    expect(screen.getByText('mystery-algo')).toBeInTheDocument()
  })
})
