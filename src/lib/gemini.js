export const DEFAULT_GEMINI_KEY = "";


export const AVAILABLE_MODELS = [
  { id: "gemini-2.0-flash",      name: "Gemini 2.0 Flash (Fast & Intelligent)" },
  { id: "gemini-1.5-flash",      name: "Gemini 1.5 Flash (Standard)" },
  { id: "gemini-1.5-pro",        name: "Gemini 1.5 Pro (Deep Analytics)" },
  { id: "gemini-2.0-flash-lite", name: "Gemini 2.0 Flash Lite (Lightweight)" },
];

export const SYSTEM_INSTRUCTION = `You are FedShield AI, an intelligent, friendly, and highly capable AI assistant built into the FedShield Privacy-Preserving Federated Learning Platform.

Your persona and communication style:
- Adopt a helpful, articulate, conversational style identical to ChatGPT and Google Gemini.
- Be warm, engaging, intelligent, and clear.
- Break down complex machine learning, federated training (FedAvg/FedProx), privacy budgets (ε, δ), and AES-256-GCM encryption concepts into easy-to-understand explanations.
- Use clean Markdown formatting: bold key concepts (**like this**), use clear bullet lists (- or *), code snippets, and short readable paragraphs.
- Always provide structured, insightful answers to user questions.`;

export async function generateGeminiContent({ prompt, model = "gemini-2.0-flash", apiKey = "" }) {
  const keyToUse = (apiKey && apiKey.trim()) ? apiKey.trim() : DEFAULT_GEMINI_KEY;
  if (!keyToUse) {
    throw new Error("No Gemini API key provided. Click the ⚙️ settings icon in the top right of this chat window to enter your Google AI Studio API key.");

  }
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${keyToUse}`;

  const bodyPayload = {
    system_instruction: {
      parts: [{ text: SYSTEM_INSTRUCTION }]
    },
    contents: [
      {
        parts: [{ text: prompt }]
      }
    ]
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyPayload)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errMsg = errorData.error?.message || "";

    // If system_instruction is rejected by model, try fallback with system instruction in prompt
    if (response.status === 400 && errMsg.includes("system_instruction")) {
      const fallbackResponse = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: `${SYSTEM_INSTRUCTION}\n\nUser Question:\n${prompt}` }]
            }
          ]
        })
      });
      if (!fallbackResponse.ok) {
        const fallbackError = await fallbackResponse.json().catch(() => ({}));
        throw new Error(fallbackError.error?.message || `Google AI Studio API Error (HTTP ${fallbackResponse.status})`);
      }
      const fallbackData = await fallbackResponse.json();
      const text = fallbackData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("No output generated from Google AI Studio model.");
      return text;
    }

    if (response.status === 403 || errMsg.includes("denied access") || errMsg.includes("API_KEY_INVALID") || errMsg.includes("not valid")) {
      throw new Error("🔑 Invalid or unauthorized Gemini API key. Please click the ⚙️ settings icon above to enter your Google AI Studio API key.");

    }

    if (response.status === 429 || errMsg.includes("quota") || errMsg.includes("RESOURCE_EXHAUSTED")) {
      throw new Error("⏳ Gemini API rate limit / quota exceeded. Please retry in a few moments or enter your own API key in ⚙️ settings.");
    }

    throw new Error(errMsg || `Google AI Studio API Error (HTTP ${response.status})`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("No output generated from Google AI Studio model.");
  return text;
}

