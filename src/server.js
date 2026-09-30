import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRouter from './routes/api.js';
import { getDbStatus, verifyFirestoreAccess } from './config/firebase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static CRM web dashboard
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Mount API routes
app.use('/api', apiRouter);

// Fallback to CRM UI for SPA routing
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

await verifyFirestoreAccess();

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
