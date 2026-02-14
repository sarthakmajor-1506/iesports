// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyC6UbtK2WDpfzRSQKhkEZyEHrkJPjZfdus",
  authDomain: "iesports-auth.firebaseapp.com",
  projectId: "iesports-auth",
  storageBucket: "iesports-auth.firebasestorage.app",
  messagingSenderId: "375923989882",
  appId: "1:375923989882:web:3ecdf52a51bf81fc7d4ac3"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
