/* 서버와 브라우저가 같이 쓰는 값: 자동차 · 동물 · 쓰레기통 */
(function (root) {
  'use strict';
  const D2R = Math.PI / 180;
  const P = (deg, r) => [Math.cos(deg * D2R) * r, Math.sin(deg * D2R) * r];
  const WORLD_R = 83;                      // 걷기·운전 가능한 반경(m)
  const COLORS = ['#e8564a', '#f2c14a', '#4a8fc5', '#f5efe6', '#8b7bc0', '#6fbf8c', '#e58fb8', '#ee9a4a', '#e2a79c'];
  /* 주차된 자동차 8대 (처음 위치) */
  const SPAWNS = [[66, 20], [66, 110], [66, 200], [66, 290], [72, 65], [72, 155], [72, 245], [72, 335], [69, 87.5], [69, 267.5], [69, 177.5], [69, 357.5], [69, 42.5], [69, 132.5], [69, 222.5], [69, 312.5], [69, 5], [46, 40], [69, 30], [69, 120]].map((q, i) => {
    const p = P(q[1], q[0]); return { id: i, x: p[0], z: p[1], ry: Math.atan2(-Math.sin(q[1] * D2R), Math.cos(q[1] * D2R)), color: [1, 7, 0, 2, 5, 3, 3, 2, 1, 3, 2, 0, 1, 0, 3, 1, 0, 0, 8, 8][i] };
  });
  const SEAT_Y = 0.62;
  /* 좌석 0(운전석) · 1(동승석)의 월드 좌표 */
  /* 탈것 정보: k 종류(car/bike/dragon) · d 운전석 · p 동승석 [옆(+왼쪽), 앞뒤, 높이] · rs 탑승자 크기 · sd 내리는 쪽 · eng 엔진 종류 */
  const DEF = { k: 'car', d: [-0.5, -0.15, 0.62], p: [0.5, -0.15, 0.62], rs: 1, sd: -1, eng: 'i4' };
  const VINFO = {
    0: { eng: 'i4' }, 1: { eng: 'v6' }, 2: { eng: 'v8' }, 3: { eng: 'i4' }, 4: { eng: 'i4' }, 5: { eng: 'v6' }, 6: { eng: 'v6' }, 7: { eng: 'diesel' }, 8: { eng: 'diesel' }, 9: { eng: 'diesel' },
    10: { d: [0.42, 0.1, 0.34], p: [-0.42, 0.1, 0.34], rs: 0.62, sd: 1, eng: 'i6', fx: 'M4' },
    11: { d: [0.4, 0.05, 0.3], p: [-0.4, 0.05, 0.3], rs: 0.58, sd: 1, eng: 'i6r', fx: 'GT3' },
    12: { k: 'bike', d: [0, 0.12, 0.62], p: [0, -0.55, 0.66], rs: 0.78, sd: 1, eng: 'i4b' },
    13: { d: [0.38, 0.12, 0.26], p: [-0.38, 0.12, 0.26], rs: 0.5, sd: 1, eng: 'v8t', fx: 'F40' },
    14: { d: [0.4, 0.08, 0.26], p: [-0.4, 0.08, 0.26], rs: 0.5, sd: 1, eng: 'v12', fx: 'Countach' },
    15: { d: [0.4, 0.1, 0.26], p: [-0.4, 0.1, 0.26], rs: 0.5, sd: 1, eng: 'v12b', fx: 'Centenario' },
    16: { d: [0.4, 0.1, 0.26], p: [-0.4, 0.1, 0.26], rs: 0.5, sd: 1, eng: 'v12h', fx: 'LaFerrari' },
    17: { k: 'dragon', d: [0, 0.3, 1.62], p: [0, -0.45, 1.57], rs: 0.5, sd: 1, eng: 'dragon', fly: 1 }
    ,18: { k: 'bike', d: [0, 0.12, 0.62], p: [0, -0.55, 0.66], rs: 0.78, sd: 1, eng: 'i4b' },
    19: { d: [0.42, 0.1, 0.34], p: [-0.42, 0.1, 0.34], rs: 0.62, sd: 1, eng: 'i6', fx: 'M4' }
  };
  const vinfo = id => { const o = VINFO[id] || {}; return { k: o.k || DEF.k, d: o.d || DEF.d, p: o.p || DEF.p, rs: o.rs || DEF.rs, sd: o.sd || DEF.sd, eng: o.eng || DEF.eng, fx: o.fx || '', fly: o.fly || 0 }; };
  /* 좌석 위치: [x, z] — 차 중심에서 옆(+왼쪽)·앞뒤로 */
  function seatAt(x, z, ry, s, id) {
    const v = vinfo(id), q = s ? v.p : v.d, lx = q[0], lz = q[1], c = Math.cos(ry), sn = Math.sin(ry);
    return [x + lx * c + lz * sn, z - lx * sn + lz * c];
  }
  const seatY = (id, s) => { const v = vinfo(id); return (s ? v.p : v.d)[2]; };
  /* 쓰레기통 */
  const BINS = [[30, 20], [30, 110], [30, 200], [30, 290], [50, 70], [50, 160], [50, 250], [50, 340]].map(q => P(q[1], q[0]));
  /* 동물 (kind: cat/dog, coat: 털 색 번호) */
  const A = (kind, coat, name, r, deg) => { const p = P(deg, r); return { kind, coat, name, x: p[0], z: p[1] }; };
  const ANIMALS = [
    A('cat', 0, '치즈', 11, 100), A('cat', 1, '먹물', 20, 200), A('cat', 2, '구름', 34, 335), A('cat', 3, '보리', 48, 20), A('cat', 0, '나비', 56, 140), A('cat', 4, '모찌', 40, 250),
    A('dog', 0, '콩이', 16, 30), A('dog', 1, '초코', 28, 150), A('dog', 2, '두부', 44, 70), A('dog', 3, '보름', 55, 300), A('dog', 0, '호두', 22, 262), A('dog', 4, '멍이', 36, 190)
  ];
  const API = { WORLD_R, COLORS, SPAWNS, N: SPAWNS.length, SEAT_Y, seatAt, seatY, vinfo, BINS, ANIMALS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.CARS = API;
})(typeof window !== 'undefined' ? window : globalThis);
