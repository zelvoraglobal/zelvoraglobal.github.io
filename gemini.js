const API_KEY = "AIzaSyCbKvJ_JhEG0EU5Zofrq_jBlANnm7v64D0";

export async function askZelvora(prompt) {
  try {
    const url =
      "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=" +
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

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API error:", errText);

      if (response.status === 403) {
        return "⚠️ API key blocked. Check restrictions or use AI Studio key.";
      }

      return "⚠️ The mentor is resting. Try again shortly.";
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;

  } catch (error) {
    console.error("Network error:", error);
    return "⚠️ Network error. Please try again.";
  }
}

// expose globally for your button
window.askZelvora = askZelvora;
