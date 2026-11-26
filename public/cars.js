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
  const DEF = { k: 'car', d: [0.5, -0.1, 0.55], p: [-0.5, -0.1, 0.55], rs: 0.74, sd: 1, eng: 'i4' };   // 왼쪽 운전석(한국식) — 차를 12% 키운 크기 기준
  const VINFO = {
    0: { eng: 'i4' }, 1: { d: [0.5, -0.1, 0.45], p: [-0.5, -0.1, 0.45], rs: 0.68, eng: 'v6' }, 2: { d: [0.5, -0.1, 0.45], p: [-0.5, -0.1, 0.45], rs: 0.68, eng: 'v8' }, 3: { eng: 'i4' }, 4: { eng: 'i4' }, 5: { d: [0.5, -0.1, 0.42], p: [-0.5, -0.1, 0.42], rs: 0.66, eng: 'v6' }, 6: { eng: 'v6' },
    7: { d: [0.62, 2.75, 1.0], p: [-0.62, 2.75, 1.0], rs: 0.9, eng: 'diesel' }, 8: { d: [0.62, 2.75, 1.0], p: [-0.62, 2.75, 1.0], rs: 0.9, eng: 'diesel' }, 9: { d: [0.5, 1.6, 0.95], p: [-0.5, 1.6, 0.95], rs: 0.82, eng: 'diesel' },
    10: { d: [0.46, 0.1, 0.38], p: [-0.46, 0.1, 0.38], rs: 0.62, sd: 1, eng: 'i6', fx: 'M4' },
    11: { d: [0.45, 0.06, 0.34], p: [-0.45, 0.06, 0.34], rs: 0.58, sd: 1, eng: 'i6r', fx: 'GT3' },
    12: { k: 'bike', d: [0, -0.22, 0.7], p: [0, -0.95, 0.74], rs: 0.8, sd: 1, eng: 'i4b' },
    13: { d: [0.43, 0.13, 0.29], p: [-0.43, 0.13, 0.29], rs: 0.5, sd: 1, eng: 'v8t', fx: 'F40' },
    14: { d: [0.45, 0.1, 0.29], p: [-0.45, 0.1, 0.29], rs: 0.5, sd: 1, eng: 'v12', fx: 'Countach' },
    15: { d: [0.45, 0.11, 0.29], p: [-0.45, 0.11, 0.29], rs: 0.5, sd: 1, eng: 'v12b', fx: 'Centenario' },
    16: { d: [0.45, 0.11, 0.29], p: [-0.45, 0.11, 0.29], rs: 0.5, sd: 1, eng: 'v12h', fx: 'LaFerrari' },
    17: { k: 'dragon', d: [0, 0.3, 2.45], p: [0, -0.45, 2.4], rs: 0.5, sd: 1, eng: 'dragon', fly: 1 }
    ,18: { k: 'bike', d: [0, -0.22, 0.7], p: [0, -0.95, 0.74], rs: 0.8, sd: 1, eng: 'i4b' },
    19: { d: [0.46, 0.1, 0.38], p: [-0.46, 0.1, 0.38], rs: 0.62, sd: 1, eng: 'i6', fx: 'M4' }
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
  /* 드라이빙 코스 길 구조 (서버·클라이언트 공용)
     입구 = 45° 대로. 분기점(광장 중심에서 186.5m)에서 세 갈래:
       왼쪽 = 500m 순환 (315° 대로 횡단보도로 복귀)
       가운데 = 5km 순환 (225° 대로로 복귀)
       오른쪽 = 10km 순환 (135° 대로로 복귀)
     걷기·운전 가능 영역 = 광장 원 + 길(중심선에서 hw 이내) */
  const AVD = [45, 135, 225, 315];
  const UV = d => [Math.cos(d * D2R), Math.sin(d * D2R)];
  const vA = UV(45), vB = UV(135), vC = UV(225), vD = UV(315);
  const at = (k, s, o) => [k[0] * s + (o ? o[0] : 0), k[1] * s + (o ? o[1] : 0)];
  const MOUTH = 83, RF = 186.5, X5 = 991.5, Y5 = 600, S10 = 4896.5;
  const arc = []; for (let a = 45; a >= -45 - 1e-6; a -= 7.5) arc.push(at(UV(a), RF));
  const p5a = at(vA, X5), p5b = at(vD, Y5, p5a), p5c = at(vA, -X5, at(vD, Y5)), p5d = at(vA, -X5);
  const ROUTES = [
    { id: 'L', len: 500, off: RF - MOUTH, pts: arc.concat([at(vD, MOUTH)]) },
    { id: 'M', len: 5000, off: 0, pts: [at(vA, MOUTH), p5a, p5b, p5c, p5d, at(vC, MOUTH)] },
    { id: 'R', len: 10000, off: RF - MOUTH, pts: [at(vA, RF), at(vA, RF, at(vB, S10)), at(vB, S10), at(vB, MOUTH)] }
  ];
  const STUBS = AVD.map(d => { const u = UV(d); return [[0, 0], [u[0] * 300, u[1] * 300]]; });
  const SEGS = [];
  STUBS.forEach(p => SEGS.push(p));
  ROUTES.forEach(r => { for (let i = 0; i + 1 < r.pts.length; i++) SEGS.push([r.pts[i], r.pts[i + 1]]); });
  const plen = pts => { let L = 0; for (let i = 0; i + 1 < pts.length; i++) L += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); return L; };
  ROUTES.forEach(r => { r.total = plen(r.pts); });
  /* 점에서 가장 가까운 길 위의 점: [거리, x, z] */
  function nearNet(x, z) {
    let bd = 1e18, bx = 0, bz = 0;
    for (let i = 0; i < SEGS.length; i++) {
      const a = SEGS[i][0], b = SEGS[i][1], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz;
      let t = L2 ? ((x - a[0]) * dx + (z - a[1]) * dz) / L2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const cx = a[0] + dx * t, cz = a[1] + dz * t, d = Math.hypot(x - cx, z - cz);
      if (d < bd) { bd = d; bx = cx; bz = cz; }
    }
    return [bd, bx, bz];
  }
  function clampW(x, z, R, m, hw) {
    m = m || 0; const lim = R - m, r = Math.hypot(x, z);
    if (r <= lim) return [x, z];
    let best = [x * lim / r, z * lim / r], bd = r - lim;
    if (R === WORLD_R) {
      const H = hw || 7, q = nearNet(x, z);
      if (q[0] <= H) return [x, z];
      if (q[0] - H < bd) { const k = H / q[0]; best = [q[1] + (x - q[1]) * k, q[2] + (z - q[2]) * k]; }
    }
    return best;
  }
  const API = { clamp: clampW, NET: { ROUTES, RF, MOUTH, AVD }, nearNet, WORLD_R, COLORS, SPAWNS, N: SPAWNS.length, SEAT_Y, seatAt, seatY, vinfo, BINS, ANIMALS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.CARS = API;
})(typeof window !== 'undefined' ? window : globalThis);
