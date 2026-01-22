const API_KEY = "AIzaSyCbKvJ_JhEG0EU5Zofrq_jBlANnm7v64D0";

export async function askZelvora(prompt) {
  try {
    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" +
      API_KEY;

    const res = await fetch(url, {
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

    const data = await res.json();

    if (res.status === 403) {
      return "⚠️ API key restricted. Check HTTP referrer settings.";
    }

    if (res.status === 404) {
      return "⚠️ Model not available on this endpoint.";
    }

    if (!res.ok) {
      console.error("Gemini API error:", data);
      return "⚠️ Mentor temporarily unavailable.";
    }

    return data.candidates?.[0]?.content?.parts?.[0]?.text
      || "⚠️ No response from mentor.";

  } catch (err) {
    console.error("Network error:", err);
    return "⚠️ Network error.";
  }
}

window.askZelvora = askZelvora;
