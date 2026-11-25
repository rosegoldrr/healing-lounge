'use strict';
/* 회원가입 · 로그인 (아이디+비밀번호). 비밀번호는 scrypt로 암호화해서 저장하고, 원문은 어디에도 남기지 않아요. */
const crypto = require('crypto');
const DB = require('./db.js');
const FILTER = require('./filter.js');

const TOKEN_DAYS = 30;
const scrypt = (pw, salt) => new Promise((res, rej) => crypto.scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 }, (e, k) => e ? rej(e) : res(k)));
async function hashPw(pw) { const salt = crypto.randomBytes(16); const k = await scrypt(pw, salt); return salt.toString('hex') + ':' + k.toString('hex'); }
async function checkPw(pw, stored) {
  const [s, h] = String(stored).split(':'); if (!s || !h) return false;
  const k = await scrypt(pw, Buffer.from(s, 'hex')), b = Buffer.from(h, 'hex');
  return k.length === b.length && crypto.timingSafeEqual(k, b);
}
const b64 = s => Buffer.from(s).toString('base64url');
function sign(body) { return crypto.createHmac('sha256', DB.getSecret()).update(body).digest('base64url'); }
function makeToken(u) {                                      // 아이디+만료일+비밀번호 조각을 서명 (비밀번호가 바뀌면 옛 토큰은 무효)
  const body = b64(u.id + '.' + (Date.now() + TOKEN_DAYS * 86400000) + '.' + u.pass.slice(-8));
  return body + '.' + sign(body);
}
async function verifyToken(tok) {                            // 올바르면 계정 정보, 아니면 null
  if (typeof tok !== 'string' || tok.length > 200) return null;
  const [body, sig] = tok.split('.'); if (!body || !sig) return null;
  const want = sign(body); if (want.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
  let id, exp, tail; try { [id, exp, tail] = Buffer.from(body, 'base64url').toString().split('.'); } catch (_) { return null; }
  if (!(+exp > Date.now())) return null;
  const u = await DB.getById(+id); if (!u || u.pass.slice(-8) !== tail) return null;
  return u;
}

/* 간단한 횟수 제한 (서버 메모리) */
const hits = new Map();
function limited(key, max, ms) {
  const now = Date.now(); let a = (hits.get(key) || []).filter(t => now - t < ms);
  if (a.length >= max) { hits.set(key, a); return true; }
  a.push(now); hits.set(key, a); return false;
}
setInterval(() => { const now = Date.now(); for (const [k, a] of hits) if (!a.length || now - a[a.length - 1] > 3600000) hits.delete(k); }, 600000).unref();

const NAME_RE = /^[a-z0-9_]{3,16}$/;
function checkNew(username, password) {
  if (!NAME_RE.test(username)) return '아이디는 영문 소문자·숫자·밑줄(_) 3~16자로 만들어 주세요';
  if (typeof password !== 'string' || password.length < 6 || password.length > 64) return '비밀번호는 6~64자로 정해 주세요';
  if (password.toLowerCase() === username) return '비밀번호가 아이디와 같으면 안 돼요';
  if (FILTER.clean(username).changed) return '사용할 수 없는 아이디예요';
  return '';
}
const clientIp = req => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

async function handle(kind, body, req) {                      // 결과: {code, json}
  const ip = clientIp(req);
  const username = String(body.username || '').trim().toLowerCase(), password = body.password;
  if (kind === 'signup') {
    if (limited('su:' + ip, 6, 3600000)) return { code: 429, json: { ok: false, err: '잠시 후 다시 시도해 주세요 (가입 시도가 너무 많아요)' } };
    const bad = checkNew(username, password); if (bad) return { code: 400, json: { ok: false, err: bad } };
    const u = await DB.createUser(username, await hashPw(password));
    if (!u) return { code: 409, json: { ok: false, err: '이미 있는 아이디예요' } };
    return { code: 200, json: { ok: true, token: makeToken(u), username: u.username } };
  }
  if (kind === 'login') {
    if (limited('li:' + ip, 30, 600000) || limited('lu:' + username, 10, 900000)) return { code: 429, json: { ok: false, err: '로그인 시도가 너무 많아요. 잠시 후 다시 해 주세요' } };
    const u = NAME_RE.test(username) && typeof password === 'string' && password.length <= 64 ? await DB.getByName(username) : null;
    const ok = u ? await checkPw(password, u.pass) : (await scrypt('x', Buffer.alloc(16)), false);   // 없는 아이디도 같은 시간이 걸리게
    if (!ok) return { code: 401, json: { ok: false, err: '아이디 또는 비밀번호가 맞지 않아요' } };
    DB.touchLogin(u.id).catch(() => {});
    return { code: 200, json: { ok: true, token: makeToken(u), username: u.username } };
  }
  if (kind === 'me') {
    const u = await verifyToken(body.token); if (!u) return { code: 401, json: { ok: false } };
    return { code: 200, json: { ok: true, username: u.username } };
  }
  if (kind === 'delete') {                                    // 회원 탈퇴
    const u = await verifyToken(body.token);
    if (!u || limited('de:' + ip, 10, 3600000) || !(await checkPw(String(password || ''), u.pass))) return { code: 401, json: { ok: false, err: '비밀번호가 맞지 않아요' } };
    await DB.deleteUser(u.id);
    return { code: 200, json: { ok: true, deleted: u.id } };
  }
  return { code: 404, json: { ok: false } };
}
module.exports = { handle, verifyToken, checkNew };
