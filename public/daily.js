/* 매일 힐링 규칙 (서버와 화면이 같이 씀: 보상·가격·미션 목록) */
(function (root, f) { if (typeof module === 'object' && module.exports) module.exports = f(require('./zones.js')); else root.DAILY = f(root.ZONES); })(this, function (ZN) {
  const ACC = [null, { n: '고양이 귀', e: '🐱', p: 30 }, { n: '별 머리핀', e: '⭐', p: 30 }, { n: '토끼 귀', e: '🐰', p: 60 }, { n: '꽃 화관', e: '🌸', p: 80 }, { n: '천사 링', e: '😇', p: 100 }, { n: '작은 날개', e: '🕊️', p: 150 }, { n: '버섯 모자', e: '🍄', p: 120 }];
  const STAMP = [8, 8, 12, 12, 18, 18, 50];
  const POOL = [{ id: 'emote', t: '이모티콘 3번 보내기', n: 3 }, { id: 'chat', t: '따뜻한 인사 2번 건네기', n: 2 }, { id: 'pet', t: '동물 친구 쓰다듬기 3번', n: 3 }, { id: 'sit', t: '앉아서 20초 쉬어가기', n: 20, u: '초' }, { id: 'walk', t: '천천히 200m 걷기', n: 200, u: 'm' }, { id: 'dog', t: '강아지와 산책 40초', n: 40, u: '초' }, { id: 'star', t: '별빛 언덕에서 누워 별 보기 20초', n: 20, u: '초' }, { id: 'visit', t: '힐링 공간 2곳 둘러보기', n: 2 }];
  const ALL_BONUS = 25;
  /* 히든 미션: 달성하기 전까지는 이름이 ???로 보여요. 달성하면 바로 ✨ 보상이 들어와요 (계정당 한 번) */
  const HID = [
    { id: 'first_order', t: '첫 주문', h: '카페 카운터에서 무언가를 해 보세요', n: 1, r: 20 },
    { id: 'regular', t: '카페 단골', h: '카페를 자주 들러 보세요', n: 5, r: 40 },
    { id: 'cafe_sit', t: '카페 손님', h: '카페 안에서 편히 쉬어 보세요', n: 1, r: 15 },
    { id: 'cup', t: '분리수거 달인', h: '다 마신 뒤에는 정리를', n: 1, r: 10 },
    { id: 'drive', t: '첫 드라이브', h: '광장에 세워진 탈것을 눈여겨봐요', n: 1, r: 15 },
    { id: 'horn', t: '빵빵 소음공해', h: '운전석에서만 낼 수 있는 소리가 있어요', n: 20, r: 10 },
    { id: 'tree', t: '나무 위의 사람', h: '높은 곳에서 보는 풍경은 어떨까요', n: 1, r: 15 },
    { id: 'poop', t: '광장 지킴이', h: '길에 떨어진 것을 모른 척하지 마세요', n: 3, r: 15 },
    { id: 'trash', t: '환경미화원', h: '주운 것은 쓰레기통으로', n: 1, r: 10 },
    { id: 'zones', t: '힐링 여행자', h: '힐링 공간을 전부 한 번씩 가 보세요', n: 4, r: 30 },
    { id: 'emotes', t: '감정 부자', h: '표현을 아끼지 마세요', n: 30, r: 20 },
    { id: 'talker', t: '수다쟁이', h: '말을 많이 걸어 보세요', n: 20, r: 20 },
    { id: 'streak7', t: '7일의 약속', h: '꾸준함은 힘이 세요', n: 1, r: 50 }
  ];
  /* 카페 메뉴 (가격 = ✨ 별) */
  const MENU = [
    { id: 'americano', n: '아메리카노', e: '☕', p: 12, k: 'cup', c: '#5b3a24', t: '커피' },
    { id: 'latte', n: '카페 라떼', e: '🥛', p: 15, k: 'cup', c: '#c9a27a', t: '커피' },
    { id: 'cappu', n: '카푸치노', e: '☕', p: 15, k: 'cup', c: '#d8b894', t: '커피' },
    { id: 'vanilla', n: '바닐라 라떼', e: '🍦', p: 18, k: 'cup', c: '#e6c999', t: '커피' },
    { id: 'matcha', n: '말차 라떼', e: '🍵', p: 18, k: 'cup', c: '#8fb86a', t: '음료' },
    { id: 'berry', n: '딸기 에이드', e: '🍓', p: 20, k: 'glass', c: '#f06a82', t: '음료' },
    { id: 'croissant', n: '크루아상', e: '🥐', p: 25, k: 'plate', c: '#d9a050', t: '디저트' },
    { id: 'cake', n: '치즈 케이크', e: '🍰', p: 30, k: 'plate', c: '#f6e3a8', t: '디저트' }
  ];
  function rng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const recZone = d => ZN.ORDER[((d % 4) + 4) % 4];
  function missionsFor(day) { const r = rng(day * 7919 + 13), a = POOL.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, 3).map(q => q.id).concat('rec'); }
  function mdef(id, day) { if (id === 'rec') { const z = ZN.ZONES[recZone(day)]; return { id, t: '오늘의 추천 ' + z.emoji + ' ' + z.name + ' 들러보기', n: 1, r: 18 }; } const d = POOL.find(q => q.id === id) || POOL[0]; return Object.assign({ r: 12 }, d); }
  return { ACC, STAMP, POOL, HID, MENU, ALL_BONUS, rng, recZone, missionsFor, mdef };
});
