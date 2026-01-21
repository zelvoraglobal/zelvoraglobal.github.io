const API_KEY = "AIzaSyDi3Vdh26eTJlunDleQMzurTAvqK2-J71c";

export async function askZelvora(prompt) {
  // 2026 Stable models: 3-flash-preview is primary, 2.5-flash is backup
  const models = ["gemini-3-flash-preview", "gemini-2.5-flash"];
  
  for (const modelName of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            // System instructions define the AI's personality
            systemInstruction: {
              parts: [{ text: "You are the Zelvora Global Mentor. Be helpful, professional, and encouraging. Focus on educational excellence and clarity." }]
            },
            contents: [{ parts: [{ text: prompt }] }]
          })
        }
      );

      const data = await res.json();

      // If the model name is not found (404), try the next model in the list
      if (res.status === 404) {
        console.warn(`Model ${modelName} not found, trying fallback...`);
        continue; 
      }

      if (!res.ok) {
        console.error("Gemini API error:", data);
        return "⚠️ The mentor is currently unavailable. Please try again in a moment.";
      }

      return data.candidates[0].content.parts[0].text;

    } catch (error) {
      console.error("Network error:", error);
    }
  }
  
  return "⚠️ Network or connection error. Please check your internet.";
}

// Connect to the HTML button globally
window.askZelvora = askZelvora;
