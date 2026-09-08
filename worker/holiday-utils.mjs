export const STORE_TIME_ZONE = 'America/Chicago';
export class HolidayError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const fail = (status, message) => { throw new HolidayError(status, message); };
export const nowSeconds = () => Math.floor(Date.now() / 1000);
export const query = (env, sql, ...args) => env.INTAKE_DB.prepare(sql).bind(...args);
export const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer', ...extra },
});
const parts = new Intl.DateTimeFormat('en-CA', {
  timeZone: STORE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
export function localDateTime(value) {
  const p = Object.fromEntries(parts.formatToParts(new Date(value)).map(part => [part.type, part.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export const storeToday = (now = Date.now()) => localDateTime(now).slice(0, 10);
export const validDate = value => typeof value === 'string' && /^20\d\d-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
// Input is explicitly STORE time, regardless of the administrator's device zone.
// Reject skipped/repeated DST clock times instead of silently changing the schedule.
export function storeTimeToUTC(value) {
  if (typeof value !== 'string' || !/^20\d\d-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(value) || !validDate(value.slice(0, 10))) {
    fail(400, 'Enter a valid date and time in Central time.');
  }
  const wall = Date.parse(`${value}:00Z`);
  const candidates = [5, 6].map(offset => wall + offset * 3600000).filter(time => localDateTime(time) === value);
  if (candidates.length !== 1) fail(400, 'That Central time is skipped or repeated by daylight saving time. Choose another time.');
  return new Date(candidates[0]).toISOString();
}
const field = (value, max, label) => {
  if (typeof value !== 'string' || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) fail(400, `Check ${label} (maximum ${max} characters).`);
  return value.trim();
};
export function validateEntry(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Check the holiday entry.');
  const name = field(body.name, 120, 'the internal name');
  const message = field(body.message, 1500, 'the banner message');
  if (!name) fail(400, 'Enter an internal name.');
  const animation = body.animation || 'automatic';
  if (!['automatic','off','snow-closure','new-year','valentines-day','st-patricks-day','earth-day','independence-day','halloween','winter-holidays','easter','mothers-day','fathers-day','thanksgiving'].includes(animation)) fail(400, 'Choose a valid logo animation.');
  for (const key of ['bannerEnabled', 'googleHours', 'googlePost']) if (typeof body[key] !== 'boolean') fail(400, 'Check the publishing options.');
  if ((body.bannerEnabled || body.googlePost) && !message) fail(400, 'Enter an announcement message.');
  const startsAt = body.startsAt ? storeTimeToUTC(body.startsAt) : null;
  const endsAt = body.endsAt ? storeTimeToUTC(body.endsAt) : null;
  if ((startsAt === null) !== (endsAt === null) || (body.bannerEnabled && !startsAt)) fail(400, 'Set both banner start and stop times.');
  if (startsAt && startsAt >= endsAt) fail(400, 'The banner must stop after it starts.');
  if (!Array.isArray(body.dates) || !body.dates.length || body.dates.length > 60) fail(400, 'Add between 1 and 60 affected dates.');
  const seen = new Set();
  const dates = body.dates.map(day => {
    if (!day || !validDate(day.date)) fail(400, 'Enter a valid affected date.');
    if (seen.has(day.date)) fail(400, 'Each affected date can only be listed once.');
    seen.add(day.date);
    if (typeof day.closed !== 'boolean') fail(400, 'Choose Closed or Special hours for each date.');
    if (day.closed) return { date: day.date, closed: true, opens: null, closes: null };
    const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
    if (!time.test(day.opens || '') || !time.test(day.closes || '') || day.opens >= day.closes) {
      fail(400, 'Opening time must be before closing time on the same date.');
    }
    return { date: day.date, closed: false, opens: day.opens, closes: day.closes };
  }).sort((a, b) => a.date.localeCompare(b.date));
  if (!['draft', 'published', 'removed'].includes(body.state)) fail(400, 'Choose Draft or Published.');
  return { name, message, animation, bannerEnabled: body.bannerEnabled, startsAt, endsAt, dates,
    googleHours: body.googleHours, googlePost: body.googlePost, state: body.state };
}
export function bannerState(entry, now = Date.now()) {
  if (entry.state !== 'published') return entry.state;
  if (!entry.banner_enabled) return 'disabled';
  if (now < Date.parse(entry.starts_at)) return 'scheduled';
  if (now >= Date.parse(entry.ends_at)) return 'ended';
  return 'showing';
}
export const dateObject = value => {
  const [year, month, day] = value.split('-').map(Number); return { year, month, day };
};
export const dateKey = value => value ? `${value.year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}` : '';
export function googlePeriod(day) {
  const base = { startDate: dateObject(day.date), endDate: dateObject(day.date), closed: Boolean(day.closed) };
  if (day.closed) return base;
  const time = value => { const [hours, minutes] = value.split(':').map(Number); return { hours, minutes }; };
  return { ...base, openTime: time(day.opens), closeTime: time(day.closes) };
}
