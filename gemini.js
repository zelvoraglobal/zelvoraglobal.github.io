const API_KEY = "AIzaSyDi3Vdh26eTJlunDleQMzurTAvqK2-J71c";

export async function askZelvora(prompt) {
  try {
    const res = await fetch(
      // Updated to Gemini 3 Flash
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=" + API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );

    const data = await res.json();

    if (res.status === 403) {
      console.error("403 Error: Please check if 'Generative Language API' is enabled in Cloud Console.");
      return "⚠️ Mentor access restricted. (Error 403)";
    }

    if (!res.ok) return "⚠️ Connection issue.";

    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    return "⚠️ Network error.";
  }
}

window.askZelvora = askZelvora;
