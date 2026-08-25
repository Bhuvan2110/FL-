import { useState, useRef, useEffect } from 'react'
import { api } from '../lib/api'
import { generateGeminiContent, AVAILABLE_MODELS, DEFAULT_GEMINI_KEY } from '../lib/gemini'

export default function AgentWidget() {
  const [open, setOpen]               = useState(false)
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [model, setModel]             = useState('gemini-2.5-flash')
  const [apiKey, setApiKey]           = useState(DEFAULT_GEMINI_KEY)
  const [messages, setMessages]       = useState([
    {
      id: 'init',
      role: 'agent',
      text: 'Greetings! I am your FedShield AI Intelligence Agent powered by Google AI Studio. I can summarize datasets, analyze federated model training results, or explain project architecture. How may I assist you today?'
    }
  ])
  const [input, setInput]             = useState('')
  const [busy, setBusy]               = useState(false)
  const scrollRef                     = useRef(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, busy, open, showModelPicker])

  const sendQuery = async (promptText) => {
    const query = (promptText || input).trim()
    if (!query || busy) return

    const userMsg = { id: `u-${Date.now()}`, role: 'user', text: query }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setBusy(true)

    try {
      const response = await generateGeminiContent({ prompt: query, model, apiKey })
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
        setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'agent', text: 'No datasets uploaded yet in the Datasets phase.' }])
        setBusy(false)
        return
      }
      const summaryPrompt = `Analyze and provide an executive summary for the following uploaded datasets in our FedShield Privacy Platform: ${JSON.stringify(dsList)}. Highlight total sample sizes, feature column structures, target columns, and dataset types.`
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
        setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'agent', text: 'No trained models found yet. Run a federated training job in the Train tab first.' }])
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
        <div className="w-[420px] h-[580px] rounded-2xl border border-amber-500/40 bg-ink-950/95 backdrop-blur-xl shadow-2xl flex flex-col overflow-hidden">
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
                <span className="text-[10px] font-mono text-mist-400">
                  {activeModelName.split(' ')[0]} {activeModelName.split(' ')[1]}
                </span>
              </div>
            </div>

            {/* Top Right Header Controls: Small Settings Gear Icon to toggle model selection + Close button */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowModelPicker(!showModelPicker)}
                title="Select AI Model"
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

          {/* Hidden Model Selector Popup (Revealed when small gear icon ⚙️ is clicked) */}
          {showModelPicker && (
            <div className="px-4 py-3 border-b border-amber-500/30 bg-ink-900/90 space-y-2 text-xs">
              <div className="flex items-center justify-between text-[11px] font-mono text-amber-300">
                <span>Select Google AI Studio Model:</span>
                <span className="text-[10px] text-mist-500">API Key via .env</span>
              </div>
              <select
                value={model}
                onChange={e => {
                  setModel(e.target.value)
                  setShowModelPicker(false)
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
                  className={`max-w-[82%] rounded-xl p-3 text-xs leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-amber-500/15 border border-amber-500/40 text-mist-100 rounded-br-none font-mono'
                      : 'bg-ink-900 border border-line text-mist-200 rounded-bl-none'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{m.text}</div>
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start items-center gap-2">
                <div className="w-6 h-6 rounded-md overflow-hidden border border-amber-400/60 shrink-0">
                  <img src="/tiger_avatar.jpg" alt="FedShield" className="w-full h-full object-cover" />
                </div>
                <div className="px-3.5 py-2 rounded-xl bg-ink-900 border border-line text-xs text-amber-300/80 animate-pulse">
                  FedShield Agent querying Google AI Studio...
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
                className="px-2 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-[10.5px] font-mono text-amber-300 hover:bg-amber-500/20"
              >
                📊 Summarize Datasets
              </button>
              <button
                type="button"
                onClick={summarizeTrainingResults}
                disabled={busy}
                className="px-2 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-[10.5px] font-mono text-amber-300 hover:bg-amber-500/20"
              >
                📈 Summarize Training
              </button>
              <button
                type="button"
                onClick={projectInfo}
                disabled={busy}
                className="px-2 py-0.5 rounded border border-line text-[10.5px] font-mono text-mist-400 hover:text-mist-100"
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
                placeholder="Ask FedShield AI Agent about project, datasets..."
                className="input flex-1 text-xs py-2 px-3 font-mono"
              />
              <button
                type="button"
                onClick={() => sendQuery()}
                disabled={!input.trim() || busy}
                className="btn-primary text-xs py-2 px-3 shrink-0 bg-amber-500 hover:bg-amber-400 text-ink-950 font-semibold"
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
