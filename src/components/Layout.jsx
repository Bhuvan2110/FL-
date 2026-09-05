import { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AgentWidget from './AgentWidget'

const NAV_ITEMS = [
  { to: '/',         label: 'Dashboard font-label-caps', icon: 'dashboard',      exact: true },
  { to: '/datasets', label: 'Datasets',      icon: 'folder_open' },
  { to: '/train',    label: 'Training Logs', icon: 'analytics' },
  { to: '/compare',  label: 'Model Registry',icon: 'redeem' },
  { to: '/predict',  label: 'Prediction',    icon: 'psychology' },
]

const NAV_ADMIN = [
  { to: '/audit',    label: 'Audit Trail',   icon: 'gavel' },
  { to: '/users',    label: 'Users',         icon: 'group' },
]

export default function Layout({ children }) {
  const { profile, isAdmin, isGuest, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  // Global Keyboard Shortcut: Pressing '1' navigates to Dashboard ('/')
  useEffect(() => {
    const handleKeyDown = (e) => {
      const activeTag = document.activeElement?.tagName?.toLowerCase()
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select' || document.activeElement?.isContentEditable) {
        return
      }
      if (e.key === '1') {
        e.preventDefault()
        navigate('/')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navigate])

  const roleLabel = profile?.role === 'super_admin' ? 'Root Admin'
    : profile?.role === 'admin' ? 'Admin'
    : profile?.role === 'guest' ? 'Guest User'
    : 'Lead Researcher'

  const closeSidebarMobile = () => {
    if (window.innerWidth < 1024) {
      setSidebarOpen(false)
    }
  }

  return (
    <div className="flex h-screen overflow-hidden selection:bg-primary selection:text-on-primary bg-background font-body text-on-surface">
      {/* SideNavBar (Collapsible on Desktop & Mobile via Triple Bar ☰ Menu Icon) */}
      <nav className={`
        fixed lg:sticky top-0 left-0 bottom-0 z-40 lg:z-20
        flex-col h-screen gap-2 bg-surface-container-lowest border-r border-outline-variant shrink-0
        transition-all duration-300 ease-in-out
        ${sidebarOpen
          ? 'flex w-64 p-4 translate-x-0 opacity-100'
          : 'hidden w-0 p-0 -translate-x-full opacity-0 border-none overflow-hidden'}
      `}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-6 px-2">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title="Toggle Sidebar Menu"
            className="w-10 h-10 rounded-full bg-surface-variant flex items-center justify-center border border-outline-variant shrink-0 text-primary hover:bg-primary/20 hover:text-primary transition-all cursor-pointer active:scale-95"
          >
            <span className="material-symbols-outlined text-[24px]">menu</span>
          </button>
          <div className="min-w-0">
            <h2 className="text-primary font-bold text-lg font-headline-lg-mobile leading-tight truncate">
              {roleLabel}
            </h2>
            <p className="font-body-sm text-body-sm text-encryption-gold flex items-center gap-1 text-xs">
              <span className="material-symbols-outlined text-[14px]">lock</span> AES-256 Active
            </p>
          </div>
        </div>

        {/* Main Nav */}
        <div className="flex flex-col gap-1 flex-1 overflow-y-auto scrollbar-thin">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              onClick={closeSidebarMobile}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg transition-all font-label-caps text-label-caps ${
                  isActive
                    ? 'bg-primary-container text-on-primary-container font-bold shadow-[0_0_12px_rgba(96,236,168,0.15)]'
                    : 'text-on-surface-variant hover:bg-surface-variant/30 hover:text-on-surface scale-95 hover:scale-100'
                }`
              }
            >
              <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
              <span>{item.label.replace(' font-label-caps', '')}</span>
            </NavLink>
          ))}

          {isAdmin && (
            <>
              <div className="pt-3 pb-1 px-3">
                <div className="font-label-caps text-[10px] uppercase tracking-wider text-outline">Administration</div>
              </div>
              {NAV_ADMIN.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={closeSidebarMobile}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-lg transition-all font-label-caps text-label-caps ${
                      isActive
                        ? 'bg-primary-container text-on-primary-container font-bold shadow-[0_0_12px_rgba(96,236,168,0.15)]'
                        : 'text-on-surface-variant hover:bg-surface-variant/30 hover:text-on-surface scale-95 hover:scale-100'
                    }`
                  }
                >
                  <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </>
          )}
        </div>

        {/* CTA */}
        <button
          onClick={() => { closeSidebarMobile(); navigate('/train') }}
          className="w-full bg-primary text-deep-navy font-label-caps text-label-caps py-3 rounded hover:bg-primary-fixed transition-colors font-bold mt-2 shadow-[0_0_15px_rgba(96,236,168,0.2)] flex items-center justify-center gap-2 cursor-pointer active:scale-95"
        >
          <span className="material-symbols-outlined text-[18px]">play_arrow</span>
          Initialize Round
        </button>

        {/* Footer Nav & User Profile */}
        <div className="flex flex-col gap-1 mt-2 pt-3 border-t border-outline-variant">
          <div className="px-3 py-1 mb-1">
            <div className="text-xs text-on-surface truncate font-code-sm">{profile?.email}</div>
          </div>
          <button
            onClick={async () => { closeSidebarMobile(); await signOut(); navigate('/login') }}
            className="flex items-center gap-2 px-3 py-1.5 text-on-surface-variant hover:bg-surface-variant/30 hover:text-alert-red rounded-lg font-body-sm text-xs transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">logout</span>
            {isGuest ? 'Exit Guest Mode' : 'Sign Out'}
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative z-10 bg-background">
        {/* TopNavBar */}
        <header className="bg-surface-dim border-b border-outline-variant w-full flex-shrink-0 z-30">
          <div className="flex justify-between items-center w-full px-4 lg:px-margin-lg h-16 max-w-container-max mx-auto">
            {/* Sidebar toggle ("three lines" ☰ hamburger menu - shown only when sidebar is closed) & Brand */}
            <div className="flex items-center gap-3">
              {!sidebarOpen && (
                <button
                  onClick={() => setSidebarOpen(true)}
                  title="Open Sidebar Menu"
                  className="p-2 text-on-surface-variant hover:text-primary rounded cursor-pointer transition-colors"
                >
                  <span className="material-symbols-outlined text-[24px]">menu</span>
                </button>
              )}
              <span
                className="font-headline-lg text-lg lg:text-headline-lg font-black text-primary tracking-tighter cursor-pointer"
                onClick={() => navigate('/')}
              >
                FEDERATED_CORE_OS
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-4">
              {/* Search Bar */}
              <div className="hidden lg:flex items-center bg-surface-container-high rounded border border-outline-variant px-3 py-1.5 focus-within:border-primary focus-within:shadow-[0_0_0_2px_rgba(96,236,168,0.2)] transition-all">
                <span className="material-symbols-outlined text-on-surface-variant text-[18px] mr-2">search</span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search registry..."
                  className="bg-transparent border-none text-body-sm text-on-surface focus:outline-none p-0 w-48 placeholder-on-surface-variant font-code-sm text-xs"
                />
              </div>
              <div className="flex items-center gap-1 sm:gap-2">
                <button title="Run History" onClick={() => navigate('/runs')} className="p-2 text-on-surface-variant hover:text-primary hover:bg-surface-variant/20 rounded transition-all">
                  <span className="material-symbols-outlined text-[20px]">history</span>
                </button>
                <button title="System Monitor" onClick={() => navigate('/monitor')} className="p-2 text-on-surface-variant hover:text-primary hover:bg-surface-variant/20 rounded transition-all">
                  <span className="material-symbols-outlined text-[20px]">monitoring</span>
                </button>
                <button title="System Health" onClick={() => navigate('/health')} className="p-2 text-on-surface-variant hover:text-primary hover:bg-surface-variant/20 rounded transition-all">
                  <span className="material-symbols-outlined text-[20px]">settings</span>
                </button>
              </div>
              <button
                onClick={() => navigate('/train')}
                className="bg-primary/10 text-primary border border-primary hover:bg-primary hover:text-deep-navy font-label-caps text-label-caps px-4 py-2 rounded transition-all cursor-pointer active:opacity-80 font-bold"
              >
                Deploy Node
              </button>
            </div>
          </div>
        </header>

        {/* Scrollable Dashboard Content */}
        <main className="flex-1 overflow-y-auto p-gutter-md lg:p-margin-lg">
          <div className="max-w-container-max mx-auto space-y-6">
            {children}
          </div>
        </main>
      </div>

      {/* Global Google AI Agent Widget */}
      <AgentWidget />
    </div>
  )
}

