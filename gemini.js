// gemini.js (FINAL – Jan 2026)

const API_KEY = "AIzaSyCbKvJ_JhEG0EU5Zofrq_jBlANnm7v64D0";

const ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=" +
  API_KEY;

export async function askZelvora(prompt) {
  try {
    const res = await fetch(ENDPOINT, {
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

    if (res.status === 403) {
      return "⚠️ Mentor access restricted (403). Check API key restrictions.";
    }

    if (res.status === 404) {
      return "⚠️ API endpoint not found (404).";
    }

    if (!res.ok) {
      return "⚠️ AI temporarily unavailable.";
    }

    const data = await res.json();

    return (
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "⚠️ No response from AI."
    );
  } catch (err) {
    console.error(err);
    return "⚠️ Network error.";
  }
}

window.askZelvora = askZelvora;
