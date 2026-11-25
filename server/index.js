'use strict';
/*
  Office Worker City — 멀티플레이 서버 (접속 + 이동 동기화)
  - 정적 파일(public/)과 WebSocket(/ws)을 한 포트에서 같이 제공합니다.
  - 서버가 이동 속도/범위를 검증해서, 클라이언트가 위치를 조작해도 통하지 않게 합니다.
*/
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const CARS = require('../public/cars.js');
const FILTER = require('./filter.js');

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

/* ───────── 방 / 접속자 ───────── */
const rooms = new Map();
function getRoom(id) {
  let r = rooms.get(id);
  if (!r) {
    r = { id, players: new Map(), poops: [], nextPoop: 1 };
    r.cars = CARS.SPAWNS.map(c => ({ id: c.id, x: c.x, z: c.z, ry: c.ry, sp: 0, color: c.color, lights: 0, driver: 0, pass: 0 }));
    r.animals = CARS.ANIMALS.map((a, i) => ({ id: i, kind: a.kind, hx: a.x, hz: a.z, x: a.x, z: a.z, ry: Math.random() * 6.28, tx: a.x, tz: a.z, pose: 0, mv: 0, until: Date.now() + Math.random() * 4000, hold: 0, owner: 0, poopAt: Date.now() + 120000 + Math.random() * 120000, still: 0 }));
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
const carPub = c => [c.id, round2(c.x), round2(c.z), round2(c.ry), round2(c.sp), c.lights, c.color, c.driver, c.pass];
const aniPub = a => [a.id, round2(a.x), round2(a.z), round2(a.ry), a.mv, a.pose, a.owner];
const pub = p => ({ id: p.id, name: p.name, hue: p.hue, x: round2(p.x), z: round2(p.z), ry: round2(p.ry), mv: p.mv, y: round2(p.y || 0), st: p.st || 0 });
function round2(v) { return Math.round(v * 100) / 100; }

/* 입장 위치: 분수 둘레(벤치와 나무 사이)에서 겹치지 않게 */
function spawnPoint(room) {
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
  const side = seat === 0 ? -2.4 : 2.4;
  me.x = c.x + cd * side; me.z = c.z - sd * side; const r = Math.hypot(me.x, me.z); if (r > CFG.worldRadius) { me.x *= CFG.worldRadius / r; me.z *= CFG.worldRadius / r; }
  me.y = 0; me.st = 0; me.ride = null; me.lastT = Date.now(); me.mv = 0;
  if (seat === 0) { c.driver = 0; c.sp = 0; if (c.pass) { const q = room.players.get(c.pass); c.driver = c.pass; c.pass = 0; if (q && q.ride) { q.ride.seat = 0; send(q.ws, { t: 'ride', ok: true, car: c.id, seat: 0 }); } } } else c.pass = 0;
  send(me.ws, { t: 'fix', x: round2(me.x), z: round2(me.z), y: 0 });
}
function releasePlayer(room, me) {
  if (me.ride) { const c = room.cars[me.ride.car]; if (me.ride.seat === 0) { c.driver = 0; c.sp = 0; if (c.pass) { const q = room.players.get(c.pass); c.driver = c.pass; c.pass = 0; if (q && q.ride) { q.ride.seat = 0; send(q.ws, { t: 'ride', ok: true, car: c.id, seat: 0 }); } } } else c.pass = 0; me.ride = null; }
  for (const a of room.animals) if (a.owner === me.id) { a.owner = 0; broadcast(room, { t: 'leash', id: a.id, owner: 0 }); }
}
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: CFG.maxMsgBytes });
wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  let me = null, room = null;
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
      if (me) return;
      const roomId = 'plaza';
      room = getRoom(roomId);
      if (room.players.size >= CFG.maxPlayersPerRoom) { send(ws, { t: 'full' }); return ws.close(); }
      const sp = spawnPoint(room);
      me = { id: nextId++, ws, name: cleanName(m.name), hue: Math.floor(num(m.hue, Math.random() * 360)) % 360,
             x: sp.x, z: sp.z, y: 0, st: 0, ride: null, ry: 0, mv: 0, lastT: now, lastInput: now, bags: 0, clean: 0 };
      room.players.set(me.id, me);
      send(ws, { t: 'welcome', id: me.id, you: pub(me), players: [...room.players.values()].filter(p => p !== me).map(pub),
                 cfg: { tickHz: CFG.tickHz, worldRadius: CFG.worldRadius, maxSpeed: CFG.maxSpeed }, now: Date.now(),
                 cars: room.cars.map(carPub), animals: room.animals.map(aniPub), poops: room.poops.map(q => [q.id, round2(q.x), round2(q.z)]) });
      broadcast(room, { t: 'join', p: pub(me) }, me.id);
      return;
    }
    if (!me) return;

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
      if (r > CFG.worldRadius) { nx *= CFG.worldRadius / r; nz *= CFG.worldRadius / r; }
      me.mv = Math.hypot(nx - me.x, nz - me.z) / dt > 0.4 ? (Math.hypot(nx - me.x, nz - me.z) / dt > 6.5 ? 2 : 1) : 0;
      me.x = nx; me.z = nz; me.ry = num(m.ry, me.ry) % (Math.PI * 2);
      if (dist > maxD * 1.5 + 0.5) send(ws, { t: 'fix', x: round2(me.x), z: round2(me.z) });   // 너무 크게 어긋나면 바로잡아 줌
      return;
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
      me.ride = { car: i, seat }; me.st = 4; me.y = CARS.SEAT_Y; me.mv = 0;
      return send(ws, { t: 'ride', ok: true, car: i, seat });
    }
    if (m.t === 'unride') { me.lastInput = now; if (me.ride) leaveCar(room, me); return; }
    if (m.t === 'drive') {                                  // 운전자가 보내는 자동차 상태
      me.lastInput = now;
      if (!me.ride || me.ride.seat !== 0) return;
      const c = room.cars[me.ride.car], dt = clamp((now - (me.lastDrive || now - 100)) / 1000, 0.02, 0.6); me.lastDrive = now;
      let nx = num(m.x, c.x), nz = num(m.z, c.z);
      const d = Math.hypot(nx - c.x, nz - c.z), maxD = 34 * dt + 0.5;
      if (d > maxD) { nx = c.x + (nx - c.x) * maxD / d; nz = c.z + (nz - c.z) * maxD / d; send(ws, { t: 'cfix', x: round2(nx), z: round2(nz) }); }
      const r = Math.hypot(nx, nz); if (r > CFG.worldRadius) { nx *= CFG.worldRadius / r; nz *= CFG.worldRadius / r; }
      c.x = nx; c.z = nz; c.ry = num(m.ry, c.ry); c.sp = clamp(num(m.sp, 0), -12, 34);
      return;
    }
    if (m.t === 'carset') {                                 // 색상 · 라이트
      me.lastInput = now;
      if (!me.ride || me.ride.seat !== 0) return;
      const c = room.cars[me.ride.car];
      if (m.c !== undefined) c.color = clamp(Math.floor(num(m.c, c.color)), 0, CARS.COLORS.length - 1);
      if (m.l !== undefined) c.lights = m.l ? 1 : 0;
      return;
    }
    if (m.t === 'horn') {
      me.lastInput = now;
      if (!me.ride || me.ride.seat !== 0 || now - (me.lastHorn || 0) < 450) return;
      me.lastHorn = now; return broadcast(room, { t: 'horn', car: me.ride.car });
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
      a.hold = now + (m.t === 'treat' ? 2600 : 2200); a.pose = a.kind === 'dog' ? 3 : 1; a.ry = Math.atan2(me.x - a.x, me.z - a.z); a.mv = 0;
      return broadcast(room, { t: 'afx', id: a.id, e: m.t });
    }
    if (m.t === 'pickup') {
      me.lastInput = now;
      const k = room.poops.findIndex(q => q.id === Math.floor(num(m.pid, -1)));
      if (k < 0 || me.ride) return;
      const q = room.poops[k]; if (Math.hypot(q.x - me.x, q.z - me.z) > 3.2) return;
      room.poops.splice(k, 1); me.bags++;
      broadcast(room, { t: 'poopdel', pid: q.id });
      return send(ws, { t: 'bag', n: me.bags, clean: me.clean });
    }
    if (m.t === 'bin') {
      me.lastInput = now;
      if (me.ride || !me.bags || !CARS.BINS.some(b => Math.hypot(b[0] - me.x, b[1] - me.z) < 3.8)) return;
      me.clean += me.bags; const n = me.bags; me.bags = 0;
      return send(ws, { t: 'bag', n: 0, clean: me.clean, thrown: n });
    }
    if (m.t === 'chat') {                                   // 말풍선 채팅
      me.lastInput = now;
      if (now - (me.lastChat || 0) < 1100) return;
      let txt = Array.from(String(m.x == null ? '' : m.x).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim()).slice(0, 60).join('');
      if (!txt) return;
      const f = FILTER.clean(txt);                          // 거친 말은 칭찬으로 바꿔서 내보내요
      txt = f.text || '…';
      me.lastChat = now;
      broadcast(room, { t: 'chat', id: me.id, x: txt });
      if (f.changed) send(ws, { t: 'softened' });
      return;
    }
    if (m.t === 'emote') {                                  // 이모티콘
      me.lastInput = now;
      const e = Math.floor(num(m.e, -1));
      if (e < 0 || e > 7 || now - (me.lastEmote || 0) < 700) return;
      me.lastEmote = now;
      return broadcast(room, { t: 'emote', id: me.id, e });
    }
    if (m.t === 'ping') { me.lastInput = now; send(ws, { t: 'pong', c: num(m.c, 0), s: Date.now() }); return; }
  });

  ws.on('close', () => {
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
    for (const p of room.players.values()) if (p.ride) { const c = room.cars[p.ride.car], s = CARS.seatAt(c.x, c.z, c.ry, p.ride.seat); p.x = s[0]; p.z = s[1]; p.ry = c.ry; p.y = CARS.SEAT_Y; p.st = 4; p.mv = 0; }
    stepAnimals(room, now, dt);
    for (let k = room.poops.length - 1; k >= 0; k--) if (now - room.poops[k].t > 8 * 60 * 1000) { broadcast(room, { t: 'poopdel', pid: room.poops[k].id }); room.poops.splice(k, 1); }
    const list = [...room.players.values()].map(p => [p.id, round2(p.x), round2(p.z), round2(p.ry), p.mv, round2(p.y || 0), p.st || 0]);
    const msg = JSON.stringify({ t: 's', p: list, c: room.cars.map(carPub), a: room.animals.map(aniPub) });
    for (const p of room.players.values()) if (p.ws.readyState === 1) p.ws.send(msg);
  }
}, 1000 / CFG.tickHz);

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

server.listen(PORT, () => console.log('Office Worker City 서버 시작: http://localhost:' + PORT));
process.on('SIGTERM', () => { wss.clients.forEach(c => c.close()); server.close(() => process.exit(0)); });
