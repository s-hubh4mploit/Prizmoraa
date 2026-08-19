// js/firebase-auth.js — thin wrapper around the Firebase client SDK for
// Google popup sign-in and phone/OTP sign-in. Only ever hands back a
// Firebase ID token; js/auth.js exchanges that token with our own backend
// (/api/auth/firebase) for a PRIZMORAA session, exactly like email/password
// login does. Firebase itself never becomes our source of truth for users —
// our own `users` table is, so admin tooling and orders keep working the same.
import { initializeApp } from 'firebase/app';
import {
  getAuth, GoogleAuthProvider, signInWithPopup,
  RecaptchaVerifier, signInWithPhoneNumber,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let app = null;
let authInstance = null;

function isConfigured() {
  return !!(firebaseConfig.apiKey && firebaseConfig.projectId);
}

function getFirebaseAuth() {
  if (!isConfigured()) throw new Error('Sign-in with Google/Phone isn\'t set up yet.');
  if (!app) app = initializeApp(firebaseConfig);
  if (!authInstance) authInstance = getAuth(app);
  return authInstance;
}

export async function signInWithGoogle() {
  const auth = getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  return result.user.getIdToken();
}

// Renders an invisible reCAPTCHA into the given container id. Must exist
// in the DOM before calling sendPhoneOtp().
export function setupRecaptcha(containerId) {
  const auth = getFirebaseAuth();
  return new RecaptchaVerifier(auth, containerId, { size: 'invisible' });
}

export async function sendPhoneOtp(phoneNumber, recaptchaVerifier) {
  const auth = getFirebaseAuth();
  return signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifier);
}

export async function confirmPhoneOtp(confirmationResult, code) {
  const result = await confirmationResult.confirm(code);
  return result.user.getIdToken();
}

export const firebaseConfigured = isConfigured();
