import assert from 'node:assert/strict';
import test from 'node:test';
import * as securityHeaders from '../deploy/security-headers.mjs';

const { hardenCalc3dTraefik, CALC3D_SECURITY_MIDDLEWARE } = securityHeaders;

const httpKey = 'app-quantify-haptic-protocol-bgo9ro-router-13';
const httpsKey = 'app-quantify-haptic-protocol-bgo9ro-router-websecure-13';
const serviceKey = 'app-quantify-haptic-protocol-bgo9ro-service-13';
const hostRule = 'Host(`calc3d.tbema.net`)';
const expectedCsp = "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'self' https://sp-dev.tbema.net wss://sp-dev.tbema.net; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";

function config() {
  return {
    tcp: { routers: { untouched: { rule: 'HostSNI(`other.example`)' } } },
    http: {
      routers: {
        [httpKey]: { rule: hostRule, service: serviceKey, middlewares: ['redirect-to-https'], entryPoints: ['web'] },
        [httpsKey]: { rule: hostRule, service: serviceKey, middlewares: [], entryPoints: ['websecure'], tls: { certResolver: 'letsencrypt' }, priority: 8 },
        foreign: { rule: 'Host(`other.example`)', service: 'other-service', middlewares: ['foreign-header'], entryPoints: ['websecure'], tls: {} },
      },
      middlewares: { 'redirect-to-https': { redirectScheme: { scheme: 'https' } }, 'foreign-header': { headers: { customResponseHeaders: { 'X-Other': 'kept' } } } },
      services: { [serviceKey]: { loadBalancer: { servers: [{ url: 'http://app-quantify-haptic-protocol-bgo9ro:80' }], passHostHeader: true } }, 'other-service': { loadBalancer: { servers: [{ url: 'http://other:80' }] } } },
    },
  };
}

function expectedHeaders(mode) {
  return {
    ...(mode === 'report-only' ? { contentSecurityPolicyReportOnly: expectedCsp } : { contentSecurityPolicy: expectedCsp }),
    contentTypeNosniff: true,
    frameDeny: true,
    referrerPolicy: 'no-referrer',
    permissionsPolicy: 'camera=(), microphone=(), geolocation=()',
    stsSeconds: 300,
    stsIncludeSubdomains: false,
    stsPreload: false,
  };
}

test('report-only policy is exact and only the Calc3D HTTPS router receives it', () => {
  const input = config();
  const before = structuredClone(input);
  const output = hardenCalc3dTraefik(input);
  assert.deepEqual(input, before);
  assert.notStrictEqual(output, input);
  assert.deepEqual(output.http.middlewares[CALC3D_SECURITY_MIDDLEWARE], { headers: expectedHeaders('report-only') });
  assert.deepEqual(output.http.routers[httpsKey], { ...input.http.routers[httpsKey], middlewares: [CALC3D_SECURITY_MIDDLEWARE] });
  assert.deepEqual(output.http.routers[httpKey], input.http.routers[httpKey]);
  assert.deepEqual(output.http.routers.foreign, input.http.routers.foreign);
  assert.deepEqual(output.http.services, input.http.services);
  assert.deepEqual(output.tcp, input.tcp);
  assert.deepEqual(output.http.middlewares['redirect-to-https'], input.http.middlewares['redirect-to-https']);
  assert.deepEqual(output.http.middlewares['foreign-header'], input.http.middlewares['foreign-header']);
  assert.doesNotMatch(JSON.stringify(expectedHeaders('report-only')), /unsafe-inline|unsafe-eval|\*|report-uri|report-to/);
});

test('enforce uses only the enforced CSP field and preserves existing HTTPS middleware', () => {
  const input = config();
  input.http.routers[httpsKey].middlewares = ['foreign-header'];
  const before = structuredClone(input);
  const output = hardenCalc3dTraefik(input, { mode: 'enforce' });
  assert.deepEqual(input, before);
  assert.deepEqual(output.http.routers[httpsKey].middlewares, ['foreign-header', CALC3D_SECURITY_MIDDLEWARE]);
  assert.deepEqual(output.http.middlewares[CALC3D_SECURITY_MIDDLEWARE].headers, expectedHeaders('enforce'));
  assert.equal('contentSecurityPolicyReportOnly' in output.http.middlewares[CALC3D_SECURITY_MIDDLEWARE].headers, false);
});

test('repeat application and known report-only/enforce transitions do not duplicate references', () => {
  const report = hardenCalc3dTraefik(config());
  assert.deepEqual(hardenCalc3dTraefik(report), report);
  const enforced = hardenCalc3dTraefik(report, { mode: 'enforce' });
  assert.deepEqual(enforced.http.routers[httpsKey].middlewares, [CALC3D_SECURITY_MIDDLEWARE]);
  assert.deepEqual(enforced.http.middlewares[CALC3D_SECURITY_MIDDLEWARE].headers, expectedHeaders('enforce'));
  assert.deepEqual(hardenCalc3dTraefik(enforced, { mode: 'enforce' }), enforced);
  assert.deepEqual(hardenCalc3dTraefik(enforced, { mode: 'report-only' }), report);
  assert.deepEqual(report.http.middlewares[CALC3D_SECURITY_MIDDLEWARE].headers, expectedHeaders('report-only'));
});

test('missing, ambiguous, and foreign-host HTTPS targets fail without altering input', () => {
  for (const mutate of [
    (value) => { delete value.http.routers[httpsKey]; },
    (value) => { value.http.routers.another = { ...value.http.routers[httpsKey] }; },
    (value) => { value.http.routers[httpsKey].rule = 'Host(`other.example`)'; },
    (value) => { value.http.routers[httpsKey].entryPoints = ['web']; },
    (value) => { value.http.routers[httpsKey].tls = undefined; },
  ]) {
    const input = config();
    mutate(input);
    const before = structuredClone(input);
    assert.throws(() => hardenCalc3dTraefik(input), /Calc3D HTTPS router/);
    assert.deepEqual(input, before);
  }
});

test('invalid mode and malformed config fail without mutation', () => {
  for (const input of [config(), {}, { http: { routers: [], middlewares: {}, services: {} } }, null]) {
    const before = structuredClone(input);
    assert.throws(() => hardenCalc3dTraefik(input, { mode: 'disabled' }), /mode/);
    assert.deepEqual(input, before);
  }
  for (const input of [{}, { http: { routers: [], middlewares: {}, services: {} } }, { http: { routers: { [httpsKey]: config().http.routers[httpsKey] }, middlewares: [], services: {} } }]) {
    const before = structuredClone(input);
    assert.throws(() => hardenCalc3dTraefik(input), /config/);
    assert.deepEqual(input, before);
  }
});

test('native config without middleware dictionary adds it only on the detached output', () => {
  const input = config();
  delete input.http.middlewares;
  const before = structuredClone(input);
  const output = hardenCalc3dTraefik(input);
  assert.deepEqual(input, before);
  assert.equal(Object.hasOwn(input.http, 'middlewares'), false);
  assert.deepEqual(output.http.middlewares, { [CALC3D_SECURITY_MIDDLEWARE]: { headers: expectedHeaders('report-only') } });
  assert.deepEqual(output.http.routers[httpsKey].middlewares, [CALC3D_SECURITY_MIDDLEWARE]);
  assert.deepEqual(output.http.routers[httpKey], input.http.routers[httpKey]);
  assert.deepEqual(output.http.services, input.http.services);
  assert.deepEqual(hardenCalc3dTraefik(output), output);
  for (const middlewares of [null, [], 'invalid']) {
    const invalid = structuredClone(input);
    invalid.http.middlewares = middlewares;
    const snapshot = structuredClone(invalid);
    assert.throws(() => hardenCalc3dTraefik(invalid), /config/);
    assert.deepEqual(invalid, snapshot);
  }
});

function domain() {
  return {
    domainId: 'NrgBtIZ2HgKnLGXKERzNo',
    host: 'calc3d.tbema.net',
    applicationId: 'YYhCRbv7263_nwsWYnmZv',
    domainType: 'application',
    https: true,
    customEntrypoint: null,
    middlewares: [],
    path: '/', port: 80, enabled: true,
  };
}

test('native Calc3D domain reference retains prior names, is detached and idempotent', () => {
  const domainMiddlewares = securityHeaders.calc3dDomainMiddlewares;
  assert.equal(typeof domainMiddlewares, 'function');
  const input = domain();
  input.middlewares = ['existing-auth', 'existing-rate-limit'];
  const before = structuredClone(input);
  const refs = domainMiddlewares(input);
  assert.deepEqual(refs, ['existing-auth', 'existing-rate-limit', CALC3D_SECURITY_MIDDLEWARE]);
  assert.deepEqual(input, before);
  assert.notStrictEqual(refs, input.middlewares);
  const updated = { ...input, middlewares: refs };
  assert.deepEqual(domainMiddlewares(updated), refs);
  assert.deepEqual(updated.path, input.path);
  assert.deepEqual(updated.port, input.port);
});

test('domain reference rejects foreign or invalid native records without mutation', () => {
  const domainMiddlewares = securityHeaders.calc3dDomainMiddlewares;
  assert.equal(typeof domainMiddlewares, 'function');
  for (const mutate of [
    (value) => { value.domainId = 'other-domain'; },
    (value) => { value.host = 'other.example'; },
    (value) => { value.applicationId = 'other-app'; },
    (value) => { value.domainType = 'compose'; },
    (value) => { value.https = false; },
    (value) => { value.customEntrypoint = 'web'; },
    (value) => { value.middlewares = null; },
    (value) => { value.middlewares = ['valid', 42]; },
    (value) => { value.middlewares = [CALC3D_SECURITY_MIDDLEWARE, CALC3D_SECURITY_MIDDLEWARE]; },
  ]) {
    const input = domain();
    mutate(input);
    const before = structuredClone(input);
    assert.throws(() => domainMiddlewares(input), /Calc3D domain/);
    assert.deepEqual(input, before);
  }
});

test('unexpected own middleware definition or foreign reference fails closed', () => {
  for (const mutate of [
    (value) => { value.http.middlewares[CALC3D_SECURITY_MIDDLEWARE] = { headers: { contentSecurityPolicy: "default-src *" } }; },
    (value) => { value.http.middlewares[CALC3D_SECURITY_MIDDLEWARE] = { headers: expectedHeaders('report-only'), extra: true }; },
    (value) => { value.http.routers.foreign.middlewares.push(CALC3D_SECURITY_MIDDLEWARE); },
  ]) {
    const input = config();
    mutate(input);
    const before = structuredClone(input);
    assert.throws(() => hardenCalc3dTraefik(input), /middleware/);
    assert.deepEqual(input, before);
  }
});
