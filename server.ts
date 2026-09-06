import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { dbService } from './server/db';
import {
  SEEDED_USERS,
  INITIAL_INSTITUTE,
  INITIAL_CLASSES,
  INITIAL_STUDENTS,
  INITIAL_FAMILIES,
  INITIAL_BUSES,
  INITIAL_STOPS,
  INITIAL_GLOBAL_TEMPLATES,
  INITIAL_VOUCHERS,
  INITIAL_COLLECTIONS,
  INITIAL_TRANSACTIONS,
  INITIAL_BANK_ACCOUNTS,
  INITIAL_AUDIT_LOGS,
  INITIAL_STUDENT_ACCOUNT_HISTORY,
} from './src/data/seedData';

const PORT = 3000;

async function startServer() {
  const app = express();

  // Parse JSON payloads up to 50MB (to support bulk uploads, CSV imports, and document attachments)
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Initialize Database and Seed if empty
  await dbService.init();
  await dbService.seedIfEmpty({
    users: SEEDED_USERS,
    institute: INITIAL_INSTITUTE,
    classes: INITIAL_CLASSES,
    students: INITIAL_STUDENTS,
    families: INITIAL_FAMILIES,
    buses: INITIAL_BUSES,
    stops: INITIAL_STOPS,
    transportAssignments: [],
    templates: INITIAL_GLOBAL_TEMPLATES,
    vouchers: INITIAL_VOUCHERS,
    collections: INITIAL_COLLECTIONS,
    transactions: INITIAL_TRANSACTIONS,
    bankAccounts: INITIAL_BANK_ACCOUNTS,
    auditLogs: INITIAL_AUDIT_LOGS,
    studentAccountHistory: INITIAL_STUDENT_ACCOUNT_HISTORY,
    lockedMonths: [],
  });

  // --- API Routes ---

  // Live SSE clients list
  let sseClients: { id: string; res: express.Response }[] = [];

  function broadcastEvent(event: any) {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    sseClients.forEach((client) => {
      try {
        client.res.write(payload);
      } catch {
        // Handled by close listener
      }
    });
  }

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      engine: dbService.getEngine(),
      ...dbService.getRevisionInfo(),
      connectedClients: sseClients.length,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  // Revision check endpoint for lightweight polling
  app.get('/api/revision', (req, res) => {
    res.json({
      success: true,
      ...dbService.getRevisionInfo(),
    });
  });

  // Server-Sent Events (SSE) stream for instant real-time multi-user synchronization
  app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const clientId = (req.query.clientId as string) || Math.random().toString(36).substring(2, 10);
    const clientRecord = { id: clientId, res };
    sseClients.push(clientRecord);

    // Initial greeting handshake
    const revInfo = dbService.getRevisionInfo();
    res.write(`data: ${JSON.stringify({ type: 'handshake', revision: revInfo.revision, clientId })}\n\n`);

    // Keepalive ping every 25s
    const pingInterval = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(pingInterval);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(pingInterval);
      sseClients = sseClients.filter((c) => c !== clientRecord);
    });
  });

  // Full state hydration for clients
  app.get('/api/state', async (req, res) => {
    try {
      const state = await dbService.getFullState();
      const revInfo = dbService.getRevisionInfo();
      res.json({
        success: true,
        engine: dbService.getEngine(),
        revision: revInfo.revision,
        data: state,
      });
    } catch (err: any) {
      console.error('[API] Failed to get state:', err);
      res.status(500).json({ success: false, error: err?.message || 'Database read failure' });
    }
  });

  // Atomic state synchronization
  app.post('/api/sync', async (req, res) => {
    try {
      const clientId = (req.headers['x-client-id'] as string) || req.body._clientId || '';
      const payload = { ...req.body };
      delete payload._clientId;

      const result = await dbService.syncState(payload);
      if (result.success) {
        const revInfo = dbService.getRevisionInfo();
        broadcastEvent({
          type: 'db_mutation',
          revision: revInfo.revision,
          originClientId: clientId,
          lastModified: revInfo.lastModified,
        });
      }
      res.json(result);
    } catch (err: any) {
      console.error('[API] Failed to sync state:', err);
      res.status(500).json({ success: false, error: err?.message || 'Database write failure' });
    }
  });

  // Export full database backup
  app.get('/api/backup/export', async (req, res) => {
    try {
      const state = await dbService.getFullState();
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="skooler_backup_${new Date().toISOString().split('T')[0]}.json"`);
      res.json(state);
    } catch (err: any) {
      console.error('[API] Failed to export backup:', err);
      res.status(500).json({ success: false, error: err?.message || 'Backup export failure' });
    }
  });

  // Restore database from backup payload
  app.post('/api/backup/restore', async (req, res) => {
    try {
      const backupData = req.body;
      if (!backupData || typeof backupData !== 'object') {
        return res.status(400).json({ success: false, error: 'Invalid backup format' });
      }
      const result = await dbService.syncState(backupData);
      res.json(result);
    } catch (err: any) {
      console.error('[API] Failed to restore backup:', err);
      res.status(500).json({ success: false, error: err?.message || 'Backup restore failure' });
    }
  });

  // --- Vite / Frontend Serving Middleware ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Skooler Fee Management Server running at http://0.0.0.0:${PORT}`);
    console.log(`[Server] Database Engine: ${dbService.getEngine().toUpperCase()}`);
  });
}

startServer().catch((err) => {
  console.error('[Server] Fatal error during startup:', err);
  process.exit(1);
});
