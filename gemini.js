import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAI, getGenerativeModel } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-ai.js";

const firebaseConfig = {
  apiKey: "AIza...", // REPLACE WITH YOUR KEY
  authDomain: "zelvoraglobal.firebaseapp.com",
  projectId: "zelvoraglobal",
  appId: "1:..." // REPLACE WITH YOUR ID
};

const app = initializeApp(firebaseConfig);
const ai = getAI(app, { backend: "google-ai" });
const model = getGenerativeModel(ai, {
  model: "gemini-3-flash-preview",
  systemInstruction: "You are Zelvora, a helpful mentor for Zelvora Global. Provide brief, encouraging, and expert advice for students and business owners."
});

export async function askZelvora(prompt) {
  const result = await model.generateContent(prompt);
  return result.response.text();
}

// Expose to global window
window.askZelvora = askZelvora;
