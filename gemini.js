const API_KEY = "AIzaSyCbKvJ_JhEG0EU5Zofrq_jBlANnm7v64D0";

export async function askZelvora(prompt) {
  try {
    // 1. Use the stable "gemini-1.5-flash" model to avoid 404 errors
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );

    const data = await response.json();

    // 2. Catch the 403 Error (Permission Denied)
    if (response.status === 403) {
      console.error("403 Forbidden: Key is valid but blocked. Check 'Website Restrictions'.");
      return "⚠️ Access denied. Please add your website to the Google Cloud key settings.";
    }

    if (!response.ok) {
      console.error("API Error:", data);
      return "⚠️ The mentor is resting. Try again later.";
    }

    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error("Network Error:", error);
    return "⚠️ Connection failed.";
  }
}

window.askZelvora = askZelvora;
