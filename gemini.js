/* ===============================
   ZELVORA – Gemini AI Client
   Frontend-only (GitHub Pages)
   Free-tier compatible
================================ */

// 🔑 PASTE YOUR GEMINI API KEY HERE
const GEMINI_API_KEY = "PASTE_YOUR_API_KEY_HERE";

// Gemini endpoint (text-only, fast & cheap)
const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" +
  GEMINI_API_KEY;

/**
 * Ask Gemini AI
 * @param {string} prompt
 * @returns {Promise<string>}
 */
async function askZelvora(prompt) {
  if (!prompt || !prompt.trim()) {
    return "Please ask something 🙂";
  }

  try {
    const response = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }]
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error("Gemini API error");
    }

    const data = await response.json();

    return (
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No response from AI."
    );
  } catch (err) {
    console.error("Gemini error:", err);
    return "⚠️ Zelvora AI is temporarily unavailable.";
  }
}

/* Expose globally */
window.askZelvora = askZelvora;
