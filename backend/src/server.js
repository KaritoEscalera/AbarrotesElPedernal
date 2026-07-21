import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { verifyDatabase } from './database.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { businessRouter } from './routes/business.js';
import { startBackupScheduler } from './backup-scheduler.js';

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || config.frontendUrls.includes(origin)) return callback(null, true);
    return callback(new Error(`Origen no permitido por CORS: ${origin}`));
  },
}));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (_req, res, next) => {
  try { res.json({ status: 'ok', database: await verifyDatabase() }); }
  catch (error) { next(error); }
});
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api', businessRouter);
app.use((_req, res) => res.status(404).json({ error: 'Ruta API no encontrada.' }));
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'Ocurrió un error interno en el servidor.' });
});

verifyDatabase()
  .then((database) => app.listen(config.port, () => { console.log(`API disponible en http://localhost:${config.port} · BD ${database.databaseName}`);startBackupScheduler(); }))
  .catch((error) => { console.error('No fue posible conectar con MySQL:', error.message); process.exit(1); });
