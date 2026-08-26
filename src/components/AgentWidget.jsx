import { useState, useRef, useEffect } from 'react'
import { api } from '../lib/api'
import { generateGeminiContent, AVAILABLE_MODELS, DEFAULT_GEMINI_KEY } from '../lib/gemini'

function parseBold(str) {
  const parts = str.split(/(\*\*.*?\*\*|`.*?`)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-mist-100">{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="px-1 py-0.5 rounded bg-ink-800 text-amber-300 font-mono text-[11px] border border-ink-700">{part.slice(1, -1)}</code>
    }
    return part
  })
}

function FormattedMessage({ text }) {
  if (!text) return null
  const lines = text.split('\n')
  return (
    <div className="space-y-1.5 leading-relaxed text-xs">
      {lines.map((line, idx) => {
        if (!line.trim()) return <div key={idx} className="h-1" />

        if (line.startsWith('### ')) {
          return <h4 key={idx} className="font-semibold text-amber-300 text-[12.5px] mt-1 mb-0.5">{parseBold(line.slice(4))}</h4>
        }
        if (line.startsWith('## ')) {
          return <h3 key={idx} className="font-bold text-amber-300 text-xs mt-1.5 mb-0.5">{parseBold(line.slice(3))}</h3>
        }
        if (line.startsWith('# ')) {
          return <h2 key={idx} className="font-bold text-amber-400 text-xs mt-2 mb-1">{parseBold(line.slice(2))}</h2>
        }

        if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
          const content = line.trim().slice(2)
          return (
            <div key={idx} className="flex items-start gap-1.5 pl-1">
              <span className="text-amber-400 font-bold select-none">•</span>
              <div className="flex-1">{parseBold(content)}</div>
            </div>
          )
        }

        const numMatch = line.trim().match(/^(\d+)\.\s+(.*)/)
        if (numMatch) {
          return (
            <div key={idx} className="flex items-start gap-1.5 pl-1">
              <span className="text-amber-400 font-bold select-none">{numMatch[1]}.</span>
              <div className="flex-1">{parseBold(numMatch[2])}</div>
            </div>
          )
        }

        return <div key={idx}>{parseBold(line)}</div>
      })}
    </div>
  )
}

export default function AgentWidget() {
  const [open, setOpen]                       = useState(false)
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [model, setModel]                     = useState('gemini-3.6-flash')
  const [customApiKey, setCustomApiKey]       = useState(() => localStorage.getItem('fedshield_custom_api_key') || '')
  const [messages, setMessages]               = useState([
    {
      id: 'init',
      role: 'agent',
      text: "Hello! 👋 I'm your FedShield AI Assistant—powered by Google Gemini. I can help you analyze federated training runs, summarize datasets, inspect privacy budgets, or explain how FedShield protects your raw data. What would you like to explore today?"
    }
  ])
  const [input, setInput]                     = useState('')
  const [busy, setBusy]                       = useState(false)
  const scrollRef                             = useRef(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, busy, open, showModelPicker])

  const handleKeyChange = (val) => {
    setCustomApiKey(val)
    if (val.trim()) {
      localStorage.setItem('fedshield_custom_api_key', val.trim())
    } else {
      localStorage.removeItem('fedshield_custom_api_key')
    }
  }

  const sendQuery = async (promptText) => {
    const query = (promptText || input).trim()
    if (!query || busy) return

    const userMsg = { id: `u-${Date.now()}`, role: 'user', text: query }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setBusy(true)

    try {
      const response = await generateGeminiContent({ prompt: query, model, apiKey: customApiKey })
      setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'agent', text: response }])
    } catch (err) {
      setMessages(prev => [...prev, { id: `e-${Date.now()}`, role: 'agent', text: `AI Studio Error: ${err.message}` }])
    } finally {
      setBusy(false)
    }
  }

  // Quick Actions
  const summarizeDatasets = async () => {
    setBusy(true)
    try {
      const dData = await api.datasets.list().catch(() => ({ datasets: [] }))
      const dsList = dData.datasets || []
      if (dsList.length === 0) {
        setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'agent', text: 'No datasets uploaded yet. Upload a CSV dataset in the **Datasets** tab to get started!' }])
        setBusy(false)
        return
      }
      const summaryPrompt = `Analyze and provide a friendly executive summary for the following uploaded datasets in our FedShield Privacy Platform: ${JSON.stringify(dsList)}. Highlight total sample sizes, feature column structures, target columns, and dataset types.`
      sendQuery(summaryPrompt)
    } catch (e) {
      setMessages(prev => [...prev, { id: `e-${Date.now()}`, role: 'agent', text: `Error fetching datasets: ${e.message}` }])
      setBusy(false)
    }
  }

  const summarizeTrainingResults = async () => {
    setBusy(true)
    try {
      const eData = await api.predict.experiments().catch(() => ({ experiments: [] }))
      const exps = eData.experiments || []
      if (exps.length === 0) {
        setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'agent', text: 'No trained models found yet. Run a federated training job in the **Train** tab first!' }])
        setBusy(false)
        return
      }
      const summaryPrompt = `Provide a comprehensive performance summary for our trained federated learning models: ${JSON.stringify(exps)}. Summarize model algorithms used (FedAvg, FedProx), training rounds, differential privacy settings, and predictive accuracy performance.`
      sendQuery(summaryPrompt)
    } catch (e) {
      setMessages(prev => [...prev, { id: `e-${Date.now()}`, role: 'agent', text: `Error fetching training results: ${e.message}` }])
      setBusy(false)
    }
  }

  const projectInfo = () => {
    sendQuery("Give me a high-level overview of this FedShield project. Explain how privacy-preserving federated learning works, how client raw data stays local, how model weights are aggregated on the Python FastAPI backend with AES-256-GCM encryption, and how dataset inferences are evaluated.")
  }

  const activeModelName = AVAILABLE_MODELS.find(m => m.id === model)?.name || model
  const isUsingCustomKey = Boolean(customApiKey.trim())

  return (
    <div className="fixed bottom-5 right-5 z-50 font-sans">
      {!open ? (
        /* Floating Button Trigger featuring the uploaded Tiger Avatar with gold rim */
        <button
          onClick={() => setOpen(true)}
          className="group relative flex items-center gap-3 p-2 pr-4 rounded-2xl bg-ink-950/90 border border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.3)] hover:border-amber-400 hover:shadow-[0_0_30px_rgba(245,158,11,0.5)] transition-all cursor-pointer"
        >
          <div className="relative w-11 h-11 rounded-xl overflow-hidden border border-amber-400/80 shadow-md shrink-0">
            <img src="/tiger_avatar.jpg" alt="FedShield AI Agent" className="w-full h-full object-cover" />
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-amber-400 border-2 border-ink-950 rounded-full animate-pulse" />
          </div>
          <div className="text-left">
            <div className="font-display font-bold text-xs text-amber-300 flex items-center gap-1">
              FedShield AI Agent
            </div>
            <div className="text-[10px] font-mono text-mist-400">Google AI Studio</div>
          </div>
        </button>
      ) : (
        /* Expanded Modal Chat Window */
        <div className="w-[440px] h-[600px] rounded-2xl border border-amber-500/40 bg-ink-950/95 backdrop-blur-xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header with Tiger Avatar */}
          <div className="px-4 py-3 border-b border-line bg-ink-900/90 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl overflow-hidden border border-amber-400/80 shadow-md shrink-0">
                <img src="/tiger_avatar.jpg" alt="FedShield AI Agent" className="w-full h-full object-cover" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                  FedShield AI Agent
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                </h3>
                <span className="text-[10px] font-mono text-mist-400 flex items-center gap-1">
                  {activeModelName.split(' ')[0]} {activeModelName.split(' ')[1]}
                  {isUsingCustomKey ? (
                    <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">Key: Custom</span>
                  ) : (
                    <span className="text-[9px] px-1 py-0.2 rounded bg-ink-800 text-mist-400 border border-line">Key: Default</span>
                  )}
                </span>
              </div>
            </div>

            {/* Header Controls: Settings Gear Icon + Close button */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowModelPicker(!showModelPicker)}
                title="Configure Model & API Key"
                className={`p-1.5 rounded-lg border text-xs transition-colors ${
                  showModelPicker
                    ? 'border-amber-400/80 bg-amber-500/20 text-amber-300'
                    : 'border-line text-mist-400 hover:text-mist-100 hover:border-mist-700'
                }`}
              >
                ⚙️
              </button>
              <button
                type="button"
                onClick={() => { setOpen(false); setShowModelPicker(false) }}
                className="text-mist-400 hover:text-mist-100 p-1 text-sm font-mono"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Model & API Key Configuration Settings Panel */}
          {showModelPicker && (
            <div className="px-4 py-3 border-b border-amber-500/30 bg-ink-900/95 space-y-3 text-xs">
              {/* API Key Configuration Section */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-amber-300 font-semibold">API Key Configuration:</span>
                  {isUsingCustomKey ? (
                    <button
                      type="button"
                      onClick={() => handleKeyChange('')}
                      className="text-[10px] text-amber-400 hover:underline"
                    >
                      Use Default (.env)
                    </button>
                  ) : (
                    <span className="text-[10px] text-cipher-400">⚡ Using System Default (.env)</span>
                  )}
                </div>

                <input
                  type="password"
                  value={customApiKey}
                  onChange={e => handleKeyChange(e.target.value)}
                  placeholder="Enter custom Gemini API Key (or leave blank to use default)"
                  className="input w-full text-xs py-1.5 px-2.5 font-mono bg-ink-950 border-amber-500/40 text-mist-100"
                />

                <p className="text-[10px] text-mist-500 font-mono leading-tight">
                  {isUsingCustomKey
                    ? '🔑 Custom API Key active. To revert to the system default key, clear this field.'
                    : '⚡ Default API key from .env is active. Enter your own API key above to override.'
                  }
                </p>
              </div>

              {/* Model Selector Dropdown */}
              <div className="space-y-1">
                <div className="text-[11px] font-mono text-amber-300 font-semibold">
                  Select Google AI Model:
                </div>
                <select
                  value={model}
                  onChange={e => {
                    setModel(e.target.value)
                  }}
                  className="input w-full text-xs py-1.5 px-2 font-mono bg-ink-950 border-amber-500/40 text-mist-100 cursor-pointer"
                >
                  {AVAILABLE_MODELS.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowModelPicker(false)}
                  className="px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-mono hover:bg-amber-500/30"
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {/* Messages Container */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-ink-950/40">
            {messages.map(m => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'agent' && (
                  <div className="w-6 h-6 rounded-md overflow-hidden border border-amber-400/60 shrink-0 mr-2 mt-0.5">
                    <img src="/tiger_avatar.jpg" alt="FedShield" className="w-full h-full object-cover" />
                  </div>
                )}
                <div
                  className={`max-w-[84%] rounded-xl p-3 text-xs leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-amber-500/15 border border-amber-500/40 text-mist-100 rounded-br-none font-mono'
                      : 'bg-ink-900 border border-line text-mist-200 rounded-bl-none'
                  }`}
                >
                  {m.role === 'agent' ? <FormattedMessage text={m.text} /> : <div className="whitespace-pre-wrap">{m.text}</div>}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start items-center gap-2">
                <div className="w-6 h-6 rounded-md overflow-hidden border border-amber-400/60 shrink-0">
                  <img src="/tiger_avatar.jpg" alt="FedShield" className="w-full h-full object-cover" />
                </div>
                <div className="px-3.5 py-2 rounded-xl bg-ink-900 border border-line text-xs text-amber-300/80 animate-pulse">
                  FedShield Agent thinking...
                </div>
              </div>
            )}
          </div>

          {/* Quick Action Chips & Input Box */}
          <div className="p-3 border-t border-line bg-ink-900/80 space-y-2">
            {/* Action Chips */}
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={summarizeDatasets}
                disabled={busy}
                className="px-2 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-[10.5px] font-mono text-amber-300 hover:bg-amber-500/20 cursor-pointer"
              >
                📊 Summarize Datasets
              </button>
              <button
                type="button"
                onClick={summarizeTrainingResults}
                disabled={busy}
                className="px-2 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-[10.5px] font-mono text-amber-300 hover:bg-amber-500/20 cursor-pointer"
              >
                📈 Summarize Training
              </button>
              <button
                type="button"
                onClick={projectInfo}
                disabled={busy}
                className="px-2 py-0.5 rounded border border-line text-[10.5px] font-mono text-mist-400 hover:text-mist-100 cursor-pointer"
              >
                🛡️ Project Info
              </button>
            </div>

            {/* Prompt Input Form */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendQuery()}
                placeholder="Ask FedShield AI Agent..."
                className="input flex-1 text-xs py-2 px-3 font-mono"
              />
              <button
                type="button"
                onClick={() => sendQuery()}
                disabled={!input.trim() || busy}
                className="btn-primary text-xs py-2 px-3 shrink-0 bg-amber-500 hover:bg-amber-400 text-ink-950 font-semibold cursor-pointer"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
