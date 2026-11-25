/* 순환도로 자동차 — 서버와 브라우저가 같은 계산식을 써서, 모두에게 같은 위치로 보이게 합니다. */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const LANES = [{ r: 65, dir: 1, v: 4.2, n: 6 }, { r: 69.5, dir: -1, v: 5.0, n: 6 }];
  const cars = [];
  LANES.forEach((L, l) => { for (let k = 0; k < L.n; k++) cars.push({ id: cars.length, lane: l, r: L.r, dir: L.dir, v: L.v, a0: (k / L.n) * TAU + l * 0.55 }); });
  /* t: 서버가 시작된 뒤 지난 시간(초) → [x, z, 진행방향(ry)] */
  function pos(i, t) {
    const c = cars[i], a = c.a0 + c.dir * c.v / c.r * t;
    const x = Math.cos(a) * c.r, z = Math.sin(a) * c.r;
    const tx = c.dir > 0 ? -Math.sin(a) : Math.sin(a), tz = c.dir > 0 ? Math.cos(a) : -Math.cos(a);
    return [x, z, Math.atan2(tx, tz)];
  }
  /* 좌석(0,1)의 월드 좌표 */
  function seat(i, t, s) {
    const p = pos(i, t), lx = s ? 0.5 : -0.5, lz = -0.15, c = Math.cos(p[2]), sn = Math.sin(p[2]);
    return [p[0] + lx * c + lz * sn, p[1] - lx * sn + lz * c, p[2]];
  }
  const API = { N: cars.length, cars, pos, seat, SEAT_Y: 0.62 };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.CARS = API;
})(typeof window !== 'undefined' ? window : globalThis);
