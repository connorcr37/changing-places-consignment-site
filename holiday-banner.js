// Database-backed announcements. No Google requests or credentials reach this module.
import { setupSeasonalLogo, getSeasonalOccasion } from './seasonal-logo.js?v=20260908-1';

export function activeBanners(banners, now) {
  return banners.filter(item => Date.parse(item.startsAt) <= now && now < Date.parse(item.endsAt))
    .sort((a,b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id));
}
export function setupHolidayHours() {
  const slots = [...document.querySelectorAll('[data-holiday-banner]')];
  const hours = [...document.querySelectorAll('[data-special-hours]')];
  const logo = document.querySelector('.header-flex .logo-img');
  if (!slots.length && !hours.length && !logo) return;
  let data = { banners: [], specialHours: [] }, anchor = Date.now(), measured = performance.now();
  let boundary, signature = '', animationKey, stopAnimation, animationRun = 0, fetching = false;
  const clock = () => anchor + performance.now() - measured;
  const dayFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const dateFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' });
  const timeLabel = value => { const [h,m] = value.split(':').map(Number); return `${h % 12 || 12}${m ? `:${String(m).padStart(2,'0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`; };
  const render = () => {
    clearTimeout(boundary);
    const now = clock(), active = activeBanners(data.banners, now);
    const newSignature = JSON.stringify(active);
    if (signature !== newSignature) {
      signature = newSignature;
      slots.forEach(slot => {
        slot.replaceChildren(...active.map(item => { const p = document.createElement('p'); p.textContent = item.message; return p; }));
        slot.hidden = !active.length;
      });
    }
    const today = dateFormat.format(new Date(now));
    hours.forEach(slot => {
      const days = data.specialHours.filter(day => day.date >= today);
      slot.replaceChildren(); slot.hidden = !days.length;
      if (days.length) { const title = document.createElement('strong'); title.textContent = 'Upcoming special hours'; slot.append(title); }
      days.forEach(day => {
        const p = document.createElement('p');
        p.textContent = `${dayFormat.format(new Date(`${day.date}T18:00:00Z`))}: ${day.closed ? 'Closed' : `${timeLabel(day.opens)}–${timeLabel(day.closes)}`}`;
        slot.append(p);
      });
    });
    const override = [...active].reverse().find(item => item.animation && item.animation !== 'automatic');
    const preview = new URLSearchParams(location.search).get('logo-flair');
    let occasion = getSeasonalOccasion(new Date(now), preview || override?.animation || null);
    if (occasion && override && !preview) occasion = { ...occasion, id: `${occasion.id}:${override.id}`, preview: false };
    const key = occasion ? `${occasion.id}:${occasion.year}` : 'off';
    if (logo && key !== animationKey) {
      animationKey = key; stopAnimation?.(); const run = ++animationRun;
      setupSeasonalLogo(logo, { occasion }).then(stop => { if (run !== animationRun) stop?.(); else stopAnimation = stop; }).catch(() => {});
    }
    const next = data.banners.flatMap(item => [Date.parse(item.startsAt), Date.parse(item.endsAt)]).filter(time => time > now);
    // Local timers honor known boundaries even if the next refresh fails.
    boundary = window.setTimeout(render, Math.max(20, Math.min(60000, ...next.map(time => time - now))));
  };
  const refresh = async () => {
    if (fetching) return;
    fetching = true;
    try {
      const response = await fetch('/api/holiday-hours', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw Error();
      const value = await response.json();
      if (!Array.isArray(value.banners) || !Array.isArray(value.specialHours) || !Number.isFinite(Date.parse(value.serverNow))) throw Error();
      if (value.banners.some(item => typeof item.id !== 'string' || typeof item.message !== 'string' || !Number.isFinite(Date.parse(item.startsAt)) || !Number.isFinite(Date.parse(item.endsAt)))) throw Error();
      if (value.specialHours.some(day => !/^20\d\d-\d{2}-\d{2}$/.test(day.date) || typeof day.closed !== 'boolean' || (!day.closed && (!/^\d{2}:\d{2}$/.test(day.opens) || !/^\d{2}:\d{2}$/.test(day.closes))))) throw Error();
      data = value; anchor = Date.parse(value.serverNow); measured = performance.now();
    } catch { /* Preserve the last confirmed schedule and still stop expired banners. */ }
    finally { fetching = false; render(); }
  };
  refresh();
  window.setInterval(() => { if (!document.hidden) refresh(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); refresh(); } });
}
