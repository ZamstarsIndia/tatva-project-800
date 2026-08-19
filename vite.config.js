import { copyFileSync, mkdirSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';

function supabaseConfigPlugin(env) {
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

  return {
    name: 'supabase-config',
    configureServer(server) {
      server.middlewares.use(serveConfig);
    },
    configurePreviewServer(server) {
      server.middlewares.use(serveConfig);
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
    plugins: [supabaseConfigPlugin(env)],
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
