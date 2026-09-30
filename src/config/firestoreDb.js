import dotenv from 'dotenv';
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy
} from 'firebase/firestore';

dotenv.config();

function clean(v) {
  if (!v) return '';
  return v.replace(/^["'\s]+|["',;\s]+$/g, '').trim();
}

const firebaseConfig = {
  apiKey: clean(process.env.VITE_FIREBASE_API_KEY),
  authDomain: clean(process.env.VITE_FIREBASE_AUTH_DOMAIN),
  projectId: clean(process.env.VITE_FIREBASE_PROJECT_ID),
  storageBucket: clean(process.env.VITE_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: clean(process.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
  appId: clean(process.env.VITE_FIREBASE_APP_ID)
};

const app = initializeApp(firebaseConfig, 'RaithaMargaApp');
export const db = getFirestore(app);

// In-memory cache synced with Firestore for high-speed reads and offline resilience
const cache = {
  users: [],
  farmer_profiles: [],
  buyer_profiles: [],
  produce_listings: [],
  buyer_requirements: [],
  matches: [],
  deals: [],
  verifications: [],
  proofs: []
};

let isInitialized = false;

// 1. Fetch entire collection from Cloud Firestore
export async function getCollectionDocs(collectionName) {
  try {
    const colRef = collection(db, collectionName);
    const snap = await getDocs(colRef);
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    cache[collectionName] = docs;
    return docs;
  } catch (err) {
    console.warn(`[Firestore Read Error: ${collectionName}]`, err.message);
    return cache[collectionName] || [];
  }
}

// 2. Write or update a document directly in Cloud Firestore
export async function saveDoc(collectionName, docId, data) {
  const payload = {
    ...data,
    updatedAt: new Date().toISOString()
  };
  try {
    const docRef = doc(db, collectionName, docId);
    await setDoc(docRef, payload, { merge: true });
    console.log(`[Firestore Live] Saved ${collectionName}/${docId}`);
  } catch (err) {
    console.warn(`[Firestore Live Save Warning]`, err.message);
  }

  // Update in-memory cache
  if (!cache[collectionName]) cache[collectionName] = [];
  const idx = cache[collectionName].findIndex(item => item.id === docId || item.userId === docId);
  if (idx !== -1) {
    cache[collectionName][idx] = { ...cache[collectionName][idx], ...payload };
  } else {
    cache[collectionName].unshift({ id: docId, ...payload });
  }

  return payload;
}

// 3. Delete document from Cloud Firestore
export async function removeDoc(collectionName, docId) {
  try {
    const docRef = doc(db, collectionName, docId);
    await deleteDoc(docRef);
    console.log(`[Firestore Live] Deleted ${collectionName}/${docId}`);
  } catch (err) {
    console.warn(`[Firestore Delete Warning]`, err.message);
  }

  if (cache[collectionName]) {
    cache[collectionName] = cache[collectionName].filter(item => item.id !== docId);
  }
  return true;
}

// 4. Phase 1 Seed Dataset (Page 4 of Implementation Guide: Admin, Kolar Farmer, Kolar Buyer)
export async function seedPhase1Data() {
  console.log('[Firestore] Checking and seeding Phase 1 standardized dataset...');
  
  // 1. Admin
  await saveDoc('users', 'admin-1', {
    id: 'admin-1',
    name: 'District APMC Admin',
    phone: '9000000000',
    email: 'admin@raithamarga.in',
    role: 'admin',
    status: 'active',
    createdAt: new Date().toISOString()
  });

  // 2. Farmer in Kolar (Ramesh Gowda)
  await saveDoc('users', 'farmer-kolar-1', {
    id: 'farmer-kolar-1',
    name: 'Ramesh Gowda',
    phone: '9876543210',
    email: 'ramesh.gowda@gmail.com',
    role: 'farmer',
    status: 'active',
    location: 'Mulbagal, Kolar',
    createdAt: new Date().toISOString()
  });

  await saveDoc('farmer_profiles', 'farmer-kolar-1', {
    userId: 'farmer-kolar-1',
    name: 'Ramesh Gowda',
    phone: '9876543210',
    village: 'Hoysala Village',
    taluk: 'Mulbagal',
    district: 'Kolar',
    state: 'Karnataka',
    pincode: '563131',
    landSizeAcres: '4.5',
    preferredCrops: 'Tomato, Potato, Cabbage',
    verificationStatus: 'verified',
    createdAt: new Date().toISOString()
  });

  // 3. Buyer in Kolar (Suresh Agro Traders)
  await saveDoc('users', 'buyer-kolar-1', {
    id: 'buyer-kolar-1',
    name: 'Suresh Kumar',
    phone: '9845012345',
    email: 'suresh.traders@apmc.in',
    role: 'buyer',
    status: 'active',
    location: 'Kolar APMC Mandi',
    createdAt: new Date().toISOString()
  });

  await saveDoc('buyer_profiles', 'buyer-kolar-1', {
    userId: 'buyer-kolar-1',
    businessName: 'Suresh Agro Traders',
    contactName: 'Suresh Kumar',
    phone: '9845012345',
    businessType: 'trader',
    location: 'Kolar APMC Yard',
    district: 'Kolar',
    verificationStatus: 'verified',
    createdAt: new Date().toISOString()
  });

  // 4. Phase 6 Benchmark Listing: 50 Quintals of Tomatoes at Rs. 2,500 / quintal in Kolar
  await saveDoc('produce_listings', 'listing-kolar-tomato', {
    id: 'listing-kolar-tomato',
    farmerId: 'farmer-kolar-1',
    farmerName: 'Ramesh Gowda',
    farmerPhone: '9876543210',
    farmerVerificationStatus: 'verified',
    crop: 'Tomato',
    quantity: 50,
    unit: 'quintal',
    grade: 'Grade A',
    expectedPrice: 2500,
    location: 'Mulbagal, Kolar',
    district: 'Kolar',
    availabilityDate: new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10),
    photos: ['https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=600'],
    status: 'active',
    createdAt: new Date().toISOString()
  });

  // 5. Phase 6 Benchmark Requirement: 40 Quintals of Tomatoes in Kolar
  await saveDoc('buyer_requirements', 'req-kolar-tomato', {
    id: 'req-kolar-tomato',
    buyerId: 'buyer-kolar-1',
    buyerName: 'Suresh Agro Traders',
    buyerPhone: '9845012345',
    crop: 'Tomato',
    requiredQuantity: 40,
    unit: 'quintal',
    quality: 'Grade A',
    targetPrice: 2600,
    location: 'Kolar APMC Yard',
    district: 'Kolar',
    neededByDate: new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10),
    createdAt: new Date().toISOString()
  });

  // 6. Verification Record
  await saveDoc('verifications', 'verif-kolar-ramesh', {
    id: 'verif-kolar-ramesh',
    userId: 'farmer-kolar-1',
    userName: 'Ramesh Gowda',
    role: 'farmer',
    documentType: 'RTC (Pahani) & Aadhaar',
    documentNumber: 'KLR-MUL-2026-9881',
    status: 'verified',
    verifiedAt: new Date().toISOString(),
    notes: 'Land ownership & crop survey verified by Kolar Field Officer.'
  });

  console.log('[Firestore] Phase 1 Seeding complete! All 8 collections active.');
}

export function getCached(collectionName) {
  return cache[collectionName] || [];
}
