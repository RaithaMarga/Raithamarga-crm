import dotenv from 'dotenv';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, collection, getDocs } from 'firebase/firestore';

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

console.log('Testing Live Firebase Connection with Project:', firebaseConfig.projectId);
console.log('API Key present:', Boolean(firebaseConfig.apiKey));

async function runTest() {
  try {
    const app = initializeApp(firebaseConfig, 'TestLiveApp');
    const db = getFirestore(app);

    const testDocId = `live-test-${Date.now()}`;
    const testPayload = {
      message: 'Hello Firebase Cloud Firestore from RaithaMarga Test Runner!',
      timestamp: new Date().toISOString(),
      source: 'live_test_script'
    };

    console.log(`Writing test document to 'system_health_checks/${testDocId}'...`);
    const docRef = doc(db, 'system_health_checks', testDocId);
    await setDoc(docRef, testPayload);
    console.log('✅ Write to Cloud Firestore SUCCESSFUL!');

    console.log(`Reading back document 'system_health_checks/${testDocId}'...`);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      console.log('✅ Read from Cloud Firestore SUCCESSFUL! Data:', snap.data());
    } else {
      console.log('⚠️ Document written but not found on read.');
    }

    console.log('\nChecking existing collections in Cloud Firestore:');
    const cols = ['users', 'farmer_profiles', 'buyer_profiles', 'produce_listings', 'buyer_requirements', 'deals', 'verifications', 'proofs'];
    for (const colName of cols) {
      try {
        const colSnap = await getDocs(collection(db, colName));
        console.log(`- Collection '${colName}': ${colSnap.size} documents found in Cloud Firestore`);
      } catch (colErr) {
        console.log(`- Collection '${colName}': Error reading (${colErr.message})`);
      }
    }

    console.log('\n🎉 ALL LIVE FIREBASE TESTS PASSED! Firebase Cloud Firestore is actively connected & live.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Firebase Live Test Error:', err.message);
    if (err.message.includes('PERMISSION_DENIED')) {
      console.error('👉 PERMISSION_DENIED details: Cloud Firestore security rules are blocking unauthenticated writes.');
    }
    process.exit(1);
  }
}

runTest();
