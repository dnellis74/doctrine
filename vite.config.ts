import { defineConfig, loadEnv, type Plugin } from 'vite';
import type { IncomingMessage } from 'node:http';

function decideApiPlugin(apiKey: string | undefined): Plugin {
  return {
    name: 'doctrine-decide-api',
    configureServer(server) {
      server.middlewares.use('/api/decide', (req, res, next) => {
        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          res.end();
          return;
        }
        if (req.method !== 'POST') {
          next();
          return;
        }

        void (async () => {
          try {
            const body = await readBody(req);
            const { handleDecide } = await server.ssrLoadModule('/api/decide.ts');
            const result = await handleDecide(body, {
              apiKey,
              isDev: true,
            });
            res.statusCode = result.status;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(JSON.stringify(result.body));
          } catch (err) {
            console.error('[decide]', err);
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'decide failed' }));
          }
        })();
      });
    },
  };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 4096) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiKey = env.TYPESAFE_API_KEY || env.jev_api_key || env.JEV_API_KEY;

  return {
    plugins: [decideApiPlugin(apiKey)],
    server: {
      host: true,
    },
    build: {
      target: 'es2022',
    },
    optimizeDeps: {
      exclude: ['@typesafe-ai/sdk'],
    },
    ssr: {
      external: ['@typesafe-ai/sdk'],
    },
  };
});
