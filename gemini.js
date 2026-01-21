import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAI, getGenerativeModel } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-ai.js";

// Even for the free version, Firebase needs the project ID to host the site
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDZIxV_3OsFYBCGch6OYHiGL-aUkBPUre0",
  authDomain: "zelvora.firebaseapp.com",
  projectId: "zelvora",
  storageBucket: "zelvora.firebasestorage.app",
  messagingSenderId: "784709435771",
  appId: "1:784709435771:web:1898111582c0c798e3fdde",
  measurementId: "G-1H25LVSJR9"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
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
