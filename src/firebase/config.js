// src/firebase/config.js
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyC7iDBkTISjf_shMJL_CMOFxOAUSOvfEuQ",
  authDomain: "athletic-p.firebaseapp.com",
  projectId: "athletic-p",
  storageBucket: "athletic-p.firebasestorage.app",
  messagingSenderId: "81953088674",
  appId: "1:81953088674:web:7605ca03e47c05fab123fb",
  measurementId: "G-MFWQZZWHDX"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// 👉 這就是導致錯誤的那一行！現在我們把它正確匯出了
export const db = getFirestore(app); 
