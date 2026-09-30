import dotenv from 'dotenv';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

dotenv.config();

function cleanEnv(val) {
  if (!val) return '';
  return val.replace(/^["'\s]+|["',;\s]+$/g, '').trim();
}

const firebaseConfig = {
  apiKey: cleanEnv(process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY),
  authDomain: cleanEnv(process.env.VITE_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN),
  projectId: cleanEnv(process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID),
  storageBucket: cleanEnv(process.env.VITE_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET),
  messagingSenderId: cleanEnv(process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || process.env.FIREBASE_MESSAGING_SENDER_ID),
  appId: cleanEnv(process.env.VITE_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID)
};

async function testAuth() {
  const app = initializeApp(firebaseConfig, 'AuthTester');
  const auth = getAuth(app);
  const db = getFirestore(app);

  console.log('Testing Anonymous Auth on project website-2d57a...');
  try {
    const cred = await signInAnonymously(auth);
    console.log('✅ Anonymous auth succeeded! User UID:', cred.user.uid);
    
    // Now test writing with authenticated user
    const testRef = doc(db, 'system_health_checks', `test-${Date.now()}`);
    await setDoc(testRef, { test: true, uid: cred.user.uid, timestamp: new Date().toISOString() });
    console.log('✅ Write with anonymous user succeeded!');
    return;
  } catch (err) {
    console.log('Anonymous auth result:', err.message);
  }

  console.log('\nTesting Email/Password Auth with backend service user...');
  try {
    let cred;
    try {
      cred = await signInWithEmailAndPassword(auth, 'backend-system@raithamarga.in', 'RaithaMarga2026!');
      console.log('✅ Signed in existing backend user:', cred.user.uid);
    } catch (signInErr) {
      console.log('Sign in failed, attempting registration:', signInErr.message);
      cred = await createUserWithEmailAndPassword(auth, 'backend-system@raithamarga.in', 'RaithaMarga2026!');
      console.log('✅ Created backend system user:', cred.user.uid);
    }

    const testRef = doc(db, 'system_health_checks', `test-${Date.now()}`);
    await setDoc(testRef, { test: true, uid: cred.user.uid, timestamp: new Date().toISOString() });
    console.log('✅ Write with email/password user succeeded!');
  } catch (err) {
    console.log('Email/Password auth result:', err.message);
  }
}

testAuth();
