const API_KEY = "AIzaSyCbKvJ_JhEG0EU5Zofrq_jBlANnm7v64D0";

export async function askZelvora(prompt) {
  try {
    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" +
      API_KEY;

    const response = await fetch(url, {
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

    if (!response.ok) {
      console.error("Gemini API error:", data);

      if (response.status === 403) {
        return "⚠️ API key blocked or quota exhausted.";
      }

      if (response.status === 404) {
        return "⚠️ Model endpoint unavailable. Please refresh and retry.";
      }

      return "⚠️ Mentor is temporarily unavailable.";
    }

    return data.candidates[0].content.parts[0].text;

  } catch (error) {
    console.error("Network error:", error);
    return "⚠️ Network error. Please try again.";
  }
}

window.askZelvora = askZelvora;
