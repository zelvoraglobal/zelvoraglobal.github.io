import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAI, getGenerativeModel } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-ai.js";

const firebaseConfig = {
  apiKey: "YOUR_ACTUAL_API_KEY", 
  authDomain: "zelvoraglobal.firebaseapp.com",
  projectId: "zelvoraglobal",
  appId: "YOUR_ACTUAL_APP_ID"
};

const app = initializeApp(firebaseConfig);
const ai = getAI(app, { backend: "google-ai" });
const model = getGenerativeModel(ai, {
  model: "gemini-3-flash-preview",
  systemInstruction: "You are Zelvora, a world-class academic and business mentor. Provide brief, practical, and professional advice."
});

export async function askZelvora(prompt) {
  try {
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error("AI Error:", error);
    throw error;
  }
}

// Crucial: Expose to the browser window for the HTML script to find it
window.askZelvora = askZelvora;
