import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AgentWidget from './AgentWidget'

const NAV_CORE = [
  { to: '/',         label: 'Dashboard',    icon: '📊', end: true },
  { to: '/datasets', label: 'Datasets',     icon: '📁' },
  { to: '/train',    label: 'Train',        icon: '🧪' },
  { to: '/compare',  label: 'Compare',      icon: '📈' },
  { to: '/predict',  label: 'Predict',      icon: '🔮' },
]
const NAV_OBS = [
  { to: '/runs',     label: 'Run History',  icon: '📜' },
  { to: '/monitor',  label: 'Monitor',      icon: '⚡' },
  { to: '/health',   label: 'System Health',icon: '💚' },
]
const NAV_ADMIN = [
  { to: '/audit',    label: 'Audit Log',    icon: '🔒' },
  { to: '/users',    label: 'Users',        icon: '👥' },
]

function NavItem({ to, label, icon, end, onClick }) {
  return (
    <NavLink to={to} end={end} onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition border ${
          isActive
            ? 'bg-signal-500/12 text-signal-400 border-signal-500/25'
            : 'text-mist-300 hover:text-mist-100 hover:bg-ink-800/60 border-transparent'
        }`
      }
    >
      <span className="text-base w-4 text-center opacity-80">{icon}</span>
      {label}
    </NavLink>
  )
}

export default function Layout({ children }) {
  const { profile, isAdmin, isGuest, signOut } = useAuth()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  const roleLabel = profile?.role === 'super_admin' ? 'Super Admin'
    : profile?.role === 'admin' ? 'Admin'
    : profile?.role === 'guest' ? 'Guest'
    : 'Researcher'

  const closeMobile = () => setMobileOpen(false)

  return (
    <div className="min-h-screen flex flex-col lg:flex-row relative bg-ink-950">
      {/* Mobile Top Header */}
      <header className="lg:hidden shrink-0 h-16 px-4 border-b border-ink-700/70 bg-ink-900/90 backdrop-blur-md flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-signal-500/15 border border-signal-500/30 flex items-center justify-center text-signal-400 font-display font-bold">FS</div>
          <div>
            <div className="font-display font-semibold text-mist-100 leading-tight">FedShield</div>
            <div className="text-[10px] uppercase tracking-wider text-mist-500">Python · FastAPI</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle navigation menu"
          className="p-2 rounded-xl border border-ink-600/70 bg-ink-800/60 text-mist-100 text-lg hover:border-signal-500/50 transition focus:outline-none"
        >
          {mobileOpen ? '✕' : '☰'}
        </button>
      </header>

      {/* Mobile Drawer Overlay Backdrop */}
      {mobileOpen && (
        <div
          onClick={closeMobile}
          className="lg:hidden fixed inset-0 z-40 bg-ink-950/80 backdrop-blur-sm transition-opacity"
        />
      )}

      {/* Navigation Sidebar (Desktop sticky & Mobile drawer) */}
      <aside className={`
        fixed lg:sticky top-0 left-0 bottom-0 z-50 lg:z-auto
        w-72 lg:w-64 shrink-0 border-r border-ink-700/70 bg-ink-900/95 lg:bg-ink-900/60 backdrop-blur-md flex flex-col h-full lg:h-screen
        transition-transform duration-300 ease-in-out
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Brand Header */}
        <div className="px-5 py-5 border-b border-ink-700/70 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-signal-500/15 border border-signal-500/30 flex items-center justify-center text-signal-400 font-display font-bold">FS</div>
            <div>
              <div className="font-display font-semibold text-mist-100 leading-tight">FedShield</div>
              <div className="text-[10px] uppercase tracking-wider text-mist-500">Python · FastAPI</div>
            </div>
          </div>
          <button
            type="button"
            onClick={closeMobile}
            className="lg:hidden text-mist-400 hover:text-mist-100 p-1 font-mono text-sm"
          >
            ✕
          </button>
        </div>

        {/* Nav Links */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto scrollbar-thin">
          {NAV_CORE.map(i => <NavItem key={i.to} {...i} onClick={closeMobile} />)}

          <div className="pt-4 pb-1 px-3">
            <div className="text-[10px] uppercase tracking-wider text-mist-700 font-medium">Observability</div>
          </div>
          {NAV_OBS.map(i => <NavItem key={i.to} {...i} onClick={closeMobile} />)}

          {isAdmin && <>
            <div className="pt-4 pb-1 px-3">
              <div className="text-[10px] uppercase tracking-wider text-mist-700 font-medium">Admin</div>
            </div>
            {NAV_ADMIN.map(i => <NavItem key={i.to} {...i} onClick={closeMobile} />)}
          </>}
        </nav>

        {/* User Info & Actions */}
        <div className="px-3 py-4 border-t border-ink-700/70">
          <div className="px-3 py-2 mb-1">
            <div className="text-sm text-mist-100 truncate">{profile?.email}</div>
            <div className="text-[10px] uppercase tracking-wider text-mist-500 mt-0.5">{roleLabel}</div>
          </div>
          <button
            onClick={async () => { closeMobile(); await signOut(); navigate('/login') }}
            className="w-full text-left px-3 py-2 rounded-xl text-sm text-mist-500 hover:text-mist-100 hover:bg-ink-800/60 transition"
          >{isGuest ? 'Exit guest mode' : 'Sign out'}</button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
          {children}
        </div>
      </main>

      {/* Global Google AI Agent Widget */}
      <AgentWidget />
    </div>
  )
}
