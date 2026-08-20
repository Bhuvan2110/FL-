import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { signIn, signUp, signInWithGoogle } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode]     = useState('signin')
  const [email, setEmail]   = useState('')
  const [pass, setPass]     = useState('')
  const [error, setError]   = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy]     = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)

  const submit = async e => {
    e.preventDefault()
    setError(''); setNotice(''); setBusy(true)
    try {
      if (mode === 'signin') {
        await signIn(email, pass)
        navigate('/')
      } else {
        await signUp(email, pass)
        setNotice('Account created — sign in now.')
        setMode('signin')
      }
    } catch (err) {
      setError(err.message || 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const handleGoogle = async () => {
    setGoogleBusy(true)
    try { await signInWithGoogle() }
    catch (err) { setError(err.message); setGoogleBusy(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden"
         style={{backgroundImage:'linear-gradient(rgba(108,124,255,0.06) 1px,transparent 1px),linear-gradient(90deg,rgba(108,124,255,0.06) 1px,transparent 1px)',backgroundSize:'32px 32px'}}>
      <div className="absolute inset-0 pointer-events-none"
           style={{backgroundImage:'radial-gradient(ellipse 700px 400px at 50% 0%,rgba(108,124,255,0.15),transparent 60%)'}} />

      <div className="w-full max-w-md relative">
        {/* Logo */}
        <div className="flex items-center gap-2.5 justify-center mb-8">
          <div className="h-10 w-10 rounded-xl bg-signal-500/15 border border-signal-500/30 flex items-center justify-center text-signal-400 font-display font-bold text-lg">λ</div>
          <div>
            <div className="font-display font-semibold text-lg text-mist-100">FedShield</div>
            <div className="text-[10px] uppercase tracking-wider text-mist-500">Python · FastAPI · Supabase</div>
          </div>
        </div>

        <div className="panel panel-glow p-7">
          <h1 className="text-xl font-semibold mb-1">{mode === 'signin' ? 'Sign in' : 'Create account'}</h1>
          <p className="text-sm text-mist-500 mb-6">
            {mode === 'signin' ? 'Access your encrypted research workspace.' : 'All ML runs on the Python backend — your browser just renders results.'}
          </p>

          {/* Google OAuth button */}
          <button
            onClick={handleGoogle}
            disabled={googleBusy}
            className="w-full flex items-center justify-center gap-3 border border-ink-600 hover:border-ink-500 bg-ink-900 hover:bg-ink-800 rounded-xl px-4 py-2.5 text-sm font-medium transition mb-5"
          >
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
              <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"/>
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z"/>
            </svg>
            {googleBusy ? 'Redirecting...' : 'Continue with Google'}
          </button>

          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-ink-700" />
            <span className="text-xs text-mist-700">or</span>
            <div className="flex-1 h-px bg-ink-700" />
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label block mb-1.5">Email</label>
              <input className="input" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@institution.edu" />
            </div>
            <div>
              <label className="label block mb-1.5">Password</label>
              <input className="input" type="password" required minLength={6} value={pass} onChange={e => setPass(e.target.value)} placeholder="••••••••" />
            </div>

            {error  && <div className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">{error}</div>}
            {notice && <div className="text-sm text-cipher-400 bg-cipher-500/10 border border-cipher-500/20 rounded-xl px-3 py-2">{notice}</div>}

            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <div className="mt-5 text-center text-sm text-mist-500">
            {mode === 'signin'
              ? <> New here?{' '}<button onClick={() => setMode('signup')} className="text-signal-400 hover:text-signal-300">Create an account</button> </>
              : <> Already have one?{' '}<button onClick={() => setMode('signin')} className="text-signal-400 hover:text-signal-300">Sign in</button> </>
            }
          </div>
        </div>

        <p className="text-center text-xs text-mist-700 mt-6 font-mono">
          FastAPI backend · AES-256-GCM at rest · RLS-isolated · Python ML
        </p>
      </div>
    </div>
  )
}
