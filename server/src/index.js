import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';

import { config } from './config.js';
import { logger } from './logger.js';
import { session } from './middleware/session.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { authRoutes } from './routes/auth.js';
import { testCaseRoutes } from './routes/testCases.js';
import { agentRoutes } from './routes/agent.js';
import { repositoryRoutes } from './routes/repository.js';
import { sweep } from './clients/tokenStore.js';

const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true, // the session cookie must be sent cross-origin in dev
  }),
);
// The agent accepts attachments (PDFs, screenshots) as base64, so its route
// alone parses a larger body; the global parser then sees it already parsed.
app.use('/api/agent', express.json({ limit: '40mb' }));
// Saving or exporting up to 100 detailed cases at once.
app.use(['/api/repository', '/api/create-test-case'], express.json({ limit: '5mb' }));
// Sized for an imported document (up to 100k characters) plus JSON escaping.
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());
app.use(session);
app.use(
  pinoHttp({
    logger,
    // Health checks would otherwise dominate the log.
    autoLogging: { ignore: (req) => req.url === '/healthz' },
  }),
);

app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
app.use('/auth', authRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/repository', repositoryRoutes);
app.use('/api', testCaseRoutes);

// In a deployment the built web app is served from here too, so the whole
// tool is one service on one origin. In development Vite serves it instead.
const webDist = process.env.WEB_DIST || fileURLToPath(new URL('../../web/dist', import.meta.url));
if (existsSync(join(webDist, 'index.html'))) {
  app.use(express.static(webDist, { index: false, maxAge: '1h' }));
  // Client-side pages: anything that is not the API answers with the app.
  app.get(/^\/(?!api\/|auth\/|healthz).*/, (_req, res) => res.sendFile(join(webDist, 'index.html')));
  logger.info({ webDist }, 'serving the web app');
}

app.use(notFound);
app.use(errorHandler);

const server = app.listen(config.port, () => {
  logger.info(
    {
      port: config.port,
      project: config.jira?.projectKey,
      issueType: config.jira?.issueType,
    },
    'test case generator service listening',
  );
});

// Expired sessions and consent states are dropped periodically so the
// in-memory maps cannot grow without bound.
const sweeper = setInterval(sweep, 15 * 60 * 1000);
sweeper.unref();

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    logger.info({ signal }, 'shutting down');
    server.close(() => process.exit(0));
  });
}
