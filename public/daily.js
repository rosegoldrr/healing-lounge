/* 매일 힐링 규칙 (서버와 화면이 같이 씀: 보상·가격·미션 목록) */
(function (root, f) { if (typeof module === 'object' && module.exports) module.exports = f(require('./zones.js')); else root.DAILY = f(root.ZONES); })(this, function (ZN) {
  const ACC = [null, { n: '고양이 귀', e: '🐱', p: 30 }, { n: '별 머리핀', e: '⭐', p: 30 }, { n: '토끼 귀', e: '🐰', p: 60 }, { n: '꽃 화관', e: '🌸', p: 80 }, { n: '천사 링', e: '😇', p: 100 }, { n: '작은 날개', e: '🕊️', p: 150 }, { n: '버섯 모자', e: '🍄', p: 120 }];
  const STAMP = [5, 5, 10, 10, 15, 15, 40];
  const POOL = [{ id: 'emote', t: '이모티콘 3번 보내기', n: 3 }, { id: 'chat', t: '따뜻한 인사 2번 건네기', n: 2 }, { id: 'pet', t: '동물 친구 쓰다듬기 3번', n: 3 }, { id: 'sit', t: '앉아서 30초 쉬어가기', n: 30, u: '초' }, { id: 'walk', t: '천천히 300m 걷기', n: 300, u: 'm' }, { id: 'dog', t: '강아지와 산책 60초', n: 60, u: '초' }, { id: 'star', t: '별빛 언덕에서 누워 별 보기 30초', n: 30, u: '초' }, { id: 'visit', t: '힐링 공간 2곳 둘러보기', n: 2 }];
  const ALL_BONUS = 20;
  function rng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const recZone = d => ZN.ORDER[((d % 4) + 4) % 4];
  function missionsFor(day) { const r = rng(day * 7919 + 13), a = POOL.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, 3).map(q => q.id).concat('rec'); }
  function mdef(id, day) { if (id === 'rec') { const z = ZN.ZONES[recZone(day)]; return { id, t: '오늘의 추천 ' + z.emoji + ' ' + z.name + ' 들러보기', n: 1, r: 15 }; } const d = POOL.find(q => q.id === id) || POOL[0]; return Object.assign({ r: 10 }, d); }
  return { ACC, STAMP, POOL, ALL_BONUS, rng, recZone, missionsFor, mdef };
});
