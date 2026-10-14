import { createApp } from './app.js';
import { config } from './config.js';
import { db, initDb } from './db.js';

initDb(config.databasePath);
const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`Agrovet Manager API listening on http://localhost:${config.port} (${config.isProd ? 'production' : 'development'})`);
});

function shutdown(signal) {
  console.log(`\n${signal} received – shutting down`);
  server.close(() => {
    try { db.close(); } catch { /* already closed */ }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
