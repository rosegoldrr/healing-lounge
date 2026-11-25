'use strict';
/*
  Office Worker City — 멀티플레이 서버 (1단계: 접속 + 이동 동기화)
  - 정적 파일(public/)과 WebSocket(/ws)을 한 포트에서 같이 제공합니다.
  - 서버가 이동 속도/범위를 검증해서, 클라이언트가 위치를 조작해도 통하지 않게 합니다.
*/
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

/* ───────── 설정 ───────── */
const CFG = {
  maxPlayersPerRoom: parseInt(process.env.MAX_PLAYERS, 10) || 40, // 방 하나 최대 인원 (무료 서버는 작게)
  tickHz: 10,                 // 서버가 상태를 뿌리는 횟수/초
  maxSpeed: 11,               // m/s — 달리기(약 9)보다 약간 여유
  worldRadius: 60,            // 광장 반경(m). 여기 밖으로는 못 나감
  maxMsgPerSec: 40,           // 접속자 1명이 보낼 수 있는 메시지 수/초
  maxMsgBytes: 512,           // 메시지 최대 크기
  nameMax: 12,
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
  if (!r) { r = { id, players: new Map() }; rooms.set(id, r); }
  return r;
}
let nextId = 1;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;

function cleanName(raw) {
  let s = String(raw == null ? '' : raw).replace(/[\u0000-\u001f\u007f<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim();
  s = Array.from(s).slice(0, CFG.nameMax).join('');
  return s || '손님' + Math.floor(100 + Math.random() * 900);
}
function send(ws, obj) { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); }
function broadcast(room, obj, exceptId) {
  const msg = JSON.stringify(obj);
  for (const p of room.players.values()) if (p.id !== exceptId && p.ws.readyState === 1) p.ws.send(msg);
}
const pub = p => ({ id: p.id, name: p.name, hue: p.hue, x: round2(p.x), z: round2(p.z), ry: round2(p.ry), mv: p.mv });
function round2(v) { return Math.round(v * 100) / 100; }

/* 입장 위치: 광장 중앙 근처에서 겹치지 않게 */
function spawnPoint(room) {
  for (let k = 0; k < 20; k++) {
    const a = Math.random() * Math.PI * 2, d = 3 + Math.random() * 6;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    let ok = true;
    for (const p of room.players.values()) if ((p.x - x) ** 2 + (p.z - z) ** 2 < 1.6) { ok = false; break; }
    if (ok) return { x, z };
  }
  return { x: 0, z: 0 };
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
             x: sp.x, z: sp.z, ry: 0, mv: 0, lastT: now, lastInput: now };
      room.players.set(me.id, me);
      send(ws, { t: 'welcome', id: me.id, you: pub(me), players: [...room.players.values()].filter(p => p !== me).map(pub),
                 cfg: { tickHz: CFG.tickHz, worldRadius: CFG.worldRadius, maxSpeed: CFG.maxSpeed } });
      broadcast(room, { t: 'join', p: pub(me) }, me.id);
      return;
    }
    if (!me) return;

    if (m.t === 'move') {
      /* 클라이언트가 말한 위치를 그대로 믿지 않고, 시간당 이동 가능 거리 안으로만 인정 */
      const dt = clamp((now - me.lastT) / 1000, 0.01, 0.5); me.lastT = now; me.lastInput = now;
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
    if (m.t === 'ping') { me.lastInput = now; send(ws, { t: 'pong', c: num(m.c, 0) }); return; }
  });

  ws.on('close', () => {
    if (me && room) { room.players.delete(me.id); broadcast(room, { t: 'leave', id: me.id }); }
  });
  ws.on('error', () => {});
});

/* 상태 뿌리기 */
setInterval(() => {
  for (const room of rooms.values()) {
    if (!room.players.size) continue;
    const list = [...room.players.values()].map(p => [p.id, round2(p.x), round2(p.z), round2(p.ry), p.mv]);
    const msg = JSON.stringify({ t: 's', p: list });
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
