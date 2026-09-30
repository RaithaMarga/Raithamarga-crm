import 'dotenv/config';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

console.log('Initializing Firebase App for Project:', firebaseConfig.projectId);
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function testFirestore() {
  try {
    const pingRef = doc(db, 'system_health', 'connection_test');
    await setDoc(pingRef, {
      status: 'online',
      message: 'RaithaMarga Firebase Connection Successful',
      connectedAt: new Date().toISOString()
    });
    console.log('SUCCESS: Connected to Firebase Firestore and wrote connection_test doc!');
    const snap = await getDoc(pingRef);
    console.log('READ CONFIRMATION: Fetched doc data:', snap.data());
    process.exit(0);
  } catch (err) {
    console.error('Firestore Error:', err.message);
    process.exit(1);
  }
}

testFirestore();
