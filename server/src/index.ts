import { startApp } from './app';
import { makeStore } from './store';

const port = Number(process.env.PORT ?? 8787);
const app = await startApp({
  store: makeStore(),
  port,
  allowCheats: process.env.ALLOW_DEV_CHEATS === '1',
  corsOrigin: process.env.CORS_ORIGIN,
});
console.log(`[fls] server listening on http://localhost:${app.port} (ws: /ws)`);

const stop = async () => { console.log('[fls] shutting down, saving worlds…'); await app.close(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
