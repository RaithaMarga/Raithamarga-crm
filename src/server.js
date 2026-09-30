import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRouter from './routes/api.js';
import { getDbStatus, verifyFirestoreAccess, refreshFromFirestore } from './config/firebase.js';

// Express 4 does not catch rejected promises from async route handlers.
// Without these guards a single failed Firestore call would kill the whole
// serverless function (500 FUNCTION_INVOCATION_FAILED) instead of one request.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason?.message || reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err?.message || err);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '4mb' })); // Vercel's hard request limit is 4.5 MB
app.use(express.urlencoded({ extended: true }));

// Serve static CRM web dashboard
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Mount API routes
// Keep the API's working copy in sync with Firestore (throttled).
app.use('/api', async (req, res, next) => {
  if (req.path !== '/health') {
    try { await refreshFromFirestore(); } catch (err) { console.error('[refresh]', err.message); }
  }
  next();
});
app.use('/api', apiRouter);

// Fallback to CRM UI for SPA routing
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, '../public/index.html'), (err) => {
    if (err && !res.headersSent) res.status(404).send('CRM dashboard files not found');
  });
});

// Final error handler: turn thrown errors into JSON instead of crashing.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[Express error]', err?.message || err);
  if (res.headersSent) return;
  res.status(err?.status || 500).json({ error: err?.message || 'Internal server error' });
});

try {
  await verifyFirestoreAccess();
} catch (err) {
  // Locally, fail fast. On Vercel, keep the function alive so the UI and
  // /api health info still load and the real error is visible in the logs.
  console.error('[Startup] Firestore check failed:', err.message, err.cause?.message || '');
  if (!process.env.VERCEL) throw err;
}

// On Vercel the app is exported and run as a serverless function;
// locally (or on any normal host) we start a regular HTTP server.
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log('=====================================================');
    console.log('🌾 RaithaMarga CRM & Backend Server running!');
    console.log(`🌐 Server URL: http://localhost:${PORT}`);
    console.log(`📊 CRM Dashboard: http://localhost:${PORT}`);
    console.log(`🔌 REST API Base: http://localhost:${PORT}/api`);
    console.log('💾 Database Status:', JSON.stringify(getDbStatus()));
    console.log('=====================================================');
  });
}

export default app;
