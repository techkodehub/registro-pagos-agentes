// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyB-7fmK8kHqQ6N6_u5CkBkrGrwAYcg_b0M",
    authDomain: "pagos-multiagente.firebaseapp.com",
    projectId: "pagos-multiagente",
    storageBucket: "pagos-multiagente.firebasestorage.app",
    messagingSenderId: "530871765900",
    appId: "1:530871765900:web:4554a4c1de53e184a7a4a9"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
// Initialize Firestore
export const db = getFirestore(app);
