const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
// PostgreSQL timestamptz has microsecond precision; Date.parse alone loses the final three digits.
// Parse a bounded PostgREST ISO timestamp and retain its original string for the RPC cursor.
export function auditInstant(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, fraction = '', zone, sign, zoneHour, zoneMinute] = match;
  const offsetHour = zone === 'Z' ? 0 : Number(zoneHour);
  const offsetMinute = zone === 'Z' ? 0 : Number(zoneMinute);
  if (offsetHour > 14 || (offsetHour === 14 && offsetMinute !== 0)) return null;
  const offset = zone === 'Z' ? 0 : (sign === '+' ? 1 : -1) * (offsetHour * 60 + offsetMinute);
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  const local = new Date(milliseconds + offset * 60000);
  if (local.getUTCFullYear() !== Number(year) || local.getUTCMonth() + 1 !== Number(month) ||
      local.getUTCDate() !== Number(day) || local.getUTCHours() !== Number(hour) ||
      local.getUTCMinutes() !== Number(minute) || local.getUTCSeconds() !== Number(second)) return null;
  return BigInt(milliseconds) * 1000n + BigInt(fraction.padEnd(6, '0').slice(3) || '0');
}
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 254;
const email = value => text(value) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const optionalText = value => value === null || text(value);
const invalid = () => new Error('Respuesta de acceso inválida.');
export const validId = value => typeof value === 'string' && uuid.test(value);
export const validRevision = value => Number.isSafeInteger(value) && value >= 0;
export const validCursor = value => value && typeof value === 'object' && auditInstant(value.occurred_at) !== null && validId(value.id);

export function requestRow(value) {
  if (!value || !validId(value.id) || !validId(value.user_id) || !email(value.email) ||
      !['pending', 'approved', 'rejected'].includes(value.status) || !validRevision(value.revision) ||
      !timestamp(value.created_at) || !timestamp(value.updated_at) ||
      !(value.reviewed_at === null || timestamp(value.reviewed_at))) throw invalid();
  return { id: value.id, user_id: value.user_id, email: value.email, status: value.status,
    revision: value.revision, created_at: value.created_at, updated_at: value.updated_at, reviewed_at: value.reviewed_at };
}
export function requestDecision(value) {
  if (!value || !['pending', 'approved', 'rejected', 'authorized', 'revoked'].includes(value.state) ||
      (value.request === null ? !['authorized', 'revoked'].includes(value.state) : !value.request)) throw invalid();
  const request = value.request === null ? null : requestRow(value.request);
  if (request && request.status !== value.state) throw invalid();
  return { state: value.state, request };
}
export function auditRow(value) {
  if (!value || !validId(value.id) || auditInstant(value.occurred_at) === null ||
      !(value.actor_id === null || validId(value.actor_id)) || !optionalText(value.actor_email) ||
      !text(value.action) || !text(value.target_type) || !optionalText(value.target_id) ||
      !text(value.outcome) || !optionalText(value.ip_address) || !optionalText(value.country)) throw invalid();
  return { id: value.id, occurred_at: value.occurred_at, actor_id: value.actor_id,
    actor_email: value.actor_email, action: value.action, target_type: value.target_type,
    target_id: value.target_id, outcome: value.outcome, ip_address: value.ip_address, country: value.country };
}
export function rows(data, parse) {
  if (!Array.isArray(data)) throw invalid();
  return data.map(parse);
}
