import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { firestoreDb, verifyFirestoreAccess, syncDocToFirestore, deleteDocFromFirestore } from '../src/config/firebase.js';

await verifyFirestoreAccess();
const id = `admin-access-test-${randomUUID()}`;
const collections = ['users', 'farmer_profiles', 'buyer_profiles', 'produce_listings', 'buyer_requirements', 'matches', 'deals', 'verifications', 'proofs'];
try {
  for (const name of collections) {
    try {
      const payload = { id, testOnly: true, source: 'admin-access-check', marker: randomUUID() };
      await syncDocToFirestore(name, id, payload);
      const snapshot = await firestoreDb.collection(name).doc(id).get();
      assert.deepEqual(snapshot.data(), payload);
      await deleteDocFromFirestore(name, id);
      assert.equal((await firestoreDb.collection(name).doc(id).get()).exists, false);
      console.log(`[PASS] ${name}: authenticated write, server readback, delete`);
    } finally {
      await deleteDocFromFirestore(name, id);
    }
  }
} finally {
  await firestoreDb.terminate();
}
