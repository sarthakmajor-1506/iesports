import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyC6UbtK2WDpfzRSQKhkEZyEHrkJPjZfdus",
  authDomain: "iesports-auth.firebaseapp.com",
  projectId: "iesports-auth",
  storageBucket: "iesports-auth.firebasestorage.app",
  messagingSenderId: "375923989882",
  appId: "1:375923989882:web:3ecdf52a51bf81fc7d4ac3"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Firebase Auth is loaded dynamically to keep it out of the initial JS bundle.
// The auth/iframe.js (90KB) was the #1 critical-chain bottleneck on mobile.
// All consumers should use getFirebaseAuth() instead of a static `auth` import.
let _authMod: typeof import("firebase/auth") | null = null;
let _authInstance: import("firebase/auth").Auth | null = null;

export async function getFirebaseAuth() {
  if (!_authInstance) {
    _authMod = await import("firebase/auth");
    _authInstance = _authMod.getAuth(app);
  }
  return { auth: _authInstance, mod: _authMod! };
}
