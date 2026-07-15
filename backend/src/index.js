import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import './db/index.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRouter } from './routes/auth.js';
import { portsRouter } from './routes/ports.js';
import { dashboardRouter } from './routes/dashboard.js';
import { managerRouter } from './routes/manager.js';
import { processRouter } from './routes/process.js';
import { settingsRouter } from './routes/settings.js';
import { tokensRouter } from './routes/tokens.js';
import { startScheduler } from './services/scheduler.js';

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRouter);

app.use('/api/ports', requireAuth, portsRouter);
app.use('/api/dashboard', requireAuth, dashboardRouter);
app.use('/api/manager', requireAuth, managerRouter);
app.use('/api/process', requireAuth, processRouter);
app.use('/api/settings', requireAuth, settingsRouter);
app.use('/api/tokens', requireAuth, tokensRouter);

app.use('/api', (req, res) => res.status(404).json({ error: 'not found' }));

const indexHtmlPath = path.join(config.frontendDistPath, 'index.html');
if (fs.existsSync(indexHtmlPath)) {
  app.use(express.static(config.frontendDistPath));
  app.get('*', (req, res) => res.sendFile(indexHtmlPath));
  console.log(`serving frontend from ${config.frontendDistPath}`);
} else {
  console.log(`frontend build not found at ${config.frontendDistPath}, skipping static hosting (API-only mode)`);
}

app.use(errorHandler);

app.listen(config.port, config.host, () => {
  console.log(`ssmanager panel backend listening on ${config.host}:${config.port}`);
  startScheduler();
});
