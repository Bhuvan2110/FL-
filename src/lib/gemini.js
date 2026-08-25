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

export async function generateGeminiContent({ prompt, model = "gemini-2.5-flash", apiKey = DEFAULT_GEMINI_KEY }) {
  const keyToUse = apiKey || DEFAULT_GEMINI_KEY;
  if (!keyToUse) {
    throw new Error("No Gemini API key found. Please configure VITE_GEMINI_API_KEY in your .env file or enter key in settings.");
  }
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${keyToUse}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ]
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Google AI Studio API Error (HTTP ${response.status})`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("No output generated from Google AI Studio model.");
  return text;
}
