export const DEFAULT_GEMINI_KEY =
  (import.meta as { env?: Record<string, string> }).env?.VITE_GEMINI_API_KEY || ''

export interface GeminiModel {
  id: string
  name: string
}

export const AVAILABLE_MODELS: GeminiModel[] = [
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Fast & Intelligent)' },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Standard)' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (Deep Analytics)' },
  { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite (Lightweight)' },
]

export const SYSTEM_INSTRUCTION = `You are FedShield AI, an intelligent, friendly, and highly capable AI assistant built into the FedShield Privacy-Preserving Federated Learning Platform.

Your persona and communication style:
- Adopt a helpful, articulate, conversational style identical to ChatGPT and Google Gemini.
- Be warm, engaging, intelligent, and clear.
- Break down complex machine learning, federated training (FedAvg/FedProx), privacy budgets (ε, δ), and AES-256-GCM encryption concepts into easy-to-understand explanations.
- Use clean Markdown formatting: bold key concepts (**like this**), use clear bullet lists (- or *), code snippets, and short readable paragraphs.
- Always provide structured, insightful answers to user questions.`

interface GenerateContentArgs {
  prompt: string
  model?: string
  apiKey?: string
}

interface GeminiApiErrorBody {
  error?: { message?: string }
}

interface GeminiApiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
}

export async function generateGeminiContent({
  prompt,
  model = 'gemini-2.0-flash',
  apiKey = '',
}: GenerateContentArgs): Promise<string> {
  const keyToUse = apiKey && apiKey.trim() ? apiKey.trim() : DEFAULT_GEMINI_KEY
  if (!keyToUse) {
    return getLocalKnowledgeAnswer(prompt)
  }

  const modelsToTry = [model, 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'].filter(
    (m, idx, arr) => arr.indexOf(m) === idx
  )

  let lastErrorMsg = ''

  for (const m of modelsToTry) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${keyToUse}`
      const bodyPayload = {
        system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{ parts: [{ text: prompt }] }],
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      })

      if (!response.ok) {
        const errorData: GeminiApiErrorBody = await response.json().catch(() => ({}))
        const errMsg = errorData.error?.message || ''
        lastErrorMsg = errMsg

        if (response.status === 400 && (errMsg.includes('system_instruction') || errMsg.includes('unknown field'))) {
          const fallbackResponse = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: `${SYSTEM_INSTRUCTION}\n\nUser Question:\n${prompt}` }] }],
            }),
          })
          if (fallbackResponse.ok) {
            const fallbackData: GeminiApiResponse = await fallbackResponse.json()
            const text = fallbackData.candidates?.[0]?.content?.parts?.[0]?.text
            if (text) return text
          }
        }

        if (response.status === 403 || errMsg.includes('API_KEY_INVALID') || errMsg.includes('not valid')) {
          return `🔑 **Google AI Studio API Key Required**\n\nThe current API key is invalid or unauthorized.\n\n### How to resolve:\n1. Click the **⚙️ Settings icon** at the top right of this chat window.\n2. Paste your Google AI Studio API key (get a free key at [aistudio.google.com](https://aistudio.google.com)).\n3. Click **Done** and resend your question!\n\n---\n${getLocalKnowledgeAnswer(prompt)}`
        }

        if (response.status === 429 || errMsg.includes('quota') || errMsg.includes('RESOURCE_EXHAUSTED')) {
          return `⏳ **Gemini API Rate Limit Reached**\n\nThe default API key quota is temporarily exhausted.\n\n${getLocalKnowledgeAnswer(prompt)}`
        }

        continue
      }

      const data: GeminiApiResponse = await response.json()
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text
      if (text) return text
    } catch {
      // try next model in fallback array
    }
  }

  return getLocalKnowledgeAnswer(prompt, lastErrorMsg)
}

function getLocalKnowledgeAnswer(prompt: string, lastError = ''): string {
  const q = prompt.toLowerCase()

  if (q.includes('dataset') || q.includes('summarize dataset') || q.includes('upload')) {
    return `📊 **FedShield Datasets Summary & Management**

- **Synthetic & Domain Data**: FedShield supports generating synthetic raw datasets tailored across domains: **Medical, Financial, Cybersecurity, Telecom, Energy, and Education**.
- **Privacy at Rest**: Uploaded CSV files are processed securely server-side and assigned to user-scoped dataset slots.
- **Features & Labels**: Each dataset includes clean target labels (e.g., \`heart_disease_risk\`, \`fraud_flag\`) and domain numeric/categorical features.

*Tip: Click **Datasets** in the left sidebar to upload or generate domain synthetic datasets.*`
  }

  if (q.includes('train') || q.includes('algorithm') || q.includes('fedavg') || q.includes('fedprox') || q.includes('scaffold') || q.includes('dpsgd')) {
    return `📈 **FedShield Federated Learning Engine**

FedShield supports 6 first-principles algorithms:
1. **Centralized Baseline**: Full-batch gradient descent on combined data.
2. **FedAvg (Federated Averaging)**: Weighted averaging of client model parameters.
3. **FedProx**: Federated learning with proximal term (\`mu\`) for non-IID data heterogeneity.
4. **SCAFFOLD**: Control-variate variance reduction for client drift correction.
5. **Krum**: Byzantine-resilient aggregation filtering outlier updates.
6. **DP-SGD**: Differential privacy via per-example gradient clipping (\`clip_norm\`) & Gaussian noise injection (\`noise_multiplier\`).`
  }

  if (q.includes('predict') || q.includes('inference') || q.includes('single') || q.includes('batch')) {
    return `🎯 **Prediction & Model Inference Engine**

- **Single Case Evaluation**: Select target features, set domain values, and run instant evaluations.
- **Batch CSV Inference**: Upload a batch CSV file to score multiple rows simultaneously.
- **Model Encryption**: Predictions load trained AES-256-GCM model weights or fall back to an active baseline model.
- **Prediction History**: All inference records are logged with SHA-256 input hashes in the **Predict History** tab.`
  }

  if (q.includes('encrypt') || q.includes('privacy') || q.includes('aes') || q.includes('budget') || q.includes('epsilon')) {
    return `🔒 **FedShield Privacy & Cryptography Architecture**

- **AES-256-GCM Encryption**: All trained model weights and sensitive state are encrypted at rest using PBKDF2 key derivation (\`100,000\` iterations).
- **Differential Privacy Budget**: Tracks privacy loss (\`ε, δ\`) per communication round.
- **Zero Raw Data Exposure**: Client raw datasets remain localized without central exposure.`
  }

  return `🛡️ **FedShield AI Platform Assistant**

I am your embedded AI assistant for the FedShield Federated Privacy Platform.

### Key Features You Can Explore:
- 📊 **Datasets Tab**: Upload CSV files or generate domain-specific raw datasets.
- ⚙️ **Train Tab**: Execute federated training across 6 algorithms (FedAvg, FedProx, SCAFFOLD, Krum, DP-SGD).
- 🏆 **Model Registry**: Compare metrics (Accuracy, F1, AUC, Precision, Recall).
- 🎯 **Prediction Console**: Evaluate single or batch CSV inference outputs.
- 📜 **Predict History**: Audit past prediction records and SHA-256 signatures.

${lastError ? `*(System note: API connection note - ${lastError})*` : ''}`
}
