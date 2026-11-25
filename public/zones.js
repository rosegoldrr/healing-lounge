/* Healing Lounge — 공간(존) 정의. 서버와 브라우저가 같이 씁니다.
   좌표는 공간마다 (0,0)이 가운데인 "공간 안 좌표"예요.
   브라우저는 화면에 그릴 때만 ox, oz 만큼 멀리 떨어진 곳에 놓아서 공간끼리 서로 안 보이게 합니다. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.ZONES = api;
})(typeof window !== 'undefined' ? window : this, function () {
  const D2R = Math.PI / 180, P = (deg, r) => [Math.cos(deg * D2R) * r, Math.sin(deg * D2R) * r];
  const Z = {
    plaza:  { id: 'plaza',  name: '힐링 광장', emoji: '🌿', R: 83, ox: 0, oz: 0, hour: null },
    forest: { id: 'forest', name: '숲속 쉼터',   emoji: '🌲', R: 42, ox: 1500, oz: 0,    hour: 8.6,  fog: [26, 150], gate: [0, 32],  tag: '햇살이 내려오는 이끼 숲',   color: '#8fd18b' },
    beach:  { id: 'beach',  name: '노을 바닷가', emoji: '🌅', R: 44, ox: 0,    oz: 1500, hour: 18.4, fog: [40, 260], gate: [32, 4],  tag: '파도 소리와 모닥불',         color: '#ffb48a' },
    stars:  { id: 'stars',  name: '별빛 언덕',   emoji: '🌌', R: 42, ox: -1500, oz: 0,   hour: 23.6, fog: [50, 300], gate: [0, 32],  tag: '누워서 별을 보는 밤',       color: '#a9b8ff' },
    spring: { id: 'spring', name: '달빛 온천',   emoji: '♨️', R: 38, ox: 0,   oz: -1500, hour: 20.7, fog: [24, 130], gate: [0, 30],  tag: '등불 아래 따뜻한 물',       color: '#f7b3d0' },
  };
  const ORDER = ['forest', 'beach', 'stars', 'spring'];
  /* 광장 안 입구(달문) 위치: 큰길 방향 반경 32m */
  const PLAZA_GATES = ORDER.map((id, i) => { const p = P(45 + i * 90, 32); return { to: id, x: +p[0].toFixed(2), z: +p[1].toFixed(2) }; });
  ORDER.forEach(id => {
    const z = Z[id], g = z.gate, d = Math.hypot(g[0], g[1]);
    z.spawn = [+(g[0] - g[0] / d * 5.5).toFixed(2), +(g[1] - g[1] / d * 5.5).toFixed(2)];
  });
  return { ZONES: Z, ORDER, PLAZA_GATES, GATE_RANGE: 5.5 };
});
