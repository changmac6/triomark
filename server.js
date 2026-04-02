import { PORT, TRUST_PROXY } from './src/server/config.js';
import { createAppServer } from './src/server/app.js';

const server = createAppServer();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`HTTPS server listening on https://0.0.0.0:${PORT}`);
  console.log(`TRUST_PROXY=${TRUST_PROXY}`);
});
