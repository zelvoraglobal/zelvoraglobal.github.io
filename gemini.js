// Import the latest Firebase AI Logic SDK (v12.8.0)
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAI, getGenerativeModel } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-ai.js";

// Your Firebase Configuration (Keep these updated from your Firebase Console)
const firebaseConfig = {
  apiKey: "AIza...", // 🔹 Replace with your actual API Key
  authDomain: "zelvoraglobal.firebaseapp.com",
  projectId: "zelvoraglobal",
  storageBucket: "zelvoraglobal.firebasestorage.app",
  messagingSenderId: "...", 
  appId: "1:..." // 🔹 Replace with your actual App ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize the AI Service using Google AI as the backend
const ai = getAI(app, { backend: "google-ai" });

// Configure the model with the Zelvora Mentor Persona
const model = getGenerativeModel(ai, {
  model: "gemini-3-flash-preview",
  systemInstruction: "You are Zelvora, a world-class academic and business mentor. Provide clear, encouraging, and practical advice for students (Classes 5-12) and entrepreneurs. Keep responses helpful and professional."
});

/**
 * Sends a message to the AI and returns the text response.
 * @param {string} prompt - The user's question.
 */
export async function askZelvora(prompt) {
  try {
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error("Zelvora AI Error:", error);
    throw error;
  }
}

// ✅ IMPORTANT: Expose to the global window object so index.html can find it
window.askZelvora = askZelvora;
