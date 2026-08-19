import { copyFileSync, mkdirSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';
import usersHandler from './api/users.js';

function asConnect(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

function supabaseApiPlugin(env) {
  const payload = JSON.stringify({
    url: env.TATVA_SUPABASE_URL || '',
    key: env.TATVA_SUPABASE_PUBLISHABLE_KEY || '',
  });

  function serveConfig(req, res, next) {
    if (req.url?.split('?')[0] !== '/api/supabase-config') return next();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(payload);
  }

  const serveUsers = (req, res, next) => {
    if (req.url?.split('?')[0] !== '/api/users') return next();
    return asConnect(usersHandler)(req, res, next);
  };

  return {
    name: 'supabase-api',
    configureServer(server) {
      Object.assign(process.env, {
        TATVA_SUPABASE_URL: env.TATVA_SUPABASE_URL || '',
        TATVA_SUPABASE_PUBLISHABLE_KEY: env.TATVA_SUPABASE_PUBLISHABLE_KEY || '',
        TATVA_SUPABASE_SECRET_KEY: env.TATVA_SUPABASE_SECRET_KEY || '',
        TATVA_SUPABASE_SERVICE_ROLE_KEY: env.TATVA_SUPABASE_SERVICE_ROLE_KEY || '',
      });
      server.middlewares.use(serveConfig);
      server.middlewares.use(serveUsers);
    },
    configurePreviewServer(server) {
      server.middlewares.use(serveConfig);
      server.middlewares.use(serveUsers);
    },
    closeBundle() {
      mkdirSync('dist/src', { recursive: true });
      copyFileSync('src/app.js', 'dist/src/app.js');
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [supabaseApiPlugin(env)],
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      rollupOptions: {
        output: {
          manualChunks: undefined,
        },
      },
    },
    server: {
      port: 3000,
      open: true,
    },
  };
});
