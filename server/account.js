'use strict';
/* 계정의 게임 기록(별·출석·미션·꾸미기) 규칙. 모든 계산은 서버에서만 해요. */
const D = require('../public/daily.js');
const ZN = require('../public/zones.js');

function newSave() { return { stars: 0, streak: 0, best: 0, last: 0, stamp: 0, cards: 0, own: [0], equip: 0, m: { day: 0, list: [], prog: {}, done: {}, vis: {} } }; }
function norm(s) {
  const r = Object.assign(newSave(), s || {});
  if (!Array.isArray(r.own)) r.own = [0];
  if (!r.m || !r.m.list) r.m = newSave().m;
  if (r.equip && !r.own.includes(r.equip)) r.equip = 0;
  return r;
}
function ensureDay(sv, day) {
  if (sv.m.day !== day) sv.m = { day, list: D.missionsFor(day), prog: {}, done: {}, vis: {} };
  return sv;
}
const pubState = sv => ({ stars: sv.stars, streak: sv.streak, best: sv.best, last: sv.last, stamp: sv.stamp, cards: sv.cards, own: sv.own, equip: sv.equip,
  m: { day: sv.m.day, list: sv.m.list, done: sv.m.done, prog: Object.fromEntries(Object.entries(sv.m.prog).map(([k, v]) => [k, Math.round(v * 10) / 10])) } });

function checkin(sv, day) {
  ensureDay(sv, day);
  if (sv.last === day) return null;
  const gap = sv.last ? day - sv.last : 99;
  sv.streak = (gap === 1 || gap === 2) ? sv.streak + 1 : 1; sv.best = Math.max(sv.best, sv.streak); sv.last = day;
  if (sv.stamp >= 7) sv.stamp = 0;
  const base = D.STAMP[sv.stamp], bonus = sv.streak >= 30 ? 30 : sv.streak >= 14 ? 15 : sv.streak >= 7 ? 10 : sv.streak >= 3 ? 5 : 0;
  let gift = '';
  sv.stars += base + bonus; sv.stamp++;
  if (sv.stamp >= 7) {
    sv.cards++;
    const lk = [1, 2, 3, 4, 5, 6, 7].filter(i => !sv.own.includes(i));
    if (lk.length) { const g = lk[Math.floor(Math.random() * lk.length)]; sv.own.push(g); gift = '🎁 일곱 번째 선물: ' + D.ACC[g].e + ' ' + D.ACC[g].n + '!'; }
    else { sv.stars += 30; gift = '🎁 일곱 번째 선물: ✨ 30'; }
  }
  return '✨ +' + (base + bonus) + (bonus ? ' (연속 보너스 +' + bonus + ')' : '') + (gift ? ' · ' + gift : '');
}
function claim(sv, day, id) {
  ensureDay(sv, day);
  if (!sv.m.list.includes(id) || sv.m.done[id]) return null;
  const def = D.mdef(id, day); if ((sv.m.prog[id] || 0) < def.n) return null;
  sv.m.done[id] = true; sv.stars += def.r; let msg = '✨ +' + def.r;
  if (sv.m.list.every(k => sv.m.done[k])) { sv.stars += D.ALL_BONUS; msg += ' · 오늘 미션 모두 완료 보너스 ✨ +' + D.ALL_BONUS; }
  return msg;
}
function buy(sv, i) {
  i = Math.floor(i); if (!(i >= 1 && i <= 7) || sv.own.includes(i)) return null;
  if (sv.stars < D.ACC[i].p) return '✨ 이 부족해요. 출석과 미션으로 모아 보세요';
  sv.stars -= D.ACC[i].p; sv.own.push(i); sv.equip = i; return D.ACC[i].e + ' ' + D.ACC[i].n + ' 획득!';
}
/* 진행도 올리기. 미션이 이번에 막 채워졌으면 true */
function progress(sv, day, id, n) {
  ensureDay(sv, day);
  if (!sv.m.list.includes(id) || sv.m.done[id]) return false;
  const def = D.mdef(id, day), b = sv.m.prog[id] || 0; if (b >= def.n) return false;
  sv.m.prog[id] = Math.min(def.n, b + n);
  return sv.m.prog[id] >= def.n;
}
function visit(sv, day, zone) {
  ensureDay(sv, day); let fin = false;
  sv.m.vis[zone] = 1;
  if (sv.m.list.includes('visit') && !sv.m.done.visit) { const k = Object.keys(sv.m.vis).length, def = D.mdef('visit', day); const b = sv.m.prog.visit || 0; sv.m.prog.visit = Math.min(def.n, Math.max(b, k)); if (b < def.n && sv.m.prog.visit >= def.n) fin = true; }
  if (zone === D.recZone(day) && !sv.m.done.rec && !(sv.m.prog.rec >= 1)) { sv.m.prog.rec = 1; fin = true; }
  return fin;
}
module.exports = { newSave, norm, ensureDay, pubState, checkin, claim, buy, progress, visit };
