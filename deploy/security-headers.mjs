import { isDeepStrictEqual } from 'node:util';

export const CALC3D_SECURITY_MIDDLEWARE = 'calc3d-security-YYhCRbv7263';

const HOST_RULE = 'Host(`calc3d.tbema.net`)';
const DOMAIN_ID = 'NrgBtIZ2HgKnLGXKERzNo';
const APPLICATION_ID = 'YYhCRbv7263_nwsWYnmZv';
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'self' https://sp-dev.tbema.net wss://sp-dev.tbema.net; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Return only the domain middleware names; the operator preserves every other domain field. */
export function calc3dDomainMiddlewares(domain) {
  if (!record(domain) || domain.domainId !== DOMAIN_ID || domain.host !== 'calc3d.tbema.net' ||
      domain.applicationId !== APPLICATION_ID || domain.domainType !== 'application' ||
      domain.https !== true || domain.customEntrypoint !== null ||
      !Array.isArray(domain.middlewares) ||
      domain.middlewares.some((name) => typeof name !== 'string' || name.length === 0) ||
      domain.middlewares.filter((name) => name === CALC3D_SECURITY_MIDDLEWARE).length > 1) {
    throw new Error('Invalid Calc3D domain or middleware list');
  }
  const names = [...domain.middlewares];
  if (!names.includes(CALC3D_SECURITY_MIDDLEWARE)) names.push(CALC3D_SECURITY_MIDDLEWARE);
  return names;
}

function policy(mode) {
  return {
    headers: {
      [mode === 'report-only' ? 'contentSecurityPolicyReportOnly' : 'contentSecurityPolicy']: CSP,
      contentTypeNosniff: true,
      frameDeny: true,
      referrerPolicy: 'no-referrer',
      permissionsPolicy: 'camera=(), microphone=(), geolocation=()',
      stsSeconds: 300,
      stsIncludeSubdomains: false,
      stsPreload: false,
    },
  };
}

/** Return a detached, app-scoped Traefik dynamic configuration; never write or apply it. */
export function hardenCalc3dTraefik(config, options = {}) {
  if (!record(options) || (options.mode !== undefined && !['report-only', 'enforce'].includes(options.mode))) {
    throw new Error('Invalid security header mode');
  }
  const mode = options.mode ?? 'report-only';
  if (!record(config) || !record(config.http) || !record(config.http.routers) ||
      !record(config.http.services) ||
      (Object.hasOwn(config.http, 'middlewares') && !record(config.http.middlewares))) {
    throw new Error('Invalid Traefik config: expected http routers and services objects; middlewares must be an object if present');
  }
  const middlewares = config.http.middlewares ?? {};

  const routers = Object.entries(config.http.routers);
  if (routers.some(([, router]) => !record(router))) {
    throw new Error('Invalid Traefik config: router must be an object');
  }
  const targets = routers.filter(([, router]) => router.rule === HOST_RULE &&
    Array.isArray(router.entryPoints) && router.entryPoints.includes('websecure') && record(router.tls));
  if (targets.length !== 1) {
    throw new Error('Expected exactly one Calc3D HTTPS router');
  }
  const [key, target] = targets[0];
  if (typeof target.service !== 'string' || !Object.hasOwn(config.http.services, target.service) ||
      !Array.isArray(target.middlewares) || target.middlewares.some((name) => typeof name !== 'string')) {
    throw new Error('Invalid Traefik config: Calc3D HTTPS router service or middleware list');
  }
  for (const [routerKey, router] of routers) {
    if (routerKey !== key && Array.isArray(router.middlewares) && router.middlewares.includes(CALC3D_SECURITY_MIDDLEWARE)) {
      throw new Error('Calc3D security middleware referenced by another router');
    }
  }
  const refs = target.middlewares.filter((name) => name === CALC3D_SECURITY_MIDDLEWARE).length;
  if (refs > 1) {
    throw new Error('Duplicate Calc3D security middleware references');
  }
  const existing = middlewares[CALC3D_SECURITY_MIDDLEWARE];
  if (Object.hasOwn(middlewares, CALC3D_SECURITY_MIDDLEWARE) &&
      !isDeepStrictEqual(existing, policy('report-only')) && !isDeepStrictEqual(existing, policy('enforce'))) {
    throw new Error('Unexpected Calc3D security middleware definition');
  }
  if (refs === 1 && existing === undefined) {
    throw new Error('Missing Calc3D security middleware definition');
  }

  const result = structuredClone(config);
  result.http.middlewares ??= {};
  result.http.middlewares[CALC3D_SECURITY_MIDDLEWARE] = policy(mode);
  if (refs === 0) result.http.routers[key].middlewares.push(CALC3D_SECURITY_MIDDLEWARE);
  return result;
}
