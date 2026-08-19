// js/auth.js — customer signup / login / session / order history

const TOKEN_KEY = 'prizmoraa_auth_token';
const USER_KEY = 'prizmoraa_auth_user';

function getToken() { return localStorage.getItem(TOKEN_KEY); }
function getUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY)); }
  catch (e) { return null; }
}
function isLoggedIn() { return !!getToken() && !!getUser(); }

function saveSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function postJson(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  let data;
  try { data = await res.json(); } catch (e) { data = {}; }
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

async function signup({ name, email, phone, password }) {
  const data = await postJson('/api/auth/signup', { name, email, phone, password });
  saveSession(data.token, data.user);
  return data.user;
}

async function login({ email, password }) {
  const data = await postJson('/api/auth/login', { email, password });
  saveSession(data.token, data.user);
  return data.user;
}

// Used by Google popup sign-in and phone/OTP sign-in — both hand us a
// Firebase ID token, which the server verifies and exchanges for a
// PRIZMORAA session, same shape as email/password login.
async function loginWithIdToken(idToken) {
  const data = await postJson('/api/auth/firebase', { idToken });
  saveSession(data.token, data.user);
  return data.user;
}

function logout() { clearSession(); }

async function fetchMyOrders() {
  const token = getToken();
  if (!token) return [];
  try {
    const res = await fetch('/api/orders/mine', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

window.PrizmoraaAuth = { getToken, getUser, isLoggedIn, signup, login, loginWithIdToken, logout, fetchMyOrders };
