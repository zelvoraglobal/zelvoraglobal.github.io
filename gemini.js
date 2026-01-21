// Firebase SDKs (v12.8.0)
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAI, getGenerativeModel } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-ai.js";

// 🔹 REPLACE with your real Firebase details
const firebaseConfig = {
  apiKey: "AIza-REPLACE-THIS",
  authDomain: "zelvoraglobal.firebaseapp.com",
  projectId: "zelvoraglobal",
  appId: "1:REPLACE_THIS"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Use Google AI (free tier)
const ai = getAI(app, { backend: "google-ai" });

// Gemini Model
const model = getGenerativeModel(ai, {
  model: "gemini-3-flash-preview",
  systemInstruction:
    "You are Zelvora, a world-class academic and business mentor. " +
    "Help students (Classes 5–12) and entrepreneurs with clear, practical, encouraging advice."
});

// Main function
export async function askZelvora(prompt) {
  const result = await model.generateContent(prompt);
  return result.response.text();
}

// Expose globally for index.html
window.askZelvora = askZelvora;
