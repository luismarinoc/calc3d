// Only these two public values are embedded in the browser bundle.
export function publicConfig(source) {
  return { SUPABASE_URL: source.SUPABASE_URL, SUPABASE_ANON_KEY: source.SUPABASE_ANON_KEY };
}

function anonJwt(key) {
  const segments = key.split('.');
  if (segments.length !== 3 || segments.some(segment => !/^[A-Za-z0-9_-]+={0,2}$/.test(segment) || segment.length % 4 === 1)) return false;
  try {
    const decode = segment => JSON.parse(atob(segment.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(segment.length / 4) * 4, '=')));
    const header = decode(segments[0]);
    const payload = decode(segments[1]);
    return header && typeof header === 'object' && typeof header.alg === 'string' && header.alg !== 'none' && payload?.role === 'anon';
  } catch { return false; }
}

export function validatePublicConfig(source) {
  const { SUPABASE_URL: url, SUPABASE_ANON_KEY: key } = publicConfig(source);
  let parsed;
  try { parsed = new URL(url); } catch { /* Report without exposing input. */ }
  if (!parsed || !['https:', 'http:'].includes(parsed.protocol) || (parsed.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(parsed.hostname))) {
    throw new Error('Configuración pública de Supabase inválida.');
  }
  if (typeof key !== 'string' || !(/^(sb_publishable_[A-Za-z0-9_-]+)$/.test(key) || anonJwt(key))) {
    throw new Error('Se requiere una clave pública anon, no una clave privada.');
  }
  return { url, key };
}
