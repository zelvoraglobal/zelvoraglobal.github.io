// gemini.js
// ✅ FINAL STABLE VERSION – 2026 SAFE
// ✅ Works on GitHub Pages
// ✅ Public REST API only

const API_KEY = "AIzaSyDi3Vdh26eTJlunDleQMzurTAvqK2-J71c"; // 🔐 keep restricted to your domain

const ENDPOINT =
  "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=" +
  API_KEY;

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
            role: "user",
            parts: [{ text: prompt }]
          }
        ]
      })
    });

    if (!response.ok) {
      console.error("HTTP Error:", response.status);
      return "⚠️ The mentor is currently unavailable. Please try again shortly.";
    }

    const data = await response.json();

    if (!data.candidates || !data.candidates.length) {
      console.error("Empty response:", data);
      return "⚠️ No response from AI. Please retry.";
    }

    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error("Network / API Error:", error);
    return "⚠️ Network error. Please check your connection.";
  }
}

// Optional: expose globally (not required if using ES module import)
window.askZelvora = askZelvora;
