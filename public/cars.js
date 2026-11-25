/* 서버와 브라우저가 같이 쓰는 값: 자동차 · 동물 · 쓰레기통 */
(function (root) {
  'use strict';
  const D2R = Math.PI / 180;
  const P = (deg, r) => [Math.cos(deg * D2R) * r, Math.sin(deg * D2R) * r];
  const WORLD_R = 83;                      // 걷기·운전 가능한 반경(m)
  const COLORS = ['#e8564a', '#f2c14a', '#4a8fc5', '#f5efe6', '#8b7bc0', '#6fbf8c', '#e58fb8', '#ee9a4a'];
  /* 주차된 자동차 8대 (처음 위치) */
  const SPAWNS = [[66, 20], [66, 110], [66, 200], [66, 290], [72, 65], [72, 155], [72, 245], [72, 335]].map((q, i) => {
    const p = P(q[1], q[0]); return { id: i, x: p[0], z: p[1], ry: Math.atan2(-Math.sin(q[1] * D2R), Math.cos(q[1] * D2R)), color: i };
  });
  const SEAT_Y = 0.62;
  /* 좌석 0(운전석) · 1(동승석)의 월드 좌표 */
  function seatAt(x, z, ry, s) {
    const lx = s ? 0.5 : -0.5, lz = -0.15, c = Math.cos(ry), sn = Math.sin(ry);
    return [x + lx * c + lz * sn, z - lx * sn + lz * c];
  }
  /* 쓰레기통 */
  const BINS = [[30, 20], [30, 110], [30, 200], [30, 290], [50, 70], [50, 160], [50, 250], [50, 340]].map(q => P(q[1], q[0]));
  /* 동물 (kind: cat/dog, coat: 털 색 번호) */
  const A = (kind, coat, name, r, deg) => { const p = P(deg, r); return { kind, coat, name, x: p[0], z: p[1] }; };
  const ANIMALS = [
    A('cat', 0, '치즈', 11, 100), A('cat', 1, '먹물', 20, 200), A('cat', 2, '구름', 34, 335), A('cat', 3, '보리', 48, 20), A('cat', 0, '나비', 56, 140), A('cat', 4, '모찌', 40, 250),
    A('dog', 0, '콩이', 16, 30), A('dog', 1, '초코', 28, 150), A('dog', 2, '두부', 44, 70), A('dog', 3, '보름', 55, 300), A('dog', 0, '호두', 22, 262), A('dog', 4, '멍이', 36, 190)
  ];
  const API = { WORLD_R, COLORS, SPAWNS, N: SPAWNS.length, SEAT_Y, seatAt, BINS, ANIMALS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.CARS = API;
})(typeof window !== 'undefined' ? window : globalThis);
