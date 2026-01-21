// Replace this with your actual key from Google AI Studio
const API_KEY = "AIzaSyCbKvJ_JhEG0EU5Zofrq_jBlANnm7v64D0";

export async function askZelvora(prompt) {
  // 2026 Stable Models: 3-flash is the primary, 2.5-flash is the backup
  const models = ["gemini-3-flash", "gemini-2.5-flash"];
  
  for (const modelName of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        }
      );

      const data = await res.json();

      // If this specific model is not found (404), try the next one in the list
      if (res.status === 404) {
        console.warn(`Model ${modelName} not found, trying backup...`);
        continue; 
      }

      if (!res.ok) {
        console.error("Gemini API error:", data);
        return "⚠️ AI is calibrating. Please try again in a moment.";
      }

      // Success! Return the AI text
      return data.candidates[0].content.parts[0].text;

    } catch (error) {
      console.error("Network error:", error);
    }
  }
  
  return "⚠️ Connection error. Please check your internet.";
}

// Make the function available to your HTML button
window.askZelvora = askZelvora;
