import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAI, getGenerativeModel } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-ai.js";

// Even for the free version, Firebase needs the project ID to host the site
const firebaseConfig = {
  apiKey: "AIza...", // 🔹 GET YOUR FREE KEY FROM: https://aistudio.google.com/app/apikey
  projectId: "zelvoraglobal",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);

// 🔹 CRITICAL: This 'google-ai' setting targets the Free Tier
const ai = getAI(app, { backend: "google-ai" });

const model = getGenerativeModel(ai, {
  model: "gemini-3-flash-preview",
  systemInstruction: "You are Zelvora, a free-to-use mentor. Be concise and professional."
});

export async function askZelvora(prompt) {
  try {
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error("AI Error:", error);
    // If you see 'Billing' errors here, it means the API key is tied to a Cloud project instead of AI Studio
    return "The mentor is resting. Please try again in a moment.";
  }
}

window.askZelvora = askZelvora;
