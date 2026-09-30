import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const IS_VERCEL = Boolean(process.env.VERCEL);
// Vercel's filesystem is read-only except /tmp (which is ephemeral per instance).
const DATA_DIR = IS_VERCEL ? '/tmp/raithamarga-data' : path.resolve(__dirname, '../../data');
const LOCAL_DB_FILE = path.join(DATA_DIR, 'db.json');

try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (err) {
  console.warn('[DB] Could not create data directory:', err.message);
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

// Service-account credentials can come from (in priority order):
//  1. FIREBASE_SERVICE_ACCOUNT_JSON  - full JSON (raw or base64) - best for Vercel
//  2. FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
//  3. FIREBASE_SERVICE_ACCOUNT_PATH  - path to a JSON file - local development
//  4. Application Default Credentials
function loadServiceAccountFromEnv() {
  const rawJson = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (rawJson) {
    const text = rawJson.startsWith('{') ? rawJson : Buffer.from(rawJson, 'base64').toString('utf8');
    let account;
    try {
      account = JSON.parse(text);
    } catch {
      // Tolerate JSON pasted with real line breaks inside strings
      account = JSON.parse(text.replace(/\r?\n/g, '\\n'));
    }
    if (account.private_key) account.private_key = account.private_key.replace(/\\n/g, '\n');
    return account;
  }
  const email = cleanEnv(process.env.FIREBASE_CLIENT_EMAIL);
  const key = (process.env.FIREBASE_PRIVATE_KEY || '').trim().replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');
  if (email && key && configuredProject) {
    return { type: 'service_account', project_id: configuredProject, client_email: email, private_key: key };
  }
  return null;
}

function assertValidAccount(account, source) {
  if (account.type !== 'service_account' || !account.project_id || !account.client_email || !account.private_key) {
    throw new Error(`${source} must contain a valid service-account (type, project_id, client_email, private_key).`);
  }
  if (configuredProject && configuredProject !== account.project_id) {
    throw new Error('Firebase service-account project does not match FIREBASE_PROJECT_ID.');
  }
}

let projectId = configuredProject;
let initError = null;
let firestoreDb = null;

// Never throw while the module loads: on serverless hosts that turns into an
// opaque 500 FUNCTION_INVOCATION_FAILED. Record the problem and expose it via
// /api/health instead.
try {
  let credential;
  const envAccount = loadServiceAccountFromEnv();
  if (envAccount) {
    assertValidAccount(envAccount, 'Firebase service-account environment variables');
    projectId = envAccount.project_id;
    credential = cert(envAccount);
  } else if (credentialPath) {
    const resolvedPath = path.resolve(path.dirname(LOCAL_DB_FILE), '..', credentialPath);
    const account = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
    assertValidAccount(account, 'FIREBASE_SERVICE_ACCOUNT_PATH');
    projectId = account.project_id;
    credential = cert(account);
  } else {
    credential = applicationDefault();
  }
  if (!projectId) throw new Error('Set FIREBASE_PROJECT_ID for the backend.');
  const adminApp = initializeApp({ credential, projectId }, 'RaithaMargaBackend');
  firestoreDb = getFirestore(adminApp);
} catch (error) {
  initError = `Firebase initialisation failed: ${error.message}`;
  console.error('[Firebase]', initError);
  if (!IS_VERCEL) throw error;
}
export { firestoreDb };
let firestoreReady = false;
let lastError = null;

// Firestore is the source of truth. The API reads from an in-memory copy
// (localStore), so we refresh that copy from Firestore:
//  - on cold start (serverless /tmp is empty), and
//  - before API requests (throttled), so data written by other instances or
//    directly by the marketplace frontend shows up in the CRM.
const REFRESH_TTL_MS = Number(process.env.FIRESTORE_REFRESH_TTL_MS || 4000);
let lastRefreshAt = 0;
let refreshInFlight = null;
let pendingWrites = 0;

async function loadAllCollections() {
  const names = Array.from(new Set([...Object.keys(INITIAL_DATA), 'matches']));
  const results = await Promise.all(
    names.map(async (name) => {
      const snap = await firestoreDb.collection(name).get();
      return [name, snap.docs.map((d) => ({ id: d.id, ...d.data() }))];
    })
  );
  for (const [name, docs] of results) localStore.data[name] = docs;
  localStore.save();
  lastRefreshAt = Date.now();
}

export async function refreshFromFirestore({ force = false } = {}) {
  if (!firestoreDb || initError) return false;
  if (!force && Date.now() - lastRefreshAt < REFRESH_TTL_MS) return false;
  if (pendingWrites > 0) return false; // don't clobber in-flight local writes
  if (!refreshInFlight) {
    refreshInFlight = loadAllCollections()
      .catch((err) => {
        lastError = `Firestore refresh failed: ${err.message}`;
        console.error('[Firestore refresh]', err.message);
      })
      .finally(() => { refreshInFlight = null; });
  }
  await refreshInFlight;
  return true;
}

async function hydrateLocalStoreFromFirestore() {
  await loadAllCollections();
}

export async function verifyFirestoreAccess() {
  if (initError) {
    firestoreReady = false;
    lastError = initError;
    throw new Error(initError);
  }
  try {
    await firestoreDb.collection('users').limit(1).get();
    firestoreReady = true;
    lastError = null;
    if (IS_VERCEL) await hydrateLocalStoreFromFirestore();
  } catch (error) {
    firestoreReady = false;
    lastError = `Authenticated Firestore access failed: ${error.message}`;
    throw new Error(lastError, { cause: error });
  }
}

export async function syncDocToFirestore(collectionName, docId, data) {
  if (!firestoreDb) throw new Error(initError || 'Firestore is not initialised.');
  pendingWrites++;
  try {
    const localRecord = (localStore.data[collectionName] || []).find(record => record.id === docId || record.userId === docId);
    const payload = localRecord ? { ...localRecord, ...data } : data;
    await firestoreDb.collection(collectionName).doc(String(docId)).set(payload, { merge: true });
    lastError = null;
  } catch (error) {
    lastError = `Firestore write failed for ${collectionName}.`;
    throw new Error(lastError, { cause: error });
  } finally {
    pendingWrites--;
  }
}

export async function deleteDocFromFirestore(collectionName, docId) {
  if (!firestoreDb) throw new Error(initError || 'Firestore is not initialised.');
  pendingWrites++;
  try {
    await firestoreDb.collection(collectionName).doc(String(docId)).delete();
    lastError = null;
  } catch (error) {
    lastError = `Firestore delete failed for ${collectionName}.`;
    throw new Error(lastError, { cause: error });
  } finally {
    pendingWrites--;
  }
}

export const getDbStatus = () => ({
  mode: firestoreReady ? 'firestore_admin_connected' : 'firestore_admin_unverified',
  projectId,
  activeCollections: Object.keys(localStore.data),
  firestoreReady,
  lastError
});
