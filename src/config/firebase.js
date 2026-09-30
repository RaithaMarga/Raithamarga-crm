import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const LOCAL_DB_FILE = path.join(DATA_DIR, 'db.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Clean helper for env vars that may contain quotes or trailing commas
function cleanEnv(val) {
  if (!val) return '';
  return val.replace(/^["'\s]+|["',;\s]+$/g, '').trim();
}

const INITIAL_DATA = {
  users: [],
  farmer_profiles: [],
  buyer_profiles: [],
  produce_listings: [],
  buyer_requirements: [],
  deals: [],
  verifications: [],
  proofs: []
};

class LocalStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        return { ...INITIAL_DATA, ...JSON.parse(raw) };
      }
    } catch (err) {
      console.warn('[DB] Failed to read db.json:', err.message);
    }
    this.save(INITIAL_DATA);
    return JSON.parse(JSON.stringify(INITIAL_DATA));
  }

  save(data) {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(data || this.data, null, 2), 'utf8');
    } catch (err) {
      console.error('[DB] Error writing db.json:', err.message);
    }
  }

  getCollection(name) {
    if (!this.data[name]) {
      this.data[name] = [];
      this.save();
    }
    return this.data[name];
  }

  setCollection(name, list) {
    this.data[name] = list;
    this.save();
  }

  insert(name, item) {
    const list = this.getCollection(name);
    list.unshift(item);
    this.save();
    return item;
  }

  update(name, id, updates) {
    const list = this.getCollection(name);
    const idx = list.findIndex((i) => i.id === id || i.userId === id);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...updates, updatedAt: new Date().toISOString() };
      this.save();
      return list[idx];
    }
    return null;
  }

  delete(name, id) {
    const list = this.getCollection(name);
    const filtered = list.filter((i) => i.id !== id);
    this.setCollection(name, filtered);
    return true;
  }
}

export const localStore = new LocalStore(LOCAL_DB_FILE);

const credentialPath = cleanEnv(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
const configuredProject = cleanEnv(process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID);
let credential;
let projectId = configuredProject;
if (credentialPath) {
  const resolvedPath = path.resolve(path.dirname(LOCAL_DB_FILE), '..', credentialPath);
  const account = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  if (account.type !== 'service_account' || !account.project_id || !account.client_email || !account.private_key) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_PATH must point to a valid service-account JSON file.');
  }
  if (configuredProject && configuredProject !== account.project_id) {
    throw new Error('Firebase service-account project does not match FIREBASE_PROJECT_ID.');
  }
  projectId = account.project_id;
  credential = cert(account);
} else {
  credential = applicationDefault();
}
if (!projectId) throw new Error('Set FIREBASE_PROJECT_ID for the backend.');
const adminApp = initializeApp({ credential, projectId }, 'RaithaMargaBackend');
export const firestoreDb = getFirestore(adminApp);
let firestoreReady = false;
let lastError = null;

export async function verifyFirestoreAccess() {
  try {
    await firestoreDb.collection('users').limit(1).get();
    firestoreReady = true;
    lastError = null;
  } catch (error) {
    firestoreReady = false;
    lastError = 'Authenticated Firestore access failed. Check server credentials and IAM permissions.';
    throw new Error(lastError, { cause: error });
  }
}

export async function syncDocToFirestore(collectionName, docId, data) {
  try {
    const localRecord = (localStore.data[collectionName] || []).find(record => record.id === docId || record.userId === docId);
    const payload = localRecord ? { ...localRecord, ...data } : data;
    await firestoreDb.collection(collectionName).doc(String(docId)).set(payload, { merge: true });
    lastError = null;
  } catch (error) {
    lastError = `Firestore write failed for ${collectionName}.`;
    throw new Error(lastError, { cause: error });
  }
}

export async function deleteDocFromFirestore(collectionName, docId) {
  try {
    await firestoreDb.collection(collectionName).doc(String(docId)).delete();
    lastError = null;
  } catch (error) {
    lastError = `Firestore delete failed for ${collectionName}.`;
    throw new Error(lastError, { cause: error });
  }
}

export const getDbStatus = () => ({
  mode: firestoreReady ? 'firestore_admin_connected' : 'firestore_admin_unverified',
  projectId,
  activeCollections: Object.keys(localStore.data),
  firestoreReady,
  lastError
});
