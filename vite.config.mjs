import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'node:path';
import { validatePublicConfig } from './src/auth/config.mjs';

export default defineConfig(({ mode }) => {
  // Explicit allowlist: never expose the rest of .env.local or process.env.
  const env = loadEnv(mode, process.cwd(), ['SUPABASE_URL', 'SUPABASE_ANON_KEY']);
  const { url, key } = validatePublicConfig(env);
  return {
    // Prefix matching includes suffixed names; expose no automatic client env.
    envPrefix: [],
    define: { 'import.meta.env.SUPABASE_URL': JSON.stringify(url), 'import.meta.env.SUPABASE_ANON_KEY': JSON.stringify(key) },
    server: { host: '127.0.0.1', fs: { strict: true, deny: ['.env', '.env.*', '**/.pi/**', '**/.engram*/**', '**/.cache/**', '**/.git/**'] } },
    preview: { host: '127.0.0.1' },
    build: { rollupOptions: { input: Object.fromEntries(['index', 'purchases', 'settings', 'spools', 'login', 'users'].map(name => [name, resolve(import.meta.dirname, `${name}.html`)])) } },
  };
});
