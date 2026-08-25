import { useState } from 'react'
import { api } from '../lib/api'
import { PageHeader, EncryptionBadge } from '../components/UI'

const GROUP_COLOR = {
  Infrastructure: 'border-signal-500/30 text-signal-400 bg-signal-500/10',
  Security:       'border-amber-400/30 text-amber-400 bg-amber-400/10',
  Cryptography:   'border-cipher-500/30 text-cipher-400 bg-cipher-500/10',
  'ML Core':      'border-purple-500/30 text-purple-400 bg-purple-500/10',
  Metrics:        'border-mist-700 text-mist-300',
}

export default function SystemHealth() {
  const [results,  setResults]  = useState([])
  const [running,  setRunning]  = useState(false)
  const [summary,  setSummary]  = useState(null)

  const runAll = async () => {
    setRunning(true); setResults([]); setSummary(null)
    try {
      const data = await api.health.run()
      setResults(data.results || [])
      setSummary({ passed: data.passed, failed: data.failed, total: data.total, all_pass: data.all_pass })
    } catch(e) {
      setResults([{ test_id:'error', name:'API Error', group:'Infrastructure',
        status:'fail', message: e.message, duration_ms:0 }])
    } finally {
      setRunning(false)
    }
  }

  const groups = [...new Set(results.map(r=>r.group))]

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <PageHeader
          title="System Health"
          badge="pytest-style"
          sub="11 automated checks run server-side in Python — infrastructure, security, cryptography, ML core, metrics."
        />
        <div className="flex items-center gap-3">
          <EncryptionBadge active={results.some(r=>r.test_id==='aes_roundtrip'&&r.status==='pass')} label="Crypto verified" />
          <button onClick={runAll} disabled={running} className="btn-primary">
            {running ? '⟳ Running on Python server…' : 'Run all 11 tests'}
          </button>
        </div>
      </div>

      {summary && (
        <div className="panel p-5 flex items-center gap-6">
          <div className="flex-1 h-2 rounded-full bg-ink-700 overflow-hidden flex">
            <div className="h-full bg-cipher-500 transition-all" style={{width:`${(summary.passed/summary.total)*100}%`}} />
            <div className="h-full bg-rose-500 transition-all"  style={{width:`${(summary.failed/summary.total)*100}%`}} />
          </div>
          <div className="flex gap-4 text-sm shrink-0">
            <span className="text-cipher-400">{summary.passed} passed</span>
            <span className="text-rose-400">{summary.failed} failed</span>
          </div>
          {summary.all_pass && (
            <span className="badge border-cipher-500/40 text-cipher-400 bg-cipher-500/10">&#10003; All systems nominal</span>
          )}
        </div>
      )}

      {results.length === 0 && !running && (
        <div className="panel p-10 text-center text-sm text-mist-500">
          Click "Run all 11 tests" to execute the health checks on the Python backend.
        </div>
      )}

      {groups.map(group => (
        <div key={group} className="panel p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className={`badge ${GROUP_COLOR[group]}`}>{group}</span>
            <span className="text-xs text-mist-500">
              {results.filter(r=>r.group===group&&r.status==='pass').length}/{results.filter(r=>r.group===group).length} passing
            </span>
          </div>
          <div className="space-y-2">
            {results.filter(r=>r.group===group).map(test => (
              <div key={test.test_id} className={`flex items-start gap-4 p-3.5 rounded-xl border transition ${
                test.status==='pass' ? 'border-cipher-500/20 bg-cipher-500/5' :
                test.status==='fail' ? 'border-rose-500/20 bg-rose-500/5' :
                'border-ink-700/60'
              }`}>
                <div className="mt-0.5 shrink-0 w-5 text-center">
                  {test.status==='pass' && <span className="text-cipher-400">&#10003;</span>}
                  {test.status==='fail' && <span className="text-rose-400">&#10007;</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-mist-100">{test.name}</span>
                    <span className="text-[10px] text-mist-700 font-mono">{test.duration_ms}ms</span>
                  </div>
                  {test.message && (
                    <div className={`font-mono text-xs mt-1.5 ${test.status==='pass'?'text-cipher-400':'text-rose-400'}`}>
                      {test.message}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
