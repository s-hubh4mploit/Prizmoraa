// Verifies a Firebase Authentication ID token server-side, without the
// firebase-admin SDK or a service account key. Firebase ID tokens are
// standard RS256-signed JWTs; Google publishes the current signing certs
// at a stable URL, so we fetch those, pick the cert matching the token's
// `kid`, and verify the signature + issuer/audience ourselves.
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;

let certsCache = null;
let certsCacheExpiry = 0;

async function getCerts() {
  if (certsCache && Date.now() < certsCacheExpiry) return certsCache;
  const res = await fetch(CERTS_URL);
  if (!res.ok) throw new Error('Could not fetch Firebase signing certs');
  certsCache = await res.json();
  certsCacheExpiry = Date.now() + 60 * 60 * 1000;
  return certsCache;
}

// Returns the token's decoded payload (uid, email, phone_number, name, ...)
// or throws if the token is missing, malformed, expired, or not properly signed.
export async function verifyFirebaseIdToken(idToken) {
  if (!PROJECT_ID) throw new Error('Server is not configured (missing FIREBASE_PROJECT_ID)');
  if (!idToken || typeof idToken !== 'string') throw new Error('Missing ID token');

  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded || !decoded.header || !decoded.header.kid) throw new Error('Invalid token');

  const certs = await getCerts();
  const certPem = certs[decoded.header.kid];
  if (!certPem) throw new Error('Unknown signing key — token may be forged or certs rotated');

  const publicKey = new crypto.X509Certificate(certPem).publicKey;
  const payload = jwt.verify(idToken, publicKey, {
    algorithms: ['RS256'],
    issuer: `https://securetoken.google.com/${PROJECT_ID}`,
    audience: PROJECT_ID,
  });

  if (!payload.sub) throw new Error('Token missing subject');
  return payload;
}
