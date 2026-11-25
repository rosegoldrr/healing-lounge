'use strict';
/*
  계정 저장소.
  - DATABASE_URL 이 있으면 Postgres(Neon 등)에 저장 → 서버가 재시작/재배포돼도 계정이 남아요.
  - 없으면 data/db.json 파일에 저장 → 내 컴퓨터 테스트용. (Render 무료 서버에서는 재시작하면 사라져요)
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let mode = 'file', pool = null, secret = '';
const FILE = path.join(__dirname, '..', 'data', 'db.json');
let mem = { users: [], nextId: 1, secret: '' }, wTimer = null;

function flushFile() {
  wTimer = null;
  try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE + '.tmp', JSON.stringify(mem)); fs.renameSync(FILE + '.tmp', FILE); } catch (e) { console.error('db 저장 실패', e.message); }
}
const later = () => { if (!wTimer) wTimer = setTimeout(flushFile, 300); };

async function init(opts) {
  opts = opts || {};
  const url = opts.url !== undefined ? opts.url : process.env.DATABASE_URL;
  if (url) {
    mode = 'pg';
    const { Pool } = opts.PoolClass ? { Pool: opts.PoolClass } : require('pg');
    pool = new Pool({ connectionString: url, max: 4, idleTimeoutMillis: 20000, connectionTimeoutMillis: 10000,
      ssl: opts.noSsl || /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });
    pool.on('error', e => console.error('db 연결 오류', e.message));
    await pool.query('CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, pass TEXT NOT NULL, created BIGINT NOT NULL, last_login BIGINT, save TEXT NOT NULL DEFAULT \'{}\')');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT');
    secret = process.env.AUTH_SECRET || crypto.createHash('sha256').update('hl-secret:' + url).digest('hex');
  } else {
    mode = 'file';
    if (opts.file) { /* 테스트용 */ }
    try { mem = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (_) {}
    if (!mem.secret) { mem.secret = crypto.randomBytes(32).toString('hex'); later(); }
    secret = process.env.AUTH_SECRET || mem.secret;
  }
  return mode;
}
const getSecret = () => secret;
const getMode = () => mode;
const rowOf = r => r && { id: +r.id, username: r.username, pass: r.pass, created: +r.created, email: r.email || '', save: r.save ? JSON.parse(r.save) : {} };

async function getByName(u) {
  if (mode === 'pg') { const r = await pool.query('SELECT * FROM users WHERE username=$1', [u]); return rowOf(r.rows[0]); }
  const x = mem.users.find(q => q.username === u); return x ? Object.assign({}, x) : null;
}
async function getById(id) {
  if (mode === 'pg') { const r = await pool.query('SELECT * FROM users WHERE id=$1', [id]); return rowOf(r.rows[0]); }
  const x = mem.users.find(q => q.id === id); return x ? Object.assign({}, x) : null;
}
async function getByEmail(e) {
  if (!e) return null;
  if (mode === 'pg') { const r = await pool.query('SELECT * FROM users WHERE email=$1 ORDER BY id LIMIT 1', [e]); return rowOf(r.rows[0]); }
  const x = mem.users.find(q => q.email === e); return x ? Object.assign({}, x) : null;
}
async function setPass(id, pass) {
  if (mode === 'pg') { await pool.query('UPDATE users SET pass=$2 WHERE id=$1', [id, pass]); return; }
  const x = mem.users.find(q => q.id === id); if (x) { x.pass = pass; later(); }
}
async function setEmail(id, email) {
  if (mode === 'pg') { await pool.query('UPDATE users SET email=$2 WHERE id=$1', [id, email]); return; }
  const x = mem.users.find(q => q.id === id); if (x) { x.email = email; later(); }
}
async function createUser(username, pass, email) {                 // 이미 있으면 null
  const now = Date.now();
  if (mode === 'pg') {
    try { const r = await pool.query('INSERT INTO users (username,pass,created,last_login,save,email) VALUES ($1,$2,$3,$3,$4,$5) RETURNING *', [username, pass, now, '{}', email || null]); return rowOf(r.rows[0]); }
    catch (e) { if (e && (e.code === '23505' || /unique|duplicate/i.test(e.message))) return null; throw e; }
  }
  if (mem.users.some(q => q.username === username)) return null;
  const u = { id: mem.nextId++, username, pass, created: now, email: email || '', save: {} }; mem.users.push(u); later(); return Object.assign({}, u);
}
async function saveUser(id, save) {
  if (mode === 'pg') { await pool.query('UPDATE users SET save=$2 WHERE id=$1', [id, JSON.stringify(save)]); return; }
  const x = mem.users.find(q => q.id === id); if (x) { x.save = JSON.parse(JSON.stringify(save)); later(); }
}
async function touchLogin(id) {
  if (mode === 'pg') { await pool.query('UPDATE users SET last_login=$2 WHERE id=$1', [id, Date.now()]); return; }
  const x = mem.users.find(q => q.id === id); if (x) { x.last = Date.now(); later(); }
}
async function deleteUser(id) {
  if (mode === 'pg') { await pool.query('DELETE FROM users WHERE id=$1', [id]); return; }
  mem.users = mem.users.filter(q => q.id !== id); later();
}
async function count() {
  if (mode === 'pg') { const r = await pool.query('SELECT COUNT(*) c FROM users'); return +r.rows[0].c; }
  return mem.users.length;
}
module.exports = { init, getByEmail, setPass, setEmail, getByName, getById, createUser, saveUser, touchLogin, deleteUser, count, getSecret, getMode, _flush: flushFile };
