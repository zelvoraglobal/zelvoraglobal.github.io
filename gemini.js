// gemini.js — FINAL WORKING VERSION FOR GITHUB PAGES

const API_KEY = "AIzaSyDpueYhA7kc3ciwCet51GJv3_qBf4GtEAo"; // <-- REQUIRED
const ENDPOINT =
  `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

export async function askZelvora(prompt) {
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ]
      })
    });

    const data = await response.json();

    if (!data.candidates || !data.candidates.length) {
      console.error("Gemini API response:", data);
      return "⚠️ No response from AI. Check API key or quota.";
    }

    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error("Gemini fetch error:", error);
    return "⚠️ Zelvora AI is temporarily unavailable.";
  }
}
