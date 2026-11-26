'use strict';
/*
  Healing Lounge — 멀티플레이 서버 (접속 + 이동 동기화)
  - 정적 파일(public/)과 WebSocket(/ws)을 한 포트에서 같이 제공합니다.
  - 서버가 이동 속도/범위를 검증해서, 클라이언트가 위치를 조작해도 통하지 않게 합니다.
*/
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const CARS = require('../public/cars.js');
const FILTER = require('./filter.js');
const ZN = require('../public/zones.js');
const DB = require('./db.js');
const AUTH = require('./auth.js');
const ACCT = require('./account.js');
const DAILY = require('../public/daily.js');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

/* ───────── 설정 ───────── */
const CFG = {
  maxPlayersPerRoom: parseInt(process.env.MAX_PLAYERS, 10) || 40, // 방 하나 최대 인원 (무료 서버는 작게)
  tickHz: 10,                 // 서버가 상태를 뿌리는 횟수/초
  maxSpeed: 15,               // m/s — 달리기(약 10.5)보다 여유
  worldRadius: CARS.WORLD_R,   // 걷기·운전 가능 반경(m)
  maxMsgPerSec: 40,           // 접속자 1명이 보낼 수 있는 메시지 수/초
  maxMsgBytes: 512,           // 메시지 최대 크기
  nameMax: 12,
  boardRange: 12,             // 자동차에 탈 수 있는 거리(m)
  idleKickMs: 5 * 60 * 1000,  // 5분 동안 아무 입력도 없으면 연결 종료
};

/* ───────── 정적 파일 ───────── */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.glb': 'model/gltf-binary', '.txt': 'text/plain; charset=utf-8',
};
const server = http.createServer((req, res) => {
  let url;
  try { url = decodeURIComponent((req.url || '/').split('?')[0]); } catch (_) { res.writeHead(400); return res.end(); }
  if (url === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  if (url === '/api/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ rooms: [...rooms.values()].map(r => ({ id: r.id, players: r.players.size })) }));
  }
  if (url.startsWith('/api/auth/')) return handleAuth(req, res, url.slice(10));
  if (url === '/') url = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, url));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }   // 폴더 밖 접근 차단
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('찾을 수 없어요'); }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(data);
  });
});

/* ───────── 회원가입 · 로그인 API ───────── */
function handleAuth(req, res, kind) {
  const H = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  if (req.method !== 'POST' || !['signup', 'login', 'me', 'delete', 'forgot', 'reset', 'setemail'].includes(kind)) { res.writeHead(404, H); return res.end('{"ok":false}'); }
  let size = 0; const chunks = [];
  req.on('data', c => { size += c.length; if (size > 2048) { req.destroy(); } else chunks.push(c); });
  req.on('end', async () => {
    let body; try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch (_) { res.writeHead(400, H); return res.end('{"ok":false,"err":"잘못된 요청이에요"}'); }
    if (!body || typeof body !== 'object') body = {};
    try {
      const r = await AUTH.handle(kind, body, req);
      if (kind === 'reset' && r.json.ok) { const p = online.get(r.json.kick); if (p) { p.acct = null; send(p.ws, { t: 'kicked', m: '비밀번호가 바뀌어서 다시 접속해야 해요' }); p.ws.close(); } delete r.json.kick; }
      if (kind === 'delete' && r.json.ok) { const p = online.get(r.json.deleted); if (p) { p.acct = null; send(p.ws, { t: 'kicked', m: '탈퇴가 완료됐어요' }); p.ws.close(); } delete r.json.deleted; }
      res.writeHead(r.code, H); res.end(JSON.stringify(r.json));
    } catch (e) { console.error('auth 오류', e.message); res.writeHead(500, H); res.end('{"ok":false,"err":"서버에 문제가 생겼어요. 잠시 후 다시 해 주세요"}'); }
  });
}
const online = new Map();                                   // 계정 id -> 접속 중인 플레이어 (한 계정은 한 곳에서만)
const kstDayNum = () => Math.floor((Date.now() + 9 * 3600 * 1000) / 86400000);
function pushState(p, extra) { if (p.acct) { send(p.ws, Object.assign({ t: 'd', s: ACCT.pubState(ACCT.ensureDay(p.acct.sv, kstDayNum())) }, extra || {})); p.acct.push = false; } }
function persist(p) { if (!p.acct) return; p.acct.dirty = false; p.acct.savedAt = Date.now(); DB.saveUser(p.acct.id, p.acct.sv).catch(e => console.error('기록 저장 실패', e.message)); }
function hid(p, id, n) {                                    // 히든 미션 (달성하면 바로 안내 + 저장)
  if (!p.acct) return;
  const msg = ACCT.hidden(p.acct.sv, id, n); if (!msg) return;
  p.acct.dirty = true; pushState(p, { msg }); persist(p);
}
function prog(p, id, n) {                                    // 미션 진행(서버가 직접 세요)
  if (!p.acct) return;
  const fin = ACCT.progress(p.acct.sv, kstDayNum(), id, n);
  p.acct.push = true; p.acct.dirty = true;
  if (fin) { send(p.ws, { t: 'toast', m: '✅ 미션 완료! 🎁 에서 보상을 받으세요' }); pushState(p); }
}

/* ───────── 방 / 접속자 ───────── */
const rooms = new Map();
function getRoom(id) {
  let r = rooms.get(id);
  if (!r) {
    const zone = ZN.ZONES[id] || ZN.ZONES.plaza;
    r = { id, R: zone.R, players: new Map(), poops: [], nextPoop: 1, cars: [], animals: [] };
    if (id === 'plaza') r.cars = CARS.SPAWNS.map(c => ({ id: c.id, x: c.x, z: c.z, ry: c.ry, sp: 0, color: c.color, lights: 0, driver: 0, pass: 0, eng: 0, y: 0, pt: 0 }));
    if (id === 'plaza') r.animals = CARS.ANIMALS.map((a, i) => ({ id: i, kind: a.kind, hx: a.x, hz: a.z, x: a.x, z: a.z, ry: Math.random() * 6.28, tx: a.x, tz: a.z, pose: 0, mv: 0, until: Date.now() + Math.random() * 4000, hold: 0, owner: 0, poopAt: Date.now() + 120000 + Math.random() * 120000, still: 0 }));
    rooms.set(id, r);
  }
  return r;
}
let nextId = 1;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;

function cleanName(raw) {
  let s = String(raw == null ? '' : raw).replace(/[\u0000-\u001f\u007f<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim();
  s = FILTER.clean(s).text;
  s = Array.from(s).slice(0, CFG.nameMax).join('');
  return s || '손님' + Math.floor(100 + Math.random() * 900);
}
function send(ws, obj) { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); }
function broadcast(room, obj, exceptId) {
  const msg = JSON.stringify(obj);
  for (const p of room.players.values()) if (p.id !== exceptId && p.ws.readyState === 1) p.ws.send(msg);
}
const carPub = c => [c.id, round2(c.x), round2(c.z), round2(c.ry), round2(c.sp), c.lights, c.color, c.driver, c.pass, c.eng || 0, round2(c.y || 0), round2(c.pt || 0)];
const aniPub = a => [a.id, round2(a.x), round2(a.z), round2(a.ry), a.mv, a.pose, a.owner];
const pub = p => ({ id: p.id, name: p.name, hue: p.hue, gen: p.gen || 0, ac: p.ac || 0, dr: p.dr || 0, x: round2(p.x), z: round2(p.z), ry: round2(p.ry), mv: p.mv, y: round2(p.y || 0), st: p.st || 0 });
function round2(v) { return Math.round(v * 100) / 100; }

/* 입장 위치: 분수 둘레(벤치와 나무 사이)에서 겹치지 않게 */
function spawnPoint(room) {
  const zn = ZN.ZONES[room.id];
  if (zn && zn.spawn) {
    for (let k = 0; k < 20; k++) {
      const x = zn.spawn[0] + (Math.random() - 0.5) * 4, z = zn.spawn[1] + (Math.random() - 0.5) * 4;
      if ([...room.players.values()].every(p => (p.x - x) ** 2 + (p.z - z) ** 2 > 1.4)) return { x, z };
    }
    return { x: zn.spawn[0], z: zn.spawn[1] };
  }
  for (let k = 0; k < 20; k++) {
    const a = Math.random() * Math.PI * 2, d = 17.5 + Math.random() * 3;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    let ok = true;
    for (const p of room.players.values()) if ((p.x - x) ** 2 + (p.z - z) ** 2 < 1.6) { ok = false; break; }
    if (ok) return { x, z };
  }
  return { x: 0, z: 0 };
}

function leaveCar(room, me) {
  const c = room.cars[me.ride.car], seat = me.ride.seat, sd = Math.sin(c.ry), cd = Math.cos(c.ry);
  const vi = CARS.vinfo(c.id), q = seat ? vi.p : vi.d, side = (q[0] ? Math.sign(q[0]) : 1) * (vi.k === 'dragon' ? 4.2 : 2.4);
  me.x = c.x + cd * side; me.z = c.z - sd * side; const r = Math.hypot(me.x, me.z); if (r > CFG.worldRadius) { me.x *= CFG.worldRadius / r; me.z *= CFG.worldRadius / r; }
  me.y = 0; me.st = 0; me.ride = null; me.lastT = Date.now(); me.mv = 0;
  if (seat === 0) { c.driver = 0; c.sp = 0; if (c.pass) { const q = room.players.get(c.pass); c.driver = c.pass; c.pass = 0; if (q && q.ride) { q.ride.seat = 0; send(q.ws, { t: 'ride', ok: true, car: c.id, seat: 0 }); } } else c.eng = 0; } else c.pass = 0;
  send(me.ws, { t: 'fix', x: round2(me.x), z: round2(me.z), y: 0 });
}
function releasePlayer(room, me) {
  if (me.ride) { const c = room.cars[me.ride.car]; if (me.ride.seat === 0) { c.driver = 0; c.sp = 0; if (!c.pass) c.eng = 0; if (c.pass) { const q = room.players.get(c.pass); c.driver = c.pass; c.pass = 0; if (q && q.ride) { q.ride.seat = 0; send(q.ws, { t: 'ride', ok: true, car: c.id, seat: 0 }); } } } else c.pass = 0; me.ride = null; }
  for (const a of room.animals) if (a.owner === me.id) { a.owner = 0; broadcast(room, { t: 'leash', id: a.id, owner: 0 }); }
}
const ACC_MAX = 7;                                         // 꾸미기 아이템 번호 0(없음)~7
function kstDay() {                                        // 한국 시간 기준 날짜 (자정에 하루가 바뀜)
  const t = Date.now() + 9 * 3600 * 1000, d = new Date(t);
  const p = n => (n < 10 ? '0' : '') + n;
  return { day: Math.floor(t / 86400000), date: d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) };
}
function roomState(room) {
  return { cars: room.cars.map(carPub), animals: room.animals.map(aniPub), poops: room.poops.map(q => [q.id, round2(q.x), round2(q.z)]) };
}
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: CFG.maxMsgBytes });
wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  let me = null, room = null, joining = false;
  let bucket = CFG.maxMsgPerSec, bucketT = Date.now();

  ws.on('message', (data, isBinary) => {
    if (isBinary) return;
    /* 메시지 속도 제한 */
    const now = Date.now();
    bucket = Math.min(CFG.maxMsgPerSec, bucket + (now - bucketT) / 1000 * CFG.maxMsgPerSec); bucketT = now;
    if (--bucket < 0) return;
    let m;
    try { m = JSON.parse(data.toString()); } catch (_) { return; }
    if (!m || typeof m.t !== 'string') return;

    if (m.t === 'join') {
      if (me || joining) return;
      joining = true;
      (async () => {
        let u = null;
        try { if (m.token) u = await AUTH.verifyToken(m.token); } catch (_) {}
        if (m.token && !u) send(ws, { t: 'authfail' });
        room = getRoom('plaza');
        if (room.players.size >= CFG.maxPlayersPerRoom) { send(ws, { t: 'full' }); return ws.close(); }
        if (ws.readyState !== 1) return;
        let acct = null;
        if (u) {
          const old = online.get(u.id); if (old) { old.acct = null; send(old.ws, { t: 'kicked', m: '다른 곳에서 로그인해서 연결을 끊었어요' }); old.ws.close(); }
          acct = { id: u.id, username: u.username, sv: ACCT.norm(u.save), dirty: false, push: false, savedAt: 0 };
          ACCT.ensureDay(acct.sv, kstDayNum());
        }
        const gIn = Math.floor(num(m.gen, -1)), gOk = gIn >= 0 && gIn <= 52, gen = acct ? (gOk ? gIn : (acct.sv.gen || 0)) : (gOk ? gIn : 0);
        if (acct && gOk && acct.sv.gen !== gIn) { acct.sv.gen = gIn; acct.dirty = true; }
        const sp = spawnPoint(room), t2 = Date.now();
        let nm = cleanName(m.name);
        if (acct) { if (acct.sv.nick) nm = acct.sv.nick; else { acct.sv.nick = nm; acct.dirty = true; } }   // 계정 닉네임은 처음 한 번만 정할 수 있어요
        me = { id: nextId++, ws, name: nm, hue: Math.floor(num(m.hue, Math.random() * 360)) % 360, gen, ac: acct ? acct.sv.equip : 0,
               x: sp.x, z: sp.z, y: 0, st: 0, ride: null, ry: 0, mv: 0, lastT: t2, lastInput: t2, bags: 0, clean: 0, acct };
        if (acct) online.set(acct.id, me);
        room.players.set(me.id, me);
        send(ws, Object.assign({ t: 'welcome', id: me.id, you: pub(me), players: [...room.players.values()].filter(p => p !== me).map(pub),
                   cfg: { tickHz: CFG.tickHz, worldRadius: room.R, maxSpeed: CFG.maxSpeed }, now: Date.now(), zone: room.id,
                   acct: acct ? { username: acct.username, nick: acct.sv.nick, s: ACCT.pubState(acct.sv) } : null }, kstDay(), roomState(room)));
        broadcast(room, { t: 'join', p: pub(me) }, me.id);
      })().catch(e => { console.error('join 오류', e.message); try { ws.close(); } catch (_) {} });
      return;
    }
    if (!me) return;
    if (m.t === 'd_checkin' || m.t === 'd_claim' || m.t === 'd_buy') {   // 출석 · 미션 보상 · 구매 (서버가 검증)
      me.lastInput = now;
      if (!me.acct) return send(ws, { t: 'd', s: null, guest: true });
      if (now - (me.lastD || 0) < 250) return; me.lastD = now;
      const sv = me.acct.sv, day = kstDayNum(); let msg = null;
      if (m.t === 'd_checkin') msg = ACCT.checkin(sv, day);
      else if (m.t === 'd_claim') msg = ACCT.claim(sv, day, String(m.id || ''));
      else { msg = ACCT.buy(sv, num(m.i, 0)); if (msg && msg.indexOf('획득') > 0) { me.ac = sv.equip; broadcast(room, { t: 'acc', id: me.id, a: me.ac }); } }
      pushState(me, msg ? { msg, k: m.t } : {});
      if (msg) persist(me);
      return;
    }

    if (m.t === 'move') {
      /* 클라이언트가 말한 위치를 그대로 믿지 않고, 시간당 이동 가능 거리 안으로만 인정 */
      const dt = clamp((now - me.lastT) / 1000, 0.01, 0.5); me.lastT = now; me.lastInput = now;
      if (me.ride) return;                                  // 자동차를 타고 있으면 위치는 서버가 정해요
      me.y = clamp(num(m.y, 0), 0, 9); me.st = (m.st === 1 || m.st === 2 || m.st === 3) ? m.st : 0;
      let tx = num(m.x, me.x), tz = num(m.z, me.z);
      let dx = tx - me.x, dz = tz - me.z;
      const dist = Math.hypot(dx, dz), maxD = CFG.maxSpeed * dt;
      if (dist > maxD) { dx *= maxD / dist; dz *= maxD / dist; }
      let nx = me.x + dx, nz = me.z + dz;
      const r = Math.hypot(nx, nz);
      if (r > room.R) { nx *= room.R / r; nz *= room.R / r; }
      me.mv = Math.hypot(nx - me.x, nz - me.z) / dt > 0.4 ? (Math.hypot(nx - me.x, nz - me.z) / dt > 6.5 ? 2 : 1) : 0;
      const stepLen = Math.hypot(nx - me.x, nz - me.z);
      if (me.acct) {
        if (me.st === 1) { prog(me, 'sit', dt); if (room.id === 'plaza' && ZN.CAFE.inside(me.x, me.z)) hid(me, 'cafe_sit', 1); }
        if (me.st === 3) hid(me, 'tree', 1);
        else if (me.st === 2 && room.id === 'stars') prog(me, 'star', dt);
        if (me.leash) prog(me, 'dog', dt);
        if (me.st === 0 && me.mv === 1) prog(me, 'walk', stepLen);
      }
      me.x = nx; me.z = nz; me.ry = num(m.ry, me.ry) % (Math.PI * 2);
      if (dist > maxD * 1.5 + 0.5) send(ws, { t: 'fix', x: round2(me.x), z: round2(me.z) });   // 너무 크게 어긋나면 바로잡아 줌
      return;
    }
    if (m.t === 'portal') {                                 // 달문(입구) 통과: 광장 ↔ 힐링 공간
      me.lastInput = now;
      if (now - (me.lastPortal || 0) < 1200) return;
      const to = String(m.to || '');
      if (me.ride) return send(ws, { t: 'portal', ok: false });
      if (me.leash) { send(ws, { t: 'toast', m: '산책 중에는 들어갈 수 없어요 🐕 먼저 산책을 끝내 주세요' }); return send(ws, { t: 'portal', ok: false }); }
      let ok = false;
      if (room.id === 'plaza') { const g = ZN.PLAZA_GATES.find(q => q.to === to); ok = !!g && Math.hypot(g.x - me.x, g.z - me.z) <= ZN.GATE_RANGE; }
      else if (to === 'plaza') { const zg = ZN.ZONES[room.id].gate; ok = Math.hypot(zg[0] - me.x, zg[1] - me.z) <= ZN.GATE_RANGE; }
      if (!ok) return send(ws, { t: 'portal', ok: false });
      const dest = getRoom(to);
      if (dest.players.size >= CFG.maxPlayersPerRoom) { send(ws, { t: 'toast', m: '그 공간이 가득 찼어요. 잠시 후 다시 와 주세요' }); return send(ws, { t: 'portal', ok: false }); }
      me.lastPortal = now;
      const from = room.id;
      releasePlayer(room, me); room.players.delete(me.id); broadcast(room, { t: 'leave', id: me.id });
      room = dest;
      if (to === 'plaza') {                                  // 광장으로 돌아오면 들어갔던 입구 앞에 서요
        const g = ZN.PLAZA_GATES.find(q => q.to === from), d = Math.hypot(g.x, g.z);
        me.x = g.x - g.x / d * 4.5 + (Math.random() - 0.5) * 1.6; me.z = g.z - g.z / d * 4.5 + (Math.random() - 0.5) * 1.6;
      } else { const sp = spawnPoint(room); me.x = sp.x; me.z = sp.z; }
      me.y = 0; me.st = 0; me.mv = 0; me.lastT = now; me.ride = null;
      room.players.set(me.id, me);
      if (me.acct && to !== 'plaza') { if (!me.acct.sv.hz[to]) { me.acct.sv.hz[to] = 1; if (Object.keys(me.acct.sv.hz).length >= 4) hid(me, 'zones', 4); } if (ACCT.visit(me.acct.sv, kstDayNum(), to)) send(ws, { t: 'toast', m: '✅ 미션 완료! 🎁 에서 보상을 받으세요' }); me.acct.dirty = true; me.acct.push = true; }
      send(ws, Object.assign({ t: 'zone', zone: room.id, you: pub(me), players: [...room.players.values()].filter(p => p !== me).map(pub),
                 cfg: { tickHz: CFG.tickHz, worldRadius: room.R, maxSpeed: CFG.maxSpeed }, now: Date.now() }, roomState(room)));
      broadcast(room, { t: 'join', p: pub(me) }, me.id);
      return;
    }
    if (m.t === 'order') {                                  // 카페 주문 (별로 결제, 서버가 거리·잔액 확인)
      me.lastInput = now;
      if (!me.acct) return send(ws, { t: 'toast', m: '로그인하면 별로 주문할 수 있어요 🌿' });
      if (room.id !== 'plaza' || me.ride || now - (me.lastOrder || 0) < 800) return;
      const idx = DAILY.MENU.findIndex(q => q.id === String(m.id || '')); if (idx < 0) return;
      if (!ZN.CAFE.atCounter(me.x, me.z)) return send(ws, { t: 'toast', m: '카운터 앞으로 와 주세요 ☕' });
      const it = DAILY.MENU[idx], sv = me.acct.sv;
      if (sv.stars < it.p) return send(ws, { t: 'toast', m: '✨ 이 부족해요 (' + it.n + ' ✨' + it.p + ')' });
      me.lastOrder = now; sv.stars -= it.p; sv.orders = (sv.orders || 0) + 1;
      me.dr = idx + 1; hid(me, 'first_order', 1); hid(me, 'regular', 1);
      broadcast(room, { t: 'drink', id: me.id, d: me.dr });
      send(ws, { t: 'ordered', item: it.id });
      pushState(me, { msg: it.e + ' ' + it.n + ' 주문 완료! (✨ -' + it.p + ')' });
      persist(me); return;
    }
    if (m.t === 'acc') {                                    // 꾸미기 아이템 바꾸기
      me.lastInput = now;
      if (now - (me.lastAcc || 0) < 400) return; me.lastAcc = now;
      const a = clamp(Math.floor(num(m.a, 0)), 0, ACC_MAX);
      if (!me.acct || (a && !me.acct.sv.own.includes(a))) return pushState(me);   // 가진 것만 입을 수 있어요
      me.ac = a; me.acct.sv.equip = a; me.acct.dirty = true;
      broadcast(room, { t: 'acc', id: me.id, a: me.ac });
      return pushState(me);
    }
    if (m.t === 'ride') {                                   // 자동차 타기 요청
      me.lastInput = now;
      const i = Math.floor(num(m.car, -1));
      if (me.ride || i < 0 || i >= room.cars.length || me.leash) return me.leash ? send(ws, { t: 'toast', m: '산책 중에는 차를 탈 수 없어요 🐕' }) : undefined;
      const c = room.cars[i];
      if (Math.hypot(c.x - me.x, c.z - me.z) > CFG.boardRange) return send(ws, { t: 'ride', ok: false, why: 'far' });
      const seat = !c.driver ? 0 : !c.pass ? 1 : -1;
      if (seat < 0) return send(ws, { t: 'ride', ok: false, why: 'full' });
      if (seat === 0) c.driver = me.id; else c.pass = me.id;
      hid(me, 'drive', 1); me.ride = { car: i, seat }; me.st = 4; me.y = (c.y || 0) + CARS.seatY(i, seat); me.mv = 0;
      return send(ws, { t: 'ride', ok: true, car: i, seat });
    }
    if (m.t === 'unride') { me.lastInput = now; if (me.ride) { const c = room.cars[me.ride.car]; if (CARS.vinfo(c.id).fly && (c.y || 0) > 1.6) return send(ws, { t: 'toast', m: '🐉 먼저 땅에 내려앉아 주세요 (C 키로 하강)' }); leaveCar(room, me); } return; }
    if (m.t === 'drive') {                                  // 운전자가 보내는 자동차 상태
      me.lastInput = now;
      if (!me.ride || me.ride.seat !== 0) return;
      const c = room.cars[me.ride.car], dt = clamp((now - (me.lastDrive || now - 100)) / 1000, 0.02, 0.6); me.lastDrive = now;
      let nx = num(m.x, c.x), nz = num(m.z, c.z);
      const fl = CARS.vinfo(c.id).fly, d = Math.hypot(nx - c.x, nz - c.z), maxD = (fl ? 60 : 34) * dt + 0.5;
      if (d > maxD) { nx = c.x + (nx - c.x) * maxD / d; nz = c.z + (nz - c.z) * maxD / d; send(ws, { t: 'cfix', x: round2(nx), z: round2(nz) }); }
      const r = Math.hypot(nx, nz); if (r > CFG.worldRadius) { nx *= CFG.worldRadius / r; nz *= CFG.worldRadius / r; }
      c.x = nx; c.z = nz; c.ry = num(m.ry, c.ry); c.sp = clamp(num(m.sp, 0), -12, fl ? 55 : 34);
      if (fl) { c.y = clamp(num(m.y, c.y || 0), 0, 90); c.pt = clamp(num(m.pt, 0), -1.2, 1.2); } else { c.y = 0; c.pt = 0; }
      return;
    }
    if (m.t === 'carset') {                                 // 색상 · 라이트
      me.lastInput = now;
      if (!me.ride || me.ride.seat !== 0) return;
      const c = room.cars[me.ride.car];
      if (m.c !== undefined) c.color = clamp(Math.floor(num(m.c, c.color)), 0, CARS.COLORS.length - 1);
      if (m.l !== undefined) c.lights = m.l ? 1 : 0;
      if (m.e !== undefined) { c.eng = m.e ? 1 : 0; if (!c.eng) c.sp = c.sp; }
      return;
    }
    if (m.t === 'fire') {                                   // 드래곤 불 뿜기
      me.lastInput = now;
      if (!me.ride || me.ride.seat !== 0 || (m.on && now - (me.lastFire || 0) < 150)) return;
      const c = room.cars[me.ride.car]; if (!CARS.vinfo(c.id).fly) return;
      me.lastFire = now; return broadcast(room, { t: 'fire', car: c.id, on: m.on ? 1 : 0 });
    }
    if (m.t === 'horn') {
      me.lastInput = now;
      if (!me.ride || me.ride.seat !== 0 || now - (me.lastHorn || 0) < 110) return;
      me.lastHorn = now; hid(me, 'horn', 1); return broadcast(room, { t: 'horn', car: me.ride.car });
    }
    /* ── 동물 ── */
    if (m.t === 'pet' || m.t === 'treat' || m.t === 'leash') {
      me.lastInput = now;
      const a = room.animals[Math.floor(num(m.id, -1))];
      if (!a || me.ride || Math.hypot(a.x - me.x, a.z - me.z) > 4.5) return;
      if (m.t === 'leash') {
        if (a.owner === me.id) { a.owner = 0; me.leash = 0; return broadcast(room, { t: 'leash', id: a.id, owner: 0 }); }
        if (a.kind !== 'dog') return send(ws, { t: 'toast', m: '고양이는 산책을 싫어해요 😾' });
        if (a.owner) return send(ws, { t: 'toast', m: '다른 분과 산책 중이에요' });
        if (me.leash) return send(ws, { t: 'toast', m: '이미 산책 중인 강아지가 있어요' });
        a.owner = me.id; me.leash = a.id + 1; a.poopAt = now + 25000 + Math.random() * 30000;
        return broadcast(room, { t: 'leash', id: a.id, owner: me.id });
      }
      if (now - (me.lastAct || 0) < 500) return; me.lastAct = now;
      if (m.t === 'pet') prog(me, 'pet', 1);
      a.hold = now + (m.t === 'treat' ? 2600 : 2200); a.pose = a.kind === 'dog' ? 3 : 1; a.ry = Math.atan2(me.x - a.x, me.z - a.z); a.mv = 0;
      return broadcast(room, { t: 'afx', id: a.id, e: m.t });
    }
    if (m.t === 'pickup') {
      me.lastInput = now;
      const k = room.poops.findIndex(q => q.id === Math.floor(num(m.pid, -1)));
      if (k < 0 || me.ride) return;
      const q = room.poops[k]; if (Math.hypot(q.x - me.x, q.z - me.z) > 3.2) return;
      room.poops.splice(k, 1); me.bags++; hid(me, 'poop', 1);
      broadcast(room, { t: 'poopdel', pid: q.id });
      return send(ws, { t: 'bag', n: me.bags, clean: me.clean });
    }
    if (m.t === 'dbin') {                                   // 마신 컵 휴지통에 버리기
      me.lastInput = now;
      if (!me.dr || room.id !== 'plaza' || me.ride || !ZN.CAFE.nearBin(me.x, me.z, 3.2)) return;
      me.dr = 0; hid(me, 'cup', 1); broadcast(room, { t: 'drink', id: me.id, d: 0 });
      return send(ws, { t: 'toast', m: '🗑️ 컵을 버렸어요' });
    }
    if (m.t === 'bin') {
      me.lastInput = now;
      if (me.ride || !me.bags || !CARS.BINS.some(b => Math.hypot(b[0] - me.x, b[1] - me.z) < 3.8)) return;
      me.clean += me.bags; const n = me.bags; me.bags = 0; hid(me, 'trash', 1);
      return send(ws, { t: 'bag', n: 0, clean: me.clean, thrown: n });
    }
    if (m.t === 'chat') {                                   // 말풍선 채팅
      me.lastInput = now;
      if (now - (me.lastChat || 0) < 1100) return;
      let txt = Array.from(String(m.x == null ? '' : m.x).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim()).slice(0, 60).join('');
      if (!txt) return;
      const f = FILTER.clean(txt);                          // 거친 말은 칭찬으로 바꿔서 내보내요
      txt = f.text || '…';
      me.lastChat = now; prog(me, 'chat', 1); hid(me, 'talker', 1);
      broadcast(room, { t: 'chat', id: me.id, x: txt });
      if (f.changed) send(ws, { t: 'softened' });
      return;
    }
    if (m.t === 'emote') {                                  // 이모티콘
      me.lastInput = now;
      const e = Math.floor(num(m.e, -1));
      if (e < 0 || e > 7 || now - (me.lastEmote || 0) < 700) return;
      me.lastEmote = now; prog(me, 'emote', 1); hid(me, 'emotes', 1);
      return broadcast(room, { t: 'emote', id: me.id, e });
    }
    if (m.t === 'ping') { me.lastInput = now; send(ws, { t: 'pong', c: num(m.c, 0), s: Date.now() }); return; }
  });

  ws.on('close', () => {
    if (me && me.acct) { if (online.get(me.acct.id) === me) online.delete(me.acct.id); persist(me); }
    if (me && room) { releasePlayer(room, me); room.players.delete(me.id); broadcast(room, { t: 'leave', id: me.id }); }
  });
  ws.on('error', () => {});
});

/* 동물 움직임 */
const ASPD = { cat: 1.3, dog: 1.9 };
function stepAnimals(room, now, dt) {
  for (const a of room.animals) {
    const owner = a.owner ? room.players.get(a.owner) : null;
    if (a.owner && !owner) a.owner = 0;
    a.mv = 0;
    if (now < a.hold) continue;                             // 쓰다듬는 중 · 똥 싸는 중
    if (owner) {
      const fx = Math.sin(owner.ry), fz = Math.cos(owner.ry);
      const gx = owner.x - fx * 1.8 + fz * 0.9, gz = owner.z - fz * 1.8 - fx * 0.9;
      const d = Math.hypot(gx - a.x, gz - a.z), od = Math.hypot(owner.x - a.x, owner.z - a.z);
      if (od > 14) { a.x = owner.x - fx * 2; a.z = owner.z - fz * 2; }
      else if (d > 0.5) {
        const sp = Math.min(9, 1.6 + d * 2.4) * dt, k = Math.min(1, sp / d);
        a.x += (gx - a.x) * k; a.z += (gz - a.z) * k; a.ry = Math.atan2(gx - a.x, gz - a.z); a.mv = sp / dt > 4.5 ? 2 : 1; a.pose = 0; a.still = 0;
        if (now > a.poopAt && room.poops.length < 18) { a.poopAt = now + 45000 + Math.random() * 40000; a.hold = now + 1500; a.pose = 4; dropPoop(room, a, now); }
      } else { a.still += dt; a.pose = a.still > 2 ? 1 : 0; }
      continue;
    }
    if (now > a.until) {                                    // 다음 행동 고르기
      const q = Math.random();
      if (q < 0.42) { const ang = Math.random() * 6.28, rr = Math.random() * (a.kind === 'cat' ? 4 : 6); a.tx = a.hx + Math.cos(ang) * rr; a.tz = a.hz + Math.sin(ang) * rr; a.pose = 0; a.until = now + 9000; }
      else if (q < 0.72) { a.pose = 1; a.tx = a.x; a.tz = a.z; a.until = now + 4000 + Math.random() * 6000; }
      else { a.pose = 2; a.tx = a.x; a.tz = a.z; a.until = now + 6000 + Math.random() * 9000; }
      if (a.kind === 'dog' && now > a.poopAt) { a.poopAt = now + 150000 + Math.random() * 150000; if (room.poops.length < 18) { a.pose = 4; a.hold = now + 1500; dropPoop(room, a, now); } }
    }
    if (a.pose === 0) {
      const d = Math.hypot(a.tx - a.x, a.tz - a.z);
      if (d > 0.3) { const sp = ASPD[a.kind] * dt, k = Math.min(1, sp / d); a.x += (a.tx - a.x) * k; a.z += (a.tz - a.z) * k; a.ry = Math.atan2(a.tx - a.x, a.tz - a.z); a.mv = 1; }
      else { a.until = Math.min(a.until, now + 500 + Math.random() * 1500); }
    }
  }
}
function dropPoop(room, a, now) {
  const fx = Math.sin(a.ry), fz = Math.cos(a.ry), q = { id: room.nextPoop++, x: a.x - fx * 0.5, z: a.z - fz * 0.5, t: now };
  room.poops.push(q); broadcast(room, { t: 'poop', p: [q.id, round2(q.x), round2(q.z)] });
}

/* 상태 뿌리기 */
let lastTick = Date.now();
setInterval(() => {
  const now = Date.now(), dt = Math.min(0.25, (now - lastTick) / 1000); lastTick = now;
  for (const room of rooms.values()) {
    if (!room.players.size) continue;
    for (const p of room.players.values()) if (p.ride) { const c = room.cars[p.ride.car], s = CARS.seatAt(c.x, c.z, c.ry, p.ride.seat, p.ride.car); p.x = s[0]; p.z = s[1]; p.ry = c.ry; p.y = (c.y || 0) + CARS.seatY(p.ride.car, p.ride.seat); p.st = 4; p.mv = 0; }
    for (const c of room.cars) if (c.y > 0 && !c.driver && CARS.vinfo(c.id).fly) { c.y = Math.max(0, c.y - 16 * dt); c.sp = 0; c.pt = 0; }   // 주인 없는 드래곤은 천천히 내려앉아요
    stepAnimals(room, now, dt);
    for (let k = room.poops.length - 1; k >= 0; k--) if (now - room.poops[k].t > 8 * 60 * 1000) { broadcast(room, { t: 'poopdel', pid: room.poops[k].id }); room.poops.splice(k, 1); }
    const list = [...room.players.values()].map(p => [p.id, round2(p.x), round2(p.z), round2(p.ry), p.mv, round2(p.y || 0), p.st || 0]);
    const msg = JSON.stringify({ t: 's', p: list, c: room.cars.map(carPub), a: room.animals.map(aniPub) });
    for (const p of room.players.values()) if (p.ws.readyState === 1) p.ws.send(msg);
  }
}, 1000 / CFG.tickHz);

/* 기록 전달(1.5초마다) · 저장(6초 이상 간격) */
setInterval(() => {
  const now = Date.now();
  for (const p of online.values()) {
    if (!p.acct) continue;
    if (p.acct.push) pushState(p);
    if (p.acct.dirty && now - p.acct.savedAt > 6000) persist(p);
  }
  
}, 1500);

/* 죽은 연결/방치된 연결 정리 */
setInterval(() => {
  const now = Date.now();
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false; try { ws.ping(); } catch (_) {}
  }
  for (const room of rooms.values()) for (const p of room.players.values()) {
    if (now - p.lastInput > CFG.idleKickMs) { send(p.ws, { t: 'idle' }); p.ws.close(); }
  }
}, 15000);

function shutdown() { for (const p of online.values()) if (p.acct && p.acct.dirty) persist(p); setTimeout(() => process.exit(0), 800); }
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
DB.init().then(mode => {
  console.log('계정 저장소: ' + (mode === 'pg' ? 'Postgres (DATABASE_URL)' : '파일 data/db.json — 임시 저장이에요. Render 무료 서버에서는 재시작하면 계정이 사라지니 DATABASE_URL을 설정하세요'));
  server.listen(PORT, () => console.log('Healing Lounge 서버 시작: http://localhost:' + PORT));
}).catch(e => { console.error('계정 저장소 연결 실패:', e.message); process.exit(1); });
process.on('SIGTERM', () => { wss.clients.forEach(c => c.close()); server.close(() => process.exit(0)); });
