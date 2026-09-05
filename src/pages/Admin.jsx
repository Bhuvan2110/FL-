import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { PageHeader } from '../components/UI'

export function Audit() {
  const [logs,    setLogs]    = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  useEffect(() => {
    api.admin.audit(200)
      .then(d => setLogs(d.logs || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const exportAuditCsv = () => {
    if (!logs.length) return
    const headers = ["id", "action", "resource", "detail", "user_id", "created_at"]
    const csvRows = [headers.join(",")]
    logs.forEach(l => {
      const detailStr = l.detail ? `"${JSON.stringify(l.detail).replace(/"/g, '""')}"` : '""'
      csvRows.push([l.id, l.action, l.resource || '', detailStr, l.user_id || '', l.created_at].join(","))
    })
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `fedshield_audit_log_${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Audit Log" sub="Immutable insert-only event trail — all security-relevant actions across the platform.">
        <button
          onClick={exportAuditCsv}
          disabled={logs.length === 0}
          className="px-3 py-1.5 rounded-lg border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 text-xs font-mono font-semibold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[16px]">download</span>
          Export Audit Log (CSV)
        </button>
      </PageHeader>

      {error && <div className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">{error}</div>}

      <div className="panel p-6">
        {loading ? (
          <div className="text-sm text-mist-500">Loading…</div>
        ) : logs.length === 0 ? (
          <div className="text-sm text-mist-500 text-center py-8">No events yet.</div>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="whitespace-nowrap">Action</th>
                  <th className="whitespace-nowrap">Resource</th>
                  <th className="whitespace-nowrap">Detail</th>
                  <th className="whitespace-nowrap">User</th>
                  <th className="whitespace-nowrap">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(l => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap">
                      <span className="badge border-signal-500/30 text-signal-400">{l.action}</span>
                    </td>
                    <td className="font-mono text-xs whitespace-nowrap">{l.resource || '—'}</td>
                    <td className="font-mono text-xs text-mist-500 max-w-[200px] truncate">
                      {l.detail ? JSON.stringify(l.detail) : '—'}
                    </td>
                    <td className="font-mono text-xs text-mist-500 whitespace-nowrap">{l.user_id?.slice(0,10)}…</td>
                    <td className="text-mist-500 text-xs whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export function Users() {
  const [users,   setUsers]   = useState([])
  const [stats,   setStats]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [updating,setUpdating]= useState('')

  const load = () => {
    setLoading(true)
    Promise.all([api.admin.users(), api.admin.stats()])
      .then(([u, s]) => { setUsers(u.users||[]); setStats(s) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const changeRole = async (uid, role) => {
    setUpdating(uid)
    try { await api.admin.updateRole(uid, role); load() }
    catch(e) { setError(e.message) }
    finally { setUpdating('') }
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Users" sub="Manage researcher roles across the platform." />

      {error && <div className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">{error}</div>}

      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label:'Total users',       value: stats.total_users },
            { label:'Total datasets',    value: stats.total_datasets },
            { label:'Total experiments', value: stats.total_experiments },
            { label:'Total predictions', value: stats.total_predictions },
          ].map(s => (
            <div key={s.label} className="panel p-4">
              <div className="label mb-1">{s.label}</div>
              <div className="font-display text-2xl font-semibold text-signal-400">{s.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="panel p-6">
        <h2 className="text-base font-semibold mb-4">All users</h2>
        {loading ? (
          <div className="text-sm text-mist-500">Loading…</div>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="whitespace-nowrap">Email</th>
                  <th className="whitespace-nowrap">Role</th>
                  <th className="whitespace-nowrap">Joined</th>
                  <th className="whitespace-nowrap">Change role</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td className="font-mono text-xs whitespace-nowrap">{u.email}</td>
                    <td className="whitespace-nowrap">
                      <span className={`badge ${
                        u.role==='super_admin' ? 'border-signal-500/40 text-signal-400' :
                        u.role==='admin'       ? 'border-amber-400/30 text-amber-400' :
                        'border-mist-700 text-mist-500'
                      }`}>{u.role}</span>
                    </td>
                    <td className="text-mist-500 text-xs whitespace-nowrap">{new Date(u.created_at).toLocaleDateString()}</td>
                    <td className="whitespace-nowrap">
                      <select
                        disabled={updating === u.id}
                        value={u.role}
                        onChange={e => changeRole(u.id, e.target.value)}
                        className="input text-xs py-1 px-2 font-mono border-ink-600 bg-ink-900"
                      >
                        <option value="researcher">researcher</option>
                        <option value="admin">admin</option>
                        <option value="super_admin">super_admin</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

