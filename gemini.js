// gemini.js — WORKS on GitHub Pages

const GEMINI_API_KEY = "PASTE_YOUR_GEMINI_API_KEY_HERE"; // from https://aistudio.google.com/app/apikey
const MODEL = "gemini-1.5-flash";

export async function askZelvora(prompt) {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }]
            }
          ],
          systemInstruction: {
            parts: [
              {
                text:
                  "You are Zelvora, a professional academic and business mentor. Give clear, practical advice for students (classes 5–12) and entrepreneurs."
              }
            ]
          }
        })
      }
    );

    const data = await response.json();

    if (!data.candidates) {
      console.error(data);
      return "⚠️ No response from AI. Check API key or quota.";
    }

    return data.candidates[0].content.parts[0].text;
  } catch (err) {
    console.error("Gemini error:", err);
    return "⚠️ AI connection failed. Please try again.";
  }
}

// expose globally (important)
window.askZelvora = askZelvora;
