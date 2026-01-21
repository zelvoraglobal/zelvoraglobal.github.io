// Using the stable 2026 Firebase & AI logic distribution
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAI, getGenerativeModel } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-ai.js";

// 🔹 REPLACED: Use your actual credentials here
const firebaseConfig = {
  apiKey: "AIzaSy...", 
  authDomain: "zelvoraglobal.firebaseapp.com",
  projectId: "zelvoraglobal",
  storageBucket: "zelvoraglobal.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "1:YOUR_APP_ID"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize the AI Service (Google AI Backend)
const ai = getAI(app, { backend: "google-ai" });

// Configure the specific Gemini 3 model
const model = getGenerativeModel(ai, {
  model: "gemini-3-flash-preview",
  systemInstruction: "You are Zelvora, a world-class academic and business mentor for Zelvora Global. Provide brief, practical, and highly professional advice. Focus on tuition for classes 5-12 and startup mentoring."
});

/**
 * The main function to talk to the AI.
 * We attach it to 'window' so index.html can call it directly.
 */
export async function askZelvora(prompt) {
  try {
    const result = await model.generateContent(prompt);
    // In the latest SDK, we await the response text directly
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("Zelvora Connection Error:", error);
    
    // Friendly error messages for the user
    if (error.message.includes("API_KEY_INVALID")) {
        return "System Error: The API key is missing or incorrect.";
    }
    return "I'm having trouble connecting to my brain right now. Please check back in a moment!";
  }
}

// ✅ EXPOSE TO GLOBAL SCOPE
// This is why your button might not have been working before.
window.askZelvora = askZelvora;
