const API_KEY = "AIzaSyDi3Vdh26eTJlunDleQMzurTAvqK2-J71c";

export async function askZelvora(prompt) {
  try {
    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + API_KEY,
      {
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
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error("Gemini error:", err);
      return "⚠️ AI temporarily unavailable. Please try again.";
    }

    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text
      || "⚠️ No response from AI.";

  } catch (e) {
    console.error("Network error:", e);
    return "⚠️ Network error. Please try again.";
  }
}

window.askZelvora = askZelvora;
