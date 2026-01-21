import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAI, getGenerativeModel } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-ai.js";

// YOUR REAL CONFIG FROM FIREBASE CONSOLE
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


const app = initializeApp(firebaseConfig);
const ai = getAI(app, { backend: "google-ai" }); // Free tier backend

const model = getGenerativeModel(ai, {
  model: "gemini-3-flash-preview", 
});

export async function askZelvora(prompt) {
  console.log("Button Tapped!"); // This must stay here to verify the click
  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("AI Error Details:", error);
    return "The mentor is resting. Check back soon.";
  }
}

// CRITICAL: Connects the internal function to your HTML button
window.askZelvora = askZelvora; 
