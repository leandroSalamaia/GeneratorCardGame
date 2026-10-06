// Compatibility entry point for users who start the project with `node server.js`.
// The application server and Hall of Beorn middleware are configured in vite.config.js.
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

const server = await createServer({
  configFile: fileURLToPath(new URL('./vite.config.js', import.meta.url)),
  server: { host: '127.0.0.1', port: Number(process.env.PORT || 5178), strictPort: false },
});

await server.listen();
server.printUrls();

const shutdown = async signal => {
  console.log(`\nEncerrando servidor (${signal})...`);
  await server.close();
  process.exit(0);
};
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
