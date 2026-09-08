import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, sampleEntry, owner, googleMock, origin } from './holiday-helpers.mjs';
import { saveEntry, publicHours, listEntries } from '../worker/holiday-hours.mjs';
import { validateEntry, storeTimeToUTC, bannerState, googlePeriod } from '../worker/holiday-utils.mjs';
import { processGoogleJobs, mergeSpecialHours, selectLocation, withGoogleLock } from '../worker/google-business.mjs';
import { digest, encryptToken, decryptToken, randomToken, verifyIdentity, bytesToBase64, googleJSON } from '../worker/google-oauth.mjs';
import { finishOAuth, session } from '../worker/admin-auth.mjs';
import { getSeasonalOccasion } from '../seasonal-logo.js';
import { activeBanners } from '../holiday-banner.js';

test('Central schedule converts summer/winter correctly and rejects DST gaps and repeats', () => {
  assert.equal(storeTimeToUTC('2026-07-04T09:00'),'2026-07-04T14:00:00.000Z');
  assert.equal(storeTimeToUTC('2026-12-25T09:00'),'2026-12-25T15:00:00.000Z');
  for (const date of ['2026-03-08T02:30','2026-11-01T01:30','2026-02-30T12:00','2026-07-04T24:00']) assert.throws(() => storeTimeToUTC(date));
});
test('banner start is inclusive and stop is exclusive, independent of store dates', () => {
  const row = { state: 'published', banner_enabled: 1, starts_at: '2026-11-20T15:00:00.000Z', ends_at: '2026-11-28T00:00:00.000Z' };
  assert.equal(bannerState(row,Date.parse(row.starts_at)-1),'scheduled');
  assert.equal(bannerState(row,Date.parse(row.starts_at)),'showing');
  assert.equal(bannerState(row,Date.parse(row.ends_at)),'ended');
  assert.equal(bannerState({...row,banner_enabled:0}),'disabled');
  assert.equal(bannerState({...row,state:'draft'}),'draft');
  const banners = [{ id:'one',startsAt:row.starts_at,endsAt:row.ends_at }];
  assert.equal(activeBanners(banners,Date.parse(row.ends_at)).length,0);
  assert.equal(activeBanners(banners,Date.parse(row.starts_at)).length,1);
});
test('special dates validate closed/open, real dates, duplicates, options, and reversed times', () => {
  assert.equal(validateEntry(sampleEntry()).dates[0].opens,null);
  for (const dates of [[],[{date:'2099-02-29',closed:true}],[{date:'2099-11-26',closed:'yes'}],
    [{date:'2099-11-26',closed:false,opens:'17:00',closes:'10:00'}],
    [{date:'2099-11-26',closed:false,opens:'10:00',closes:'10:00'}],
    [{date:'2099-11-26',closed:true},{date:'2099-11-26',closed:true}]]) assert.throws(() => validateEntry(sampleEntry({dates})));
  assert.throws(() => validateEntry(sampleEntry({endsAt:'2099-11-01T09:00'})));
  assert.throws(() => validateEntry(sampleEntry({bannerEnabled:'true'})));
  assert.throws(() => validateEntry(sampleEntry({animation:'invalid'})));
  assert.doesNotThrow(() => validateEntry(sampleEntry({bannerEnabled:false,startsAt:'',endsAt:'',message:''})));
});
test('public data excludes drafts, removed entries, internal names, staff and sync errors', async () => {
  const s=await setup(), id=crypto.randomUUID();
  await saveEntry(s.env,id,sampleEntry({name:'SECRET INTERNAL',googleHours:true}),owner);
  const data=await publicHours(s.env,Date.parse('2099-11-21T12:00Z'));
  assert.equal(data.banners.length,1); assert.equal(data.specialHours[0].closed,true);
  assert.ok(!JSON.stringify(data).includes('SECRET INTERNAL')); assert.ok(!JSON.stringify(data).includes(owner.email));
  await saveEntry(s.env,id,sampleEntry({version:1,state:'draft'}),owner);
  assert.deepEqual((await publicHours(s.env)).specialHours,[]);
  assert.deepEqual((await publicHours(s.env)).banners,[]);
});
test('disabled banners do not disable actual store hours', async () => {
  const s=await setup(); await saveEntry(s.env,crypto.randomUUID(),sampleEntry({bannerEnabled:false}),owner);
  const data=await publicHours(s.env); assert.equal(data.banners.length,0); assert.equal(data.specialHours.length,1);
});
test('conflicting published dates roll back all changes and stale edits are rejected', async () => {
  const s=await setup(), first=crypto.randomUUID(), second=crypto.randomUUID();
  await saveEntry(s.env,first,sampleEntry(),owner);
  await assert.rejects(saveEntry(s.env,second,sampleEntry(),owner),/already covers/);
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM holiday_entries').get().n,1);
  await assert.rejects(saveEntry(s.env,first,sampleEntry(),owner),/Someone changed/);
  await saveEntry(s.env,second,sampleEntry({state:'draft'}),owner);
  await assert.rejects(saveEntry(s.env,second,sampleEntry({version:1}),owner),/already covers/);
  assert.equal(s.db.prepare('SELECT state FROM holiday_entries WHERE id=?').get(second).state,'draft');
  await saveEntry(s.env,first,sampleEntry({version:1,state:'removed'}),owner);
  await saveEntry(s.env,second,sampleEntry({version:1}),owner);
  assert.equal(s.db.prepare('SELECT entry_id FROM holiday_calendar').get().entry_id,second);
});
test('website save survives Google failure and persists a retry status', async () => {
  const s=await setup(),id=crypto.randomUUID(); await s.connect();
  await saveEntry(s.env,id,sampleEntry({googleHours:true}),owner);
  await processGoogleJobs(s.env,{fetchImpl:async()=>{throw Error('secret-token-never-log');}});
  const [entry]=await listEntries(s.env); assert.equal(entry.state,'published'); assert.equal(entry.sync.hours.status,'retry');
  assert.ok(!entry.sync.hours.error.includes('secret-token')); assert.equal((await publicHours(s.env)).specialHours.length,1);
});
test('Google closed and open periods have the official special-hours representation', () => {
  const closed=googlePeriod({date:'2099-11-26',closed:true}); assert.equal(closed.closed,true); assert.equal(closed.openTime,undefined);
  const open=googlePeriod({date:'2099-11-27',closed:false,opens:'10:30',closes:'16:45'}); assert.deepEqual(open.openTime,{hours:10,minutes:30}); assert.deepEqual(open.closeTime,{hours:16,minutes:45});
});
test('hours sync preserves unrelated Google dates and restores originals when disabled', async () => {
  const s=await setup(),id=crypto.randomUUID(); await s.connect();
  const original=googlePeriod({date:'2099-11-26',closed:false,opens:'12:00',closes:'16:00'}), unrelated=googlePeriod({date:'2099-12-24',closed:true});
  const google=googleMock({periods:[original,unrelated]});
  await saveEntry(s.env,id,sampleEntry({googleHours:true}),owner); await processGoogleJobs(s.env,google);
  assert.equal(google.periods.length,2); assert.equal(google.periods[0].closed,true);
  await saveEntry(s.env,id,sampleEntry({version:1,googleHours:false}),owner); await processGoogleJobs(s.env,google);
  assert.deepEqual(google.periods,[original,unrelated]); assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM holiday_google_dates').get().n,0);
  assert.equal((await listEntries(s.env))[0].sync.hours.status,'removed');
});
test('all published Google hours are reconciled together and an edit removes old owned dates', async () => {
  const s=await setup(); await s.connect(); const a=crypto.randomUUID(),b=crypto.randomUUID(),google=googleMock();
  await saveEntry(s.env,a,sampleEntry({googleHours:true}),owner);
  await saveEntry(s.env,b,sampleEntry({googleHours:true,dates:[{date:'2099-12-25',closed:true}]}),owner);
  await processGoogleJobs(s.env,google); assert.equal(google.periods.length,2);
  await saveEntry(s.env,a,sampleEntry({version:1,googleHours:true,dates:[{date:'2099-11-27',closed:false,opens:'10:00',closes:'14:00'}]}),owner);
  await processGoogleJobs(s.env,google); assert.equal(google.periods.length,2); assert.equal(google.periods[0].startDate.day,27);
});
test('overlapping overnight Google periods fail without overwriting other hours', () => {
  const period={startDate:{year:2099,month:11,day:25},endDate:{year:2099,month:11,day:26},openTime:{hours:20},closeTime:{hours:2}};
  assert.throws(()=>mergeSpecialHours([period],[{date:'2099-11-26',closed:true}],[]),/overnight/);
});
test('post retries reuse the same post, updates patch it, removal deletes it', async () => {
  const s=await setup(),id=crypto.randomUUID(),google=googleMock(); await s.connect();
  await saveEntry(s.env,id,sampleEntry({googlePost:true}),owner); await processGoogleJobs(s.env,google);
  assert.equal(google.created,1); assert.equal((await listEntries(s.env))[0].sync.post.status,'published');
  s.db.prepare("UPDATE holiday_sync_jobs SET status='pending',next_at=0").run(); await processGoogleJobs(s.env,google); assert.equal(google.created,1);
  await saveEntry(s.env,id,sampleEntry({version:1,googlePost:true,message:'Updated hours'}),owner); await processGoogleJobs(s.env,google);
  assert.equal(google.created,1); assert.equal([...google.posts.values()][0].summary,'Updated hours');
  await saveEntry(s.env,id,sampleEntry({version:2,googlePost:true,state:'removed'}),owner); await processGoogleJobs(s.env,google); assert.equal(google.posts.size,0);
});
test('a lost create response is reconciled by its stable marker without duplicate posts', async () => {
  const s=await setup(),id=crypto.randomUUID(),google=googleMock({postFailure:()=>{throw Error('lost response');}}); await s.connect();
  await saveEntry(s.env,id,sampleEntry({googlePost:true}),owner); await processGoogleJobs(s.env,google);
  assert.equal((await listEntries(s.env))[0].sync.post.status,'uncertain');
  s.db.prepare("UPDATE holiday_sync_jobs SET status='pending',next_at=0").run(); await processGoogleJobs(s.env,google);
  assert.equal(google.created,1); assert.equal((await listEntries(s.env))[0].sync.post.status,'published');
});
test('an uncertain create missing from Google is not automatically retried', async () => {
  const s=await setup(),id=crypto.randomUUID(),google=googleMock({postFailure:()=>{throw Error();}}); await s.connect();
  await saveEntry(s.env,id,sampleEntry({googlePost:true}),owner); await processGoogleJobs(s.env,google); google.posts.clear();
  s.db.prepare("UPDATE holiday_sync_jobs SET status='pending',next_at=0").run(); await processGoogleJobs(s.env,google);
  assert.equal(google.created,1); assert.equal((await listEntries(s.env))[0].sync.post.status,'uncertain');
});
test('unsupported Google posts do not block hours sync or website publication', async () => {
  const s=await setup(),id=crypto.randomUUID(),google=googleMock({canPost:false}); await s.connect();
  await saveEntry(s.env,id,sampleEntry({googlePost:true,googleHours:true}),owner); await processGoogleJobs(s.env,google);
  const [entry]=await listEntries(s.env); assert.equal(entry.sync.hours.status,'synced'); assert.equal(entry.sync.post.status,'unsupported'); assert.equal(entry.state,'published');
});
test('Google job leases prevent overlapping syncs and location changes do not strand data', async () => {
  const s=await setup(),id=crypto.randomUUID(),google=googleMock(); await s.connect(); await saveEntry(s.env,id,sampleEntry({googleHours:true}),owner);
  s.db.prepare('UPDATE holiday_google_connection SET lock_until=?').run(Math.floor(Date.now()/1000)+60); await processGoogleJobs(s.env,google); assert.equal(google.calls.length,0);
  s.db.prepare('UPDATE holiday_google_connection SET lock_until=0').run(); await processGoogleJobs(s.env,google);
  await assert.rejects(selectLocation(s.env,'accounts/1','locations/3',google.fetchImpl),/Turn off/);
});
test('long Google scans renew their lease and a lost lease prevents further requests', async t => {
  const s=await setup(); let clock=Date.now(), requests=0;
  t.mock.method(Date,'now',()=>clock);
  await withGoogleLock(s.env, async (_, guard) => {
    const fetchImpl=guard(async()=>{ requests++; return Response.json({}); });
    for (let page=0;page<6;page++) {
      clock+=90000;
      await fetchImpl('https://mybusiness.googleapis.com/v4/accounts/1/locations/2/localPosts');
      await assert.rejects(withGoogleLock(s.env,async()=>{}),/already running/);
    }
    s.db.prepare('UPDATE holiday_google_connection SET lock_token=?').run('new-holder');
    await assert.rejects(fetchImpl('https://mybusiness.googleapis.com/v4/accounts/1/locations/2/localPosts'),/interrupted/);
  });
  assert.equal(requests,6);
  assert.equal(s.db.prepare('SELECT lock_token FROM holiday_google_connection').get().lock_token,'new-holder');
});
test('admin endpoints reject unauthenticated and cross-origin requests, never expose tokens', async () => {
  const s=await setup(); await s.connect();
  for (const path of ['/api/admin/holidays','/api/admin/google','/api/admin/staff']) assert.equal((await s.request(path,'GET',undefined,{Cookie:''})).status,401);
  assert.equal((await s.request(`/api/admin/holidays/${crypto.randomUUID()}`,'PUT',sampleEntry(),{Origin:'https://evil.example'})).status,403);
  assert.equal((await s.request('/api/admin/staff','POST',null)).status,400);
  const value=await (await s.request('/api/admin/google')).text(); assert.ok(!value.includes('refresh')); assert.ok(!value.includes('fixture'));
});
test('invites grant only the named Google identity, failed emails are reported, revocation ends sessions', async () => {
  const s=await setup();
  const res=await s.request('/api/admin/staff','POST',{email:'staff@example.com'}); assert.equal(res.status,200); assert.equal(s.emails.length,1);
  assert.equal((await s.request('/api/admin/staff','POST',{email:'staff@example.com'})).status,409); assert.equal(s.emails.length,1);
  const token=randomToken(); s.db.prepare('INSERT INTO holiday_admin_sessions VALUES(?,?,?)').run(await digest(token),'staff@example.com',Math.floor(Date.now()/1000)+60);
  assert.equal((await s.request('/api/admin/holidays','GET',undefined,{Cookie:`__Host-cpc_admin=${token}`})).status,200);
  await s.request('/api/admin/staff/revoke','POST',{email:'staff@example.com'});
  assert.equal((await s.request('/api/admin/holidays','GET',undefined,{Cookie:`__Host-cpc_admin=${token}`})).status,401);
  s.env.ADMIN_EMAIL.send=async()=>{throw Error('private provider error');};
  await s.request('/api/admin/staff','POST',{email:'second@example.com'});
  const row=s.db.prepare('SELECT * FROM holiday_staff WHERE email=?').get('second@example.com'); assert.equal(row.email_status,'failed'); assert.ok(!row.email_error.includes('private provider'));
});
test('tokens are encrypted at rest with authentication and wrong keys fail closed', async () => {
  const s=await setup(), encrypted=await encryptToken(s.env,'secret-refresh'); assert.ok(!encrypted.includes('secret-refresh'));
  assert.equal(await decryptToken(s.env,encrypted),'secret-refresh'); await assert.rejects(decryptToken({...s.env,GOOGLE_TOKEN_ENCRYPTION_KEY:randomToken()},encrypted));
});
test('Google HTTP requests use Workers-compatible redirect handling and never follow another host', async () => {
  let requests=0;
  await assert.rejects(googleJSON('https://oauth2.googleapis.com/token',{method:'POST',body:'fixture'},async(url,options)=>{
    requests++;
    assert.equal(options.redirect,'manual');
    return Response.redirect('https://untrusted.example/token',307);
  }),error=>error.code==='redirect');
  assert.equal(requests,1);
});
test('OAuth state is browser-bound, single-use, scoped separately, and uses PKCE', async () => {
  const s=await setup(); const login=await s.request('/api/admin/auth/login'); assert.equal(login.status,302);
  const auth=new URL(login.headers.get('location')); assert.equal(auth.searchParams.get('scope'),'openid email'); assert.equal(auth.searchParams.get('code_challenge_method'),'S256');
  const url=`${origin}/api/admin/oauth/callback?state=${auth.searchParams.get('state')}&code=fixture`;
  await assert.rejects(finishOAuth(new Request(url),s.env),/expired/);
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const cancel=new Request(url+'&error=access_denied',{headers:{Cookie:cookie}});
  assert.equal((await finishOAuth(cancel,s.env)).status,303); await assert.rejects(finishOAuth(cancel,s.env),/expired/);
  const connect=await s.request('/api/admin/google/connect','POST'); const connectUrl=new URL((await connect.json()).url);
  assert.equal(connectUrl.searchParams.get('scope'),'https://www.googleapis.com/auth/business.manage'); assert.equal(connectUrl.searchParams.get('access_type'),'offline');
});
test('Google identity requires a valid signature, issuer, audience, nonce and verified email', async () => {
  const s=await setup(),pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey); jwk.kid='fixture'; const nonce=randomToken();
  const sign=async extra=>{
    const enc=value=>bytesToBase64(new TextEncoder().encode(JSON.stringify(value)));
    const content=`${enc({alg:'RS256',kid:'fixture'})}.${enc({iss:'https://accounts.google.com',aud:s.env.GOOGLE_CLIENT_ID,nonce,email:owner.email,email_verified:true,sub:'one',exp:Date.now()/1000+300,iat:Date.now()/1000,...extra})}`;
    return `${content}.${bytesToBase64(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(content))))}`;
  };
  const fetchImpl=async()=>Response.json({keys:[jwk]}); assert.equal(await verifyIdentity(await sign({}),s.env,nonce,fetchImpl),owner.email);
  for (const claims of [{aud:'evil'},{iss:'evil'},{nonce:'bad'},{email_verified:false},{exp:1}]) await assert.rejects(verifyIdentity(await sign(claims),s.env,nonce,fetchImpl));
  const token=await sign({}); await assert.rejects(verifyIdentity(token.slice(0,-20)+'tampered',s.env,nonce,fetchImpl));
});
test('staff sessions remain usable without Google and owner removal from config revokes access', async () => {
  const s=await setup(); assert.equal((await s.request('/api/admin/session')).status,200);
  s.env.ADMIN_EMAILS='someoneelse@example.com'; assert.equal(await session(new Request(origin,{headers:{Cookie:`__Host-cpc_admin=${s.token}`}}),s.env),null);
});
test('weather animation is explicit and leaves normal seasonal dates intact', () => {
  assert.equal(getSeasonalOccasion(new Date('2026-09-08T18:00:00Z')),null);
  assert.equal(getSeasonalOccasion(new Date('2026-09-08T18:00:00Z'),'snow-closure').effect,'ice-snow');
  assert.equal(getSeasonalOccasion(new Date('2026-12-25T18:00:00Z')).effect,'snow');
  assert.equal(getSeasonalOccasion(new Date('2026-12-25T18:00:00Z'),'off'),null);
});
