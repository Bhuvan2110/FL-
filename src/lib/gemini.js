export const DEFAULT_GEMINI_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env && (import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_GOOGLE_AI_KEY)) || "";

export const AVAILABLE_MODELS = [
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash (Fast & Intelligent)" },
  { id: "gemini-2.5-pro",   name: "Gemini 2.5 Pro (Deep Analytics)" },
  { id: "gemini-3.6-flash", name: "Gemini 3.6 Flash (High Throughput)" },
  { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash (Balanced)" },
  { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash (Standard)" },
  { id: "gemini-1.5-pro",   name: "Gemini 1.5 Pro (Extended Context)" },
];

export const SYSTEM_INSTRUCTION = `You are FedShield AI, an intelligent, friendly, and highly capable AI assistant built into the FedShield Privacy-Preserving Federated Learning Platform.

Your persona and communication style:
- Adopt a helpful, articulate, conversational style identical to ChatGPT and Google Gemini.
- Be warm, engaging, intelligent, and clear.
- Break down complex machine learning, federated training (FedAvg/FedProx), privacy budgets (ε, δ), and AES-256-GCM encryption concepts into easy-to-understand explanations.
- Use clean Markdown formatting: bold key concepts (**like this**), use clear bullet lists (- or *), code snippets, and short readable paragraphs.
- Always provide structured, insightful answers to user questions.`;

export async function generateGeminiContent({ prompt, model = "gemini-2.5-flash", apiKey = "" }) {
  const keyToUse = (apiKey && apiKey.trim()) ? apiKey.trim() : DEFAULT_GEMINI_KEY;
  if (!keyToUse) {
    throw new Error("No Gemini API key found. Please enter your API key in the agent settings ⚙️ above or configure VITE_GEMINI_API_KEY in .env.");
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
    // If system_instruction is rejected by an older model API endpoint, try fallback with instruction in prompt
    if (response.status === 400 && errorData.error?.message?.includes("system_instruction")) {
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
    throw new Error(errorData.error?.message || `Google AI Studio API Error (HTTP ${response.status})`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("No output generated from Google AI Studio model.");
  return text;
}

