import { Component } from 'react'
import { useNavigate } from 'react-router-dom'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
    // Could log to monitoring service here
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || <DefaultError />
    }
    return this.props.children
  }
}

function DefaultError() {
  const navigate = useNavigate()
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-ink-900">
      <div className="max-w-md text-center p-8">
        <div className="text-6xl mb-4">⚠️</div>
        <h1 className="text-2xl font-bold text-mist-100 mb-2">Something went wrong</h1>
        <p className="text-mist-400 mb-6">
          We encountered an unexpected error. Please try refreshing the page.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-3 bg-signal-500 hover:bg-signal-600 text-white rounded-xl font-medium transition"
        >
          Refresh Page
        </button>
        <button
          onClick={() => navigate('/')}
          className="ml-3 px-6 py-3 bg-ink-700 hover:bg-ink-600 text-mist-100 rounded-xl font-medium transition"
        >
          Go Home
        </button>
      </div>
    </div>
  )
}

export default ErrorBoundary
