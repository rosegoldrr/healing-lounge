/* ─────────────────────────────────────────────────────────────
   Office Worker City — 퇴근길 광장 배경 (2단계)
   고층 빌딩 · 광장 · 분수 · 카페 · 편의점 · 벤치 · 가로등 · 노을 하늘
   buildCity(THREE, scene, renderer) → { update, resolve, camBlocked, benches, ... }
   ───────────────────────────────────────────────────────────── */
(function (global) {
'use strict';

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function buildCity(THREE, scene, renderer) {
  const rnd = mulberry32(20261125);
  const R = (a, b) => a + (b - a) * rnd();
  const TAU = Math.PI * 2, D2R = Math.PI / 180;
  const city = { colliders: [], boxes: [], benches: [], trees: [], spots: {}, world: 60 };
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const tmp = new THREE.Object3D();
  const FOG = '#f4a98a';
  const SUN_AZ = 225 * D2R;
  const sunDir = new THREE.Vector3(Math.cos(SUN_AZ) * 0.98, 0.17, Math.sin(SUN_AZ) * 0.98).normalize();
  const NIGHT = 0.62;                              // 창문 불 켜진 정도 (3단계에서 시간대 동기화 예정)
  const AV = [45, 135, 225, 315];                  // 대로 방향(도)

  /* ── 공통 도우미 ── */
  function ctex(w, h, draw, o) {
    o = o || {};
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); draw(g, w, h);
    const t = new THREE.CanvasTexture(c);
    if (o.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(o.repeat[0], o.repeat[1]); }
    t.anisotropy = aniso; return t;
  }
  const matCache = {};
  function M(color, o) { const k = color + JSON.stringify(o || {}); return matCache[k] || (matCache[k] = new THREE.MeshLambertMaterial(Object.assign({ color }, o || {}))); }
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const cyl8 = new THREE.CylinderGeometry(1, 1, 1, 10);
  function mesh(geo, mat, x, y, z, ry) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (ry) m.rotation.y = ry; scene.add(m); return m; }
  function box(sx, sy, sz, mat, x, y, z, ry) { const m = mesh(unit, mat, x, y, z, ry); m.scale.set(sx, sy, sz); return m; }
  function frame(x, z, ry) { const c = Math.cos(ry), s = Math.sin(ry); return { x, z, ry, w: (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c] }; }
  const faceCenter = (x, z) => Math.atan2(-x, -z);
  const P = (deg, r) => [Math.cos(deg * D2R) * r, Math.sin(deg * D2R) * r];
  function angDiff(a, b) { return Math.abs(((a - b + 540) % 360) - 180); }
  const avDist = deg => Math.min.apply(null, AV.map(a => angDiff(deg, a)));
  function addCircle(x, z, r) { city.colliders.push({ x, z, r }); }
  function addBoxCol(x, z, hw, hd, ry, h) { const b = { x, z, hw, hd, ry, h, c: Math.cos(ry), s: Math.sin(ry) }; city.boxes.push(b); }

  /* 인스턴스 묶음 */
  function Inst(geo, mat) { this.geo = geo; this.mat = mat; this.items = []; }
  Inst.prototype.add = function (x, y, z, ry, sx, sy, sz, color, rx) { this.items.push([x, y, z, ry || 0, sx == null ? 1 : sx, sy == null ? 1 : sy, sz == null ? 1 : sz, color, rx || 0]); };
  Inst.prototype.build = function () {
    const n = this.items.length; if (!n) return null;
    const m = new THREE.InstancedMesh(this.geo, this.mat, n); const col = new THREE.Color(); let hc = false;
    for (let i = 0; i < n; i++) {
      const it = this.items[i];
      tmp.position.set(it[0], it[1], it[2]); tmp.rotation.set(it[8], it[3], 0, 'YXZ'); tmp.scale.set(it[4], it[5], it[6]); tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix); if (it[7] != null) { col.set(it[7]); m.setColorAt(i, col); hc = true; }
    }
    m.instanceMatrix.needsUpdate = true; if (hc && m.instanceColor) m.instanceColor.needsUpdate = true;
    m.frustumCulled = false; scene.add(m); return m;
  };

  /* 부드러운 원형 글로우 / 그림자 텍스처 */
  const glowTex = ctex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const blobTex = ctex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const rectTex = ctex(64, 64, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); const gx = g.createLinearGradient(0, 0, w, 0); gx.addColorStop(0, '#000'); gx.addColorStop(0.2, '#fff'); gx.addColorStop(0.8, '#fff'); gx.addColorStop(1, '#000'); const c2 = document.createElement('canvas'); c2.width = w; c2.height = h; const g2 = c2.getContext('2d'); g2.fillStyle = gx; g2.fillRect(0, 0, w, h); g2.globalCompositeOperation = 'multiply'; const gy = g2.createLinearGradient(0, 0, 0, h); gy.addColorStop(0, '#000'); gy.addColorStop(0.2, '#fff'); gy.addColorStop(0.8, '#fff'); gy.addColorStop(1, '#000'); g2.fillStyle = gy; g2.fillRect(0, 0, w, h); g.drawImage(c2, 0, 0); });
  city.blobTex = blobTex;

  const shadowBlobs = [], shadowRects = [], glowPts = [];
  function shadow(x, z, sx, sz, ry, a) { shadowBlobs.push([x, z, sx, sz, ry || 0, a == null ? 1 : a]); }
  function shadowRect(x, z, sx, sz, ry) { shadowRects.push([x, z, sx, sz, ry || 0]); }
  function glow(x, y, z) { glowPts.push(x, y, z); }

  /* ═════════ 하늘 · 안개 · 빛 ═════════ */
  scene.background = new THREE.Color(FOG);
  scene.fog = new THREE.Fog(FOG, 80, 330);
  scene.add(new THREE.HemisphereLight('#ffdcc2', '#7a6a98', 0.92));
  const sunL = new THREE.DirectionalLight('#ffb98a', 0.9); sunL.position.copy(sunDir).multiplyScalar(120); scene.add(sunL);

  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uSun: { value: sunDir } },
    vertexShader: 'varying vec3 vD; void main(){ vD=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: [
      'varying vec3 vD; uniform vec3 uSun;',
      'void main(){ vec3 d=normalize(vD); float h=d.y;',
      ' vec3 hor=vec3(0.957,0.663,0.541); vec3 mid=vec3(0.86,0.50,0.60); vec3 top=vec3(0.17,0.20,0.44);',
      ' vec3 c=mix(hor,mid,smoothstep(0.0,0.20,h)); c=mix(c,top,smoothstep(0.14,0.70,h));',
      ' float s=max(dot(d,uSun),0.0);',
      ' c+=vec3(1.0,0.60,0.30)*pow(s,5.0)*0.55+vec3(1.0,0.82,0.55)*pow(s,36.0)*0.75+vec3(1.0,0.96,0.82)*smoothstep(0.9986,0.9996,s)*1.6;',
      ' c=mix(c,hor,(1.0-smoothstep(-0.12,0.02,h)));',
      ' gl_FragColor=vec4(c,1.0); }'
    ].join('\n')
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(470, 32, 18), skyMat); sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);

  /* 물감 구름 */
  const cloudTex = ctex(256, 128, (g, w, h) => {
    function puff(x, y, rx, ry, col, a) { g.save(); g.translate(x, y); g.scale(rx, ry); const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1); gr.addColorStop(0, col.replace('A', a)); gr.addColorStop(0.6, col.replace('A', a * 0.55)); gr.addColorStop(1, col.replace('A', 0)); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.fill(); g.restore(); }
    for (let i = 0; i < 9; i++) puff(40 + i * 22 + R(-8, 8), 70 + R(-10, 8), R(30, 50), R(16, 26), 'rgba(236,150,170,A)', 0.7);
    for (let i = 0; i < 9; i++) puff(44 + i * 21 + R(-8, 8), 56 + R(-10, 6), R(28, 46), R(14, 24), 'rgba(255,228,210,A)', 0.85);
  });
  const clouds = new THREE.Group();
  for (let i = 0; i < 12; i++) {
    const m = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, opacity: R(0.55, 0.9), color: i % 3 === 0 ? '#ffc7a6' : '#ffe6e0' });
    const s = new THREE.Sprite(m); const az = i / 12 * TAU + R(-0.2, 0.2), el = R(0.12, 0.42); const dist = 400;
    s.position.set(Math.cos(az) * dist * Math.cos(el), Math.sin(el) * dist, Math.sin(az) * dist * Math.cos(el));
    s.scale.set(R(150, 260), R(50, 90), 1); clouds.add(s);
  }
  scene.add(clouds);

  /* ═════════ 바닥 ═════════ */
  const base = mesh(new THREE.CircleGeometry(440, 48), M('#6d6279'), 0, -0.04, 0); base.rotation.x = -Math.PI / 2;

  // 광장 포장
  const paverTex = ctex(512, 512, (g, w, h) => {
    g.fillStyle = '#d8c5ab'; g.fillRect(0, 0, w, h);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      const l = 82 + Math.floor(R(-6, 7)), a = 70 + Math.floor(R(-7, 6)), b = 58 + Math.floor(R(-6, 6));
      g.fillStyle = 'hsl(' + (30 + R(-4, 4)) + ',' + (28 + R(-5, 6)) + '%,' + l + '%)'; g.fillRect(i * 128 + 3, j * 128 + 3, 122, 122);
      for (let k = 0; k < 90; k++) { g.fillStyle = 'rgba(' + (k % 2 ? '120,95,70' : '255,245,225') + ',' + R(0.03, 0.09) + ')'; g.fillRect(i * 128 + R(4, 124), j * 128 + R(4, 124), R(2, 7), R(1, 4)); }
    }
    g.strokeStyle = 'rgba(150,125,100,.75)'; g.lineWidth = 4;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, h); g.stroke(); g.beginPath(); g.moveTo(0, i * 128); g.lineTo(w, i * 128); g.stroke(); }
  }, { repeat: [31, 31] });
  const plaza = mesh(new THREE.CircleGeometry(62, 96), new THREE.MeshLambertMaterial({ map: paverTex }), 0, 0, 0); plaza.rotation.x = -Math.PI / 2;

  // 손으로 그린 듯한 문양(링·방사선·대로 카펫)
  const paintTex = ctex(2048, 2048, (g, w, h) => {
    const c = w / 2, k = c / 62;                     // 1m = k px
    g.translate(c, c);
    function ring(r0, r1, col) { g.beginPath(); g.arc(0, 0, r1 * k, 0, TAU); g.arc(0, 0, r0 * k, 0, TAU, true); g.fillStyle = col; g.fill('evenodd'); }
    ring(6.4, 9.6, 'rgba(255,240,215,.55)'); ring(9.6, 9.9, 'rgba(160,120,90,.55)'); ring(6.1, 6.4, 'rgba(160,120,90,.55)');
    ring(22, 22.25, 'rgba(160,120,90,.28)'); ring(38, 38.25, 'rgba(160,120,90,.28)');
    ring(57.6, 61.6, 'rgba(120,95,80,.55)'); ring(57.2, 57.6, 'rgba(255,235,205,.5)');
    for (let i = 0; i < 32; i++) { const a = i / 32 * TAU; g.save(); g.rotate(a); g.fillStyle = 'rgba(255,238,210,.22)'; g.fillRect(10 * k, -0.18 * k, 47 * k, 0.36 * k); g.restore(); }
    AV.forEach(d => { g.save(); g.rotate(d * D2R); g.fillStyle = 'rgba(255,230,196,.30)'; g.fillRect(9.8 * k, -4.4 * k, 49 * k, 8.8 * k); g.fillStyle = 'rgba(150,104,84,.5)'; g.fillRect(9.8 * k, -4.5 * k, 49 * k, 0.3 * k); g.fillRect(9.8 * k, 4.2 * k, 49 * k, 0.3 * k); g.fillStyle = 'rgba(255,225,190,.35)'; g.fillRect(9.8 * k, -0.25 * k, 49 * k, 0.5 * k);
      for (let q = 0; q < 8; q++) { g.fillStyle = 'rgba(255,240,215,.38)'; g.beginPath(); g.arc((14 + q * 5.5) * k, 0, 0.55 * k, 0, TAU); g.fill(); } g.restore(); });
    // 별 모양 인레이
    for (let i = 0; i < 8; i++) { g.save(); g.rotate(i * Math.PI / 4); g.fillStyle = 'rgba(255,238,208,.34)'; g.strokeStyle = 'rgba(150,104,84,.45)'; g.lineWidth = 0.18 * k; g.beginPath(); g.moveTo(11 * k, 0); g.lineTo(15 * k, -1.5 * k); g.lineTo(19 * k, 0); g.lineTo(15 * k, 1.5 * k); g.closePath(); g.fill(); g.stroke(); g.restore(); }
    // 붓터치 얼룩
    for (let i = 0; i < 260; i++) { const a = R(0, TAU), r = R(2, 60) * k; g.save(); g.translate(Math.cos(a) * r, Math.sin(a) * r); g.rotate(R(0, TAU)); const gr = g.createRadialGradient(0, 0, 0, 0, 0, 40 + R(0, 90)); const warm = rnd() < 0.5; gr.addColorStop(0, warm ? 'rgba(255,225,190,.10)' : 'rgba(110,90,140,.08)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(-140, -140, 280, 280); g.restore(); }
  });
  const paint = mesh(new THREE.CircleGeometry(62, 96), new THREE.MeshLambertMaterial({ map: paintTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 0, 0.03, 0); paint.rotation.x = -Math.PI / 2;

  // 순환 도로 + 보도
  const asphalt = M('#4d4862');
  const roadRing = mesh(new THREE.RingGeometry(61.9, 77, 128), asphalt, 0, 0.02, 0); roadRing.rotation.x = -Math.PI / 2;
  const walkRing = mesh(new THREE.RingGeometry(77, 85, 128), M('#cdb9a4'), 0, 0.05, 0); walkRing.rotation.x = -Math.PI / 2;
  const curb = new THREE.Mesh(new THREE.LatheGeometry([[60.3, 0], [60.3, 0.3], [61.7, 0.3], [61.7, 0]].map(p => new THREE.Vector2(p[0], p[1])), 128), M('#c2b19f', { side: THREE.DoubleSide })); scene.add(curb);
  // 중앙선(점선) · 횡단보도 · 대로
  { const dash = new Inst(unit, M('#f3dca2'));
    for (let i = 0; i < 90; i++) { const a = i / 90 * TAU, r = 69.5; dash.add(Math.cos(a) * r, 0.045, Math.sin(a) * r, Math.atan2(-Math.sin(a), Math.cos(a)) + 0, 0.22, 0.02, 2.6, null); }
    // 도로 방향(접선)에 맞게 회전: 접선=(−sin a, cos a) → ry=atan2(tx,tz)
    dash.items.forEach((it, i) => { const a = i / 90 * TAU; it[3] = Math.atan2(-Math.sin(a), Math.cos(a)); }); dash.build();
    const zebra = new Inst(unit, M('#f2ece0'));
    AV.forEach(d => { const ry0 = Math.atan2(-Math.sin(d * D2R), Math.cos(d * D2R)); for (let q = 0; q < 11; q++) { const r = 63 + q * 1.3; const [x, z] = P(d, r); zebra.add(x, 0.05, z, ry0, 0.7, 0.02, 4.2); } });
    zebra.build();
    AV.forEach(d => {
      const g = new THREE.Group(); g.rotation.y = Math.atan2(Math.cos(d * D2R), Math.sin(d * D2R)); scene.add(g);
      const av = new THREE.Mesh(new THREE.PlaneGeometry(17, 240), asphalt); av.rotation.x = -Math.PI / 2; av.position.set(0, 0.06, 196); g.add(av);
      [-1, 1].forEach(s => { const sw = new THREE.Mesh(new THREE.PlaneGeometry(5, 240), M('#cdb9a4')); sw.rotation.x = -Math.PI / 2; sw.position.set(s * 11, 0.07, 196); g.add(sw); });
      const dl = new Inst(unit, M('#f3dca2'));
      for (let q = 0; q < 26; q++) { const z = 88 + q * 8; const a = d * D2R; dl.add(Math.cos(a) * z, 0.09, Math.sin(a) * z, g.rotation.y, 0.22, 0.02, 3.2); }
      dl.build();
    });
  }

  /* ═════════ 고층 빌딩 (한 덩어리로 병합 + 창문 셰이더) ═════════ */
  const bp = [], bn = [], bt = [], bu = [], bi = [], bx = [];
  function jit(hex, k) { const c = new THREE.Color(hex); const j = k || 0.07; return [Math.min(1, Math.max(0, c.r + R(-j, j))), Math.min(1, Math.max(0, c.g + R(-j, j))), Math.min(1, Math.max(0, c.b + R(-j, j)))]; }
  function quad(p, n, uv, tint, info) {
    const o = bp.length / 3;
    for (let i = 0; i < 4; i++) { bp.push(p[i][0], p[i][1], p[i][2]); bn.push(n[0], n[1], n[2]); bt.push(tint[0], tint[1], tint[2]); bi.push(info[0], info[1], info[2], info[3]); }
    bu.push(uv[0], uv[2], uv[1], uv[2], uv[1], uv[3], uv[0], uv[3]);
    bx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  function addBox(cx, cz, w, d, y0, y1, ry, tint, seed, bias, style) {
    const c = Math.cos(ry), s = Math.sin(ry);
    const W = (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c];
    const faces = [{ n: [0, 0, 1], t: [1, 0, 0], hT: w / 2, off: d / 2, len: w }, { n: [1, 0, 0], t: [0, 0, -1], hT: d / 2, off: w / 2, len: d },
                   { n: [0, 0, -1], t: [-1, 0, 0], hT: w / 2, off: d / 2, len: w }, { n: [-1, 0, 0], t: [0, 0, 1], hT: d / 2, off: w / 2, len: d }];
    const info = [seed, bias, y1, style];
    faces.forEach((f, fi) => {
      const cols = Math.max(2, Math.round(f.len / 3.2)); const pts = [];
      [[-1, y0], [1, y0], [1, y1], [-1, y1]].forEach(q => { const lx = f.n[0] * f.off + f.t[0] * f.hT * q[0], lz = f.n[2] * f.off + f.t[2] * f.hT * q[0]; const wp = W(lx, lz); pts.push([wp[0], q[1], wp[1]]); });
      const nw = [f.n[0] * c + f.n[2] * s, 0, -f.n[0] * s + f.n[2] * c];
      quad(pts, nw, [0, cols, y0 / 3.6, y1 / 3.6], tint, info);
    });
    const hx = w / 2, hz = d / 2; const rp = [[-hx, -hz], [-hx, hz], [hx, hz], [hx, -hz]].map(q => { const wp = W(q[0], q[1]); return [wp[0], y1, wp[1]]; });
    quad(rp, [0, 1, 0], [0, 1, 0, 1], tint.map(v => v * 0.82), info);
  }
  const TINTS = ['#9099b8', '#a79fb9', '#c4a2a4', '#9fb1bf', '#bba890', '#8196a8', '#ab9bb2', '#cdb08e', '#86a0a6'];
  function addTower(cx, cz, w, d, h, ry, shop, hazy) {
    const tint = TINTS[Math.floor(rnd() * TINTS.length)], seed = Math.floor(rnd() * 900), glass = rnd() < 0.45 ? 1 : 0, bias = R(0.65, 1.2);
    const mode = rnd();
    if (mode < 0.35) addBox(cx, cz, w, d, 0, h, ry, jit(tint), seed, bias, (shop ? 2 : 0) + glass);
    else if (mode < 0.72) { const ph = R(6, 11); addBox(cx, cz, w, d, 0, ph, ry, jit(TINTS[Math.floor(rnd() * TINTS.length)]), seed, bias, shop ? 2 : 0); addBox(cx, cz, w * 0.72, d * 0.72, ph, h, ry, jit(tint), seed + 1, bias, glass); }
    else { const h1 = h * 0.5, h2 = h * 0.8; addBox(cx, cz, w, d, 0, h1, ry, jit(tint), seed, bias, (shop ? 2 : 0) + glass); addBox(cx, cz, w * 0.78, d * 0.78, h1, h2, ry, jit(tint), seed + 2, bias, glass); addBox(cx, cz, w * 0.5, d * 0.5, h2, h, ry, jit(tint), seed + 3, bias, glass); }
    addBox(cx, cz, w * 0.3, d * 0.3, h, h + 2.4, ry, [0.5, 0.48, 0.55], 0, 0, -1);
    if (rnd() < 0.55) addBox(cx, cz, 0.5, 0.5, h + 2.4, h + 2.4 + R(6, 20), ry, [0.35, 0.33, 0.4], 0, 0, -1);
  }
  function skyline(rMin, rMax, count, wr, hr, shop, skip) {
    for (let i = 0; i < count; i++) {
      const deg = (i + R(-0.3, 0.3)) * 360 / count, r = R(rMin, rMax), w = R(wr[0], wr[1]), d = R(wr[0] * 0.7, wr[1] * 0.85), h = R(hr[0], hr[1]);
      const half = Math.atan2(11 + Math.max(w, d) * 0.55, r) / D2R;
      if (avDist(deg) < half) continue;
      if (skip && skip.some(s => angDiff(deg, s) < 14)) continue;
      const [cx, cz] = P(deg, r + d * 0.5);
      addTower(cx, cz, w, d, h, faceCenter(cx, cz) + (shop ? 0 : R(-0.12, 0.12)), shop);
    }
  }
  const BILL = [112, 292];
  skyline(86, 90, 27, [14, 22], [30, 74], true, BILL);
  skyline(112, 130, 30, [20, 32], [70, 150], false);
  skyline(158, 205, 32, [26, 40], [110, 230], false);
  skyline(235, 300, 30, [34, 52], [150, 300], false);
  // 전광판 건물 두 곳
  const billTex = ctex(512, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#3a2f7a'); gr.addColorStop(0.6, '#c2557f'); gr.addColorStop(1, '#ffae6a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(255,255,255,' + R(0.04, 0.12) + ')'; g.beginPath(); g.arc(R(0, w), R(0, h), R(8, 40), 0, TAU); g.fill(); }
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 54px "Noto Sans KR","Malgun Gothic","Apple SD Gothic Neo",sans-serif'; g.fillText('오늘도 수고했어요', w / 2, 98);
    g.font = '600 30px "Noto Sans KR","Malgun Gothic","Apple SD Gothic Neo",sans-serif'; g.fillStyle = '#ffe9c4'; g.fillText('OFFICE WORKER CITY · 퇴근길 광장', w / 2, 168);
    g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20);
  });
  BILL.forEach((deg, i) => {
    const w = 26, d = 15, h = 48, rc = 86 + d / 2; const [cx, cz] = P(deg, rc); const ry = faceCenter(cx, cz);
    addBox(cx, cz, w, d, 0, h, ry, jit('#8d94b4'), 500 + i, 1.0, 3);
    addBox(cx, cz, w * 0.3, d * 0.3, h, h + 2.4, ry, [0.5, 0.48, 0.55], 0, 0, -1);
    const f = frame(cx, cz, ry); const [px, pz] = f.w(0, d / 2 + 0.2);
    const bm = mesh(new THREE.PlaneGeometry(18, 9), new THREE.MeshBasicMaterial({ map: billTex, fog: true }), px, 24, pz, ry);
    glow(px, 24, pz);
  });
  const bGeo = new THREE.BufferGeometry();
  bGeo.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3)); bGeo.setAttribute('normal', new THREE.Float32BufferAttribute(bn, 3));
  bGeo.setAttribute('aTint', new THREE.Float32BufferAttribute(bt, 3)); bGeo.setAttribute('aUV', new THREE.Float32BufferAttribute(bu, 2)); bGeo.setAttribute('aInfo', new THREE.Float32BufferAttribute(bi, 4));
  bGeo.setIndex(bx);
  const bMat = new THREE.ShaderMaterial({
    uniforms: { uFog: { value: new THREE.Color(FOG) }, uNear: { value: 80 }, uFar: { value: 330 }, uNight: { value: NIGHT }, uSun: { value: sunDir } },
    vertexShader: [
      'attribute vec3 aTint; attribute vec2 aUV; attribute vec4 aInfo;',
      'varying vec3 vW; varying vec3 vN; varying vec3 vT; varying vec2 vUV; varying vec4 vI;',
      'void main(){ vW=position; vN=normal; vT=aTint; vUV=aUV; vI=aInfo; gl_Position=projectionMatrix*viewMatrix*vec4(position,1.0); }'
    ].join('\n'),
    fragmentShader: [
      'uniform vec3 uFog; uniform float uNear; uniform float uFar; uniform float uNight; uniform vec3 uSun;',
      'varying vec3 vW; varying vec3 vN; varying vec3 vT; varying vec2 vUV; varying vec4 vI;',
      'float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }',
      'float vn(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h21(i),h21(i+vec2(1.0,0.0)),f.x),mix(h21(i+vec2(0.0,1.0)),h21(i+vec2(1.0,1.0)),f.x),f.y); }',
      'void main(){',
      ' vec3 N=normalize(vN); bool roof=N.y>0.5; float sunF=max(dot(N,uSun),0.0);',
      ' vec3 amb=mix(vec3(0.46,0.40,0.60),vec3(0.84,0.64,0.68),clamp(N.y*0.5+0.5,0.0,1.0));',
      ' float nz=vn(vW.xz*0.10+vW.y*0.045)*0.55+vn(vec2(vUV.x*0.9,vUV.y*0.5)+fract(floor(vI.x+0.5)*0.37)*9.0)*0.45;',
      ' vec3 wall=vT*(0.86+0.26*nz);',
      ' float hy=clamp(vW.y/max(vI.z,1.0),0.0,1.0);',
      ' wall*=mix(0.80,1.0,smoothstep(0.0,0.30,hy));',
      ' vec3 light=amb+vec3(1.0,0.66,0.40)*sunF*0.95;',
      ' vec3 col=wall*light;',
      ' if(!roof && vI.w>-0.5){',
      '  vec2 cell=floor(vUV); vec2 f=fract(vUV);',
      '  float st=floor(vI.w+0.5); bool glass=mod(st,2.0)>0.5; bool shop=st>1.5; bool row=shop && vUV.y<1.0;',
      '  vec2 lo=glass?vec2(0.05,0.07):vec2(0.20,0.20); vec2 hi=glass?vec2(0.95,0.93):vec2(0.80,0.78);',
      '  if(row){ lo=vec2(0.06,0.10); hi=vec2(0.94,0.90); }',
      '  float m=smoothstep(lo.x,lo.x+0.04,f.x)*(1.0-smoothstep(hi.x-0.04,hi.x,f.x))*smoothstep(lo.y,lo.y+0.04,f.y)*(1.0-smoothstep(hi.y-0.04,hi.y,f.y));',
      '  float sd=floor(vI.x+0.5); float rnd=h21(cell+vec2(fract(sd*0.618)*41.0,fract(sd*0.381)*29.0));',
      '  float lit=step(rnd,mix(0.10,0.80,uNight)*vI.y); if(row) lit=1.0;',
      '  vec3 sky=mix(vec3(0.24,0.26,0.46),vec3(0.96,0.60,0.50),pow(sunF,1.4)*0.9+0.08);',
      '  vec3 gl=(glass?sky*0.95+vec3(0.0,0.03,0.07):sky*0.7)*(0.75+0.25*light.r);',
      '  vec3 warm=mix(vec3(1.0,0.72,0.38),vec3(1.0,0.94,0.80),h21(cell+vec2(3.1,fract(sd*0.7)*17.0)));',
      '  vec3 win=mix(gl,warm*(0.95+0.45*rnd),lit);',
      '  col=mix(col,win,m*0.94);',
      '  col*=1.0-0.10*smoothstep(0.0,0.12,lo.y-f.y+0.04)*(1.0-m);',
      ' }',
      ' col+=vec3(1.0,0.52,0.24)*sunF*smoothstep(0.55,1.0,hy)*0.28;',
      ' float d=length(vW-cameraPosition); col=mix(col,uFog,smoothstep(uNear,uFar,d));',
      ' gl_FragColor=vec4(col,1.0); }'
    ].join('\n')
  });
  const bMesh = new THREE.Mesh(bGeo, bMat); bMesh.frustumCulled = false; scene.add(bMesh);

  /* ═════════ 분수 (광장 한가운데) ═════════ */
  const V2 = a => a.map(p => new THREE.Vector2(p[0], p[1]));
  const stone = M('#ddd0be', { side: THREE.DoubleSide }), stoneD = M('#c4b4a0', { side: THREE.DoubleSide });
  scene.add(new THREE.Mesh(new THREE.LatheGeometry(V2([[0, 0.5], [5.15, 0.5], [5.15, 1.1], [5.5, 1.22], [5.9, 1.1], [5.9, 0]]), 56), stone));
  scene.add(new THREE.Mesh(new THREE.LatheGeometry(V2([[0, 0.5], [1.4, 0.55], [1.05, 1.2], [0.58, 1.9], [0.52, 2.9]]), 32), stoneD));
  scene.add(new THREE.Mesh(new THREE.LatheGeometry(V2([[0.4, 2.75], [1.5, 2.9], [2.5, 3.32], [2.58, 3.48], [2.36, 3.42], [1.4, 3.1], [0.35, 3.0]]), 48), stone));
  const stem = mesh(cyl8, stoneD, 0, 3.5, 0); stem.scale.set(0.32, 1.2, 0.32);
  scene.add(new THREE.Mesh(new THREE.LatheGeometry(V2([[0.3, 3.95], [0.9, 4.05], [1.35, 4.32], [1.4, 4.46], [1.2, 4.4], [0.8, 4.2], [0.25, 4.12]]), 40), stone));
  mesh(new THREE.SphereGeometry(0.26, 12, 10), M('#e8d9a0'), 0, 4.62, 0);
  const waterMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { uT: { value: 0 } },
    vertexShader: 'varying vec2 vP; void main(){ vP=position.xy; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: [
      'uniform float uT; varying vec2 vP;',
      'float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }',
      'void main(){ float r=length(vP); float w=sin(r*6.5-uT*2.3)*0.5+0.5; float w2=sin(vP.x*3.1+uT*1.3)*sin(vP.y*2.7-uT*1.1)*0.5+0.5;',
      ' vec3 c=mix(vec3(0.34,0.68,0.78),vec3(0.66,0.92,0.94),w*0.45+w2*0.4);',
      ' float sp=step(0.988,h(floor(vP*7.0)+floor(uT*3.0))); c+=sp*0.55;',
      ' c=mix(c,vec3(1.0,0.78,0.62),smoothstep(3.0,5.1,r)*0.25);',
      ' gl_FragColor=vec4(c,0.93*(1.0-smoothstep(4.9,5.15,r))); }'
    ].join('\n')
  });
  const water = new THREE.Mesh(new THREE.CircleGeometry(5.15, 56), waterMat); water.rotation.x = -Math.PI / 2; water.position.y = 0.98; scene.add(water);
  const sheetMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uT: { value: 0 } },
    vertexShader: 'varying vec2 vU; void main(){ vU=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform float uT; varying vec2 vU; void main(){ float s=sin(vU.y*34.0-uT*8.0+vU.x*70.0)*0.5+0.5; float a=(0.16+0.30*s)*smoothstep(0.0,0.1,vU.y)*(1.0-smoothstep(0.85,1.0,vU.y)); gl_FragColor=vec4(0.80,0.96,1.0,a); }'
  });
  scene.add(new THREE.Mesh(new THREE.LatheGeometry(V2([[2.55, 3.42], [2.85, 2.6], [3.1, 1.7], [3.22, 1.0]]), 56), sheetMat));
  scene.add(new THREE.Mesh(new THREE.LatheGeometry(V2([[1.38, 4.4], [1.62, 3.95], [1.9, 3.5]]), 40), sheetMat));
  addCircle(0, 0, 5.95);
  shadow(1.2, 1.2, 15, 15, 0, 0.55);
  // 물방울
  const NDROP = 240, dropData = [], dropPos = new Float32Array(NDROP * 3);
  for (let i = 0; i < NDROP; i++) dropData.push({ a: R(0, TAU), vh: i % 4 === 0 ? R(0.1, 0.6) : R(1.0, 2.9), v0: i % 4 === 0 ? R(7.5, 9.0) : R(3.6, 6.2), ph: rnd() });
  const dropGeo = new THREE.BufferGeometry(); dropGeo.setAttribute('position', new THREE.BufferAttribute(dropPos, 3));
  const drops = new THREE.Points(dropGeo, new THREE.PointsMaterial({ size: 0.34, map: glowTex, color: '#dff6ff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); drops.frustumCulled = false; scene.add(drops);

  /* ═════════ 나무 (은행나무 가을빛) ═════════ */
  const trunkI = new Inst(new THREE.CylinderGeometry(0.2, 0.3, 1, 8), M('#6b4d3d')), crownGeo = new THREE.IcosahedronGeometry(1, 1);
  const crownI = [0, 1, 2].map(() => new Inst(crownGeo, M('#ffffff')));
  const LEAF = ['#f2c14a', '#ecae3c', '#f0b858', '#e89a45', '#a9bd58', '#d9c04c'];
  function tree(x, z, s) {
    s = s || 1; trunkI.add(x, 1.3 * s, z, 0, s, 2.6 * s, s);
    const b = LEAF[Math.floor(rnd() * LEAF.length)];
    crownI[0].add(x, 3.9 * s, z, 0, 2.2 * s, 1.9 * s, 2.2 * s, b);
    crownI[1].add(x + R(-0.9, 0.9) * s, 4.9 * s, z + R(-0.9, 0.9) * s, 0, 1.7 * s, 1.5 * s, 1.7 * s, LEAF[Math.floor(rnd() * LEAF.length)]);
    crownI[2].add(x + R(-1.2, 1.2) * s, 3.4 * s, z + R(-1.2, 1.2) * s, 0, 1.5 * s, 1.3 * s, 1.5 * s, LEAF[Math.floor(rnd() * LEAF.length)]);
    city.trees.push([x, z, s]);
    addCircle(x, z, 0.5); shadow(x + 0.8, z + 0.8, 7 * s, 6 * s, 0, 0.5);
    const pl = mesh(unit, M('#a99580'), x, 0.18, z); pl.scale.set(1.5 * s, 0.36, 1.5 * s);
  }
  // 분수 둘레
  for (let k = 0; k < 8; k++) { const [x, z] = P(k * 45, 25); tree(x, z, 1.05); }

  /* ═════════ 구조물 위치 (각도) ═════════ */
  const SPOT = { cafe: 180, store: 0, truck: 90, shelter: 270 };
  const nearSpot = (deg, k) => Object.keys(SPOT).some(n => angDiff(deg, SPOT[n]) < (k || 15));
  const glowSmall = [];
  function glowS(x, y, z) { glowSmall.push(x, y, z); }
  const FONT = '"Noto Sans KR","Malgun Gothic","Apple SD Gothic Neo",sans-serif';
  function put(m, f, lx, ly, lz, rx) { const wp = f.w(lx, lz); m.position.set(wp[0], ly, wp[1]); m.rotation.order = 'YXZ'; m.rotation.set(rx || 0, f.ry, 0); return m; }
  function pbox(f, sx, sy, sz, mat, lx, ly, lz, rx) { const m = new THREE.Mesh(unit, mat); m.scale.set(sx, sy, sz); put(m, f, lx, ly, lz, rx); scene.add(m); return m; }
  function pplane(f, w, h, mat, lx, ly, lz) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); put(m, f, lx, ly, lz); scene.add(m); return m; }
  function textBoard(w, h, bg, fg, text, size, extra) {
    return ctex(w, h, (g, W, H) => {
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      if (extra) extra(g, W, H);
      g.fillStyle = fg; g.font = '700 ' + size + 'px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, W / 2, H / 2 + 2);
    });
  }
  const basic = (map, o) => new THREE.MeshBasicMaterial(Object.assign({ map }, o || {}));

  /* ═════════ 나무(가장자리) · 화단 · 볼라드 ═════════ */
  for (let k = 0; k < 24; k++) { const deg = 7.5 + k * 15; if (avDist(deg) < 10 || nearSpot(deg, 17)) continue; const [x, z] = P(deg, 52.5); tree(x, z, R(0.95, 1.2)); }
  const planterI = new Inst(unit, M('#ffffff')), bushI = new Inst(new THREE.IcosahedronGeometry(1, 1), M('#ffffff')), flowerI = new Inst(new THREE.IcosahedronGeometry(1, 0), M('#ffffff'));
  for (let k = 0; k < 16; k++) {
    const deg = 11.25 + k * 22.5; if (avDist(deg) < 10 || nearSpot(deg, 15)) continue;
    const [x, z] = P(deg, 57.4), ry = faceCenter(x, z), f = frame(x, z, ry);
    planterI.add(x, 0.3, z, ry, 3.2, 0.6, 1.1, '#b9a68f'); addBoxCol(x, z, 1.6, 0.55, ry, 0.6);
    for (let q = -1; q <= 1; q++) { const p = f.w(q * 0.95, 0); bushI.add(p[0], 0.85, p[1], 0, 0.62, 0.5, 0.62, rnd() < 0.5 ? '#6f9d5a' : '#86ad5e');
      for (let c = 0; c < 4; c++) { const fp = f.w(q * 0.95 + R(-0.4, 0.4), R(-0.2, 0.3)); flowerI.add(fp[0], R(0.95, 1.25), fp[1], 0, 0.1, 0.1, 0.1, ['#f7a8c0', '#fff1d6', '#f4d06a', '#f09a7a'][Math.floor(rnd() * 4)]); } }
    shadow(x, z, 4.2, 2.2, ry, 0.5);
  }
  const bolI = new Inst(cyl8, M('#8d8398')), bolCap = new Inst(new THREE.SphereGeometry(1, 8, 6), M('#e9d9b8'));
  for (let i = 0; i < 112; i++) { const deg = i * (360 / 112); if (avDist(deg) < 7.5) continue; const [x, z] = P(deg, 60.95); bolI.add(x, 0.45, z, 0, 0.13, 0.9, 0.13); bolCap.add(x, 0.93, z, 0, 0.14, 0.1, 0.14); }

  /* ═════════ 벤치 ═════════ */
  const benchSeat = new Inst(unit, M('#ffffff')), benchBack = new Inst(unit, M('#ffffff')), benchLeg = new Inst(unit, M('#3f3b4d'));
  function bench(x, z, ry, record) {
    ry = ry == null ? faceCenter(x, z) : ry; const f = frame(x, z, ry), wood = rnd() < 0.5 ? '#c68b56' : '#b97e4d';
    benchSeat.add(x, 0.5, z, ry, 2.2, 0.09, 0.56, wood);
    const bp2 = f.w(0, -0.27); benchBack.add(bp2[0], 0.88, bp2[1], ry, 2.2, 0.5, 0.07, wood, -0.2);
    [-0.95, 0.95].forEach(lx => { const lp = f.w(lx, 0); benchLeg.add(lp[0], 0.25, lp[1], ry, 0.08, 0.5, 0.5); });
    [-0.6, 0.6].forEach(lx => { const p = f.w(lx, 0); addCircle(p[0], p[1], 0.62); });
    shadow(x, z, 3.4, 1.8, ry, 0.6);
    if (record !== false) city.benches.push({ x: +x.toFixed(2), z: +z.toFixed(2), ry: +ry.toFixed(3) });
  }
  for (let k = 0; k < 8; k++) { const [x, z] = P(22.5 + k * 45, 13.8); bench(x, z); }
  for (let k = 0; k < 14; k++) { const deg = 12 + k * (360 / 14); if (avDist(deg) < 9 || nearSpot(deg, 14)) continue; const [x, z] = P(deg, 37); bench(x, z); }

  /* ═════════ 가로등 ═════════ */
  const poleI = new Inst(cyl8, M('#3d3a4d')), lampBase = new Inst(cyl8, M('#3d3a4d')), headI = new Inst(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffe3ad' }));
  function lamp(x, z, solid) {
    poleI.add(x, 2.1, z, 0, 0.07, 4.2, 0.07); lampBase.add(x, 0.2, z, 0, 0.2, 0.4, 0.2); headI.add(x, 4.4, z, 0, 0.3, 0.34, 0.3);
    glow(x, 4.4, z); if (solid) { addCircle(x, z, 0.24); shadow(x + 0.4, z + 0.4, 1.2, 1.2, 0, 0.5); }
  }
  for (let k = 0; k < 6; k++) { const [x, z] = P(k * 60 + 30, 19.5); lamp(x, z, true); }
  for (let k = 0; k < 12; k++) { const deg = 15 + k * 30; if (avDist(deg) < 9 || nearSpot(deg, 16)) continue; const [x, z] = P(deg, 46); lamp(x, z, true); }
  for (let k = 0; k < 30; k++) { const deg = k * 12 + 6; if (avDist(deg) < 8) continue; const [x, z] = P(deg, 79.5); lamp(x, z, false); }

  /* ═════════ 카페 "카페 퇴근길" ═════════ */
  {
    const [fx, fz] = P(SPOT.cafe, 44.5), ry = faceCenter(fx, fz), f = frame(fx, fz, ry), BW = 18, BD = 9, BH = 7.4;
    const facade = ctex(1024, 428, (g, w, h) => {
      g.fillStyle = '#f2dfc2'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 140; i++) { g.fillStyle = 'rgba(' + (rnd() < 0.5 ? '255,242,220' : '205,165,130') + ',' + R(0.04, 0.10) + ')'; g.fillRect(R(0, w), R(0, h - 100), R(20, 90), R(5, 16)); }
      g.fillStyle = '#c98563'; g.fillRect(0, h - 92, w, 92); g.fillStyle = '#a8654a'; g.fillRect(0, h - 98, w, 8);
      for (let i = 0; i < 16; i++) { g.fillStyle = 'rgba(120,60,40,.18)'; g.fillRect(i * 64, h - 92, 3, 92); }
      function arch(x, ww, y1, top, inset, fill) { const r = ww / 2 - inset, cx = x + ww / 2, cy = top + ww / 2; g.beginPath(); g.moveTo(x + inset, y1); g.lineTo(x + inset, cy); g.arc(cx, cy, r, Math.PI, 0); g.lineTo(x + ww - inset, y1); g.closePath(); g.fillStyle = fill; g.fill(); }
      [[36, 190], [246, 190], [588, 190], [798, 190]].forEach(wd => {
        const x = wd[0], ww = wd[1], y1 = h - 98, top = 70;
        arch(x, ww, y1, top, 0, '#5b3d33');
        const gr = g.createLinearGradient(0, top, 0, y1); gr.addColorStop(0, '#ffe8b0'); gr.addColorStop(0.5, '#ffcf86'); gr.addColorStop(1, '#f0a45e'); arch(x, ww, y1, top, 10, gr);
        g.save(); g.beginPath(); g.rect(x + 10, top, ww - 20, y1 - top); g.clip();
        const lg = g.createRadialGradient(x + ww / 2, top + 90, 4, x + ww / 2, top + 90, 70); lg.addColorStop(0, 'rgba(255,250,220,.95)'); lg.addColorStop(1, 'rgba(255,230,160,0)'); g.fillStyle = lg; g.fillRect(x, top, ww, 200);
        g.fillStyle = 'rgba(150,80,50,.55)'; g.fillRect(x + 14, y1 - 78, ww - 28, 6); g.fillRect(x + 14, y1 - 130, ww - 28, 6);
        for (let q = 0; q < 6; q++) { g.fillStyle = ['#c9694c', '#6d9c8a', '#f6e7c8', '#d99a4a'][q % 4]; g.fillRect(x + 20 + q * 27 + R(-3, 3), y1 - 78 - R(14, 32), 16, R(14, 32)); }
        g.fillStyle = 'rgba(90,50,40,.5)'; g.beginPath(); g.arc(x + 50 + R(0, 90), y1 - 38, 15, 0, TAU); g.fill(); g.fillRect(x + 36 + R(0, 90), y1 - 36, 30, 36);
        g.restore();
        g.strokeStyle = '#5b3d33'; g.lineWidth = 7; g.beginPath(); g.moveTo(x + ww / 2, top + 6); g.lineTo(x + ww / 2, y1); g.stroke(); g.beginPath(); g.moveTo(x + 8, top + ww / 2 + 30); g.lineTo(x + ww - 8, top + ww / 2 + 30); g.stroke();
        g.fillStyle = '#7a5242'; g.fillRect(x - 6, y1 + 4, ww + 12, 14);
        for (let q = 0; q < 14; q++) { g.fillStyle = ['#f7a8c0', '#fff1d6', '#8fbf6a', '#f4d06a'][q % 4]; g.beginPath(); g.arc(x + 4 + q * 14, y1 + 2 + R(-3, 3), R(5, 8), 0, TAU); g.fill(); }
      });
      const dx = 462, dw = 100, y1 = h - 98, top = 110; arch(dx - 8, dw + 16, y1, top - 8, 0, '#5b3d33');
      const dg = g.createLinearGradient(0, top, 0, y1); dg.addColorStop(0, '#4f8a7c'); dg.addColorStop(1, '#2f5c52'); arch(dx, dw, y1, top, 0, dg);
      arch(dx + 14, dw, y1 - 70, top + 12, 14, '#ffd998'); g.fillStyle = '#f4d98a'; g.beginPath(); g.arc(dx + dw - 16, y1 - 40, 6, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(0, 0, w, 6);
    });
    pbox(f, BW, BH, BD, M('#efd9bb'), 0, BH / 2, -BD / 2);
    pplane(f, BW - 0.04, BH, basic(facade), 0, BH / 2, 0.03);
    pbox(f, BW + 0.9, 0.5, BD + 0.9, M('#b8644a'), 0, BH + 0.25, -BD / 2 + 0.2);
    pbox(f, BW + 0.9, 0.18, 0.4, M('#8f4a37'), 0, BH + 0.55, 0.42);
    pbox(f, 1.7, 0.9, 1.3, M('#bdb6c4'), -4.5, BH + 0.95, -3); pbox(f, 1.3, 0.8, 1.1, M('#bdb6c4'), -2.6, BH + 0.9, -4.5);
    pbox(f, 0.9, 1.6, 0.9, M('#9a5a47'), 5.6, BH + 1.3, -5.5);
    const stripe = ctex(256, 32, (g, w, h) => { for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? '#f6ebd6' : '#d96b4f'; g.fillRect(i * w / 12, 0, w / 12 + 1, h); } });
    const awn = new THREE.MeshLambertMaterial({ map: stripe });
    pbox(f, BW - 1.2, 0.12, 2.5, awn, 0, 4.15, 1.15, 0.26); pbox(f, BW - 1.2, 0.42, 0.08, awn, 0, 3.55, 2.33);
    const sign = textBoard(512, 100, '#2f4a45', '#f3d58a', '카페 퇴근길 · CAFÉ', 54, (g, W, H) => { g.strokeStyle = '#f3d58a'; g.lineWidth = 4; g.strokeRect(8, 8, W - 16, H - 16); });
    pbox(f, 9.2, 1.7, 0.3, M('#26382f'), 0, 6.55, 0.2); pplane(f, 8.8, 1.4, basic(sign), 0, 6.55, 0.37);
    glow(f.w(0, 0.6)[0], 6.6, f.w(0, 0.6)[1]);
    const plank = ctex(256, 256, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = 'hsl(28,' + R(34, 42) + '%,' + R(46, 54) + '%)'; g.fillRect(0, i * 32, w, 31); g.fillStyle = 'rgba(80,45,25,.35)'; g.fillRect(0, i * 32 + 31, w, 1); for (let q = 0; q < 14; q++) { g.fillStyle = 'rgba(90,55,30,.12)'; g.fillRect(R(0, w), i * 32 + R(2, 28), R(10, 50), 1); } } }, { repeat: [5, 2.2] });
    pbox(f, BW + 1.4, 0.14, 8.6, new THREE.MeshLambertMaterial({ map: plank }), 0, 0.07, 4.3);
    [-1, 1].forEach(sd => { pbox(f, 2.4, 0.5, 1.0, M('#a9937e'), sd * 9.4, 0.25, 7.9); [-0.7, 0, 0.7].forEach(q => { const bp3 = f.w(sd * 9.4 + q * 0.6, 7.9); bushI.add(bp3[0], 0.85, bp3[1], 0, 0.5, 0.45, 0.5, '#72a05c'); }); });
    // 테이블 · 의자 · 파라솔
    const tableTop = new Inst(cyl8, M('#f4ead8')), tableLeg = new Inst(cyl8, M('#4a4352')), chairS = new Inst(unit, M('#ffffff')), chairB = new Inst(unit, M('#ffffff')), umbP = new Inst(cyl8, M('#efe6d6')), umbC = new Inst(new THREE.ConeGeometry(1, 1, 8), M('#ffffff'));
    [[-6.6, 3.0], [-3.3, 5.4], [3.3, 5.4], [6.6, 3.0], [0, 7.2]].forEach((t, ti) => {
      const p = f.w(t[0], t[1]); tableTop.add(p[0], 0.8, p[1], 0, 0.58, 0.06, 0.58); tableLeg.add(p[0], 0.4, p[1], 0, 0.05, 0.8, 0.05); addCircle(p[0], p[1], 0.95);
      [-1, 1].forEach((sd, ci) => { const cp = f.w(t[0] + sd * 0.95, t[1]), cr = ry + (sd > 0 ? -Math.PI / 2 : Math.PI / 2), col = ci ? '#c4694a' : '#5f8d7c';
        chairS.add(cp[0], 0.46, cp[1], cr, 0.46, 0.06, 0.46, col); const bk = frame(cp[0], cp[1], cr).w(0, -0.22); chairB.add(bk[0], 0.76, bk[1], cr, 0.46, 0.5, 0.05, col); });
      if (ti !== 4) { umbP.add(p[0], 1.15, p[1], 0, 0.04, 2.3, 0.04); umbC.add(p[0], 2.5, p[1], 0, 1.7, 0.7, 1.7, ['#e8a089', '#f2e2c6', '#86b8ae', '#e8a089'][ti % 4]); }
      shadow(p[0] + 0.6, p[1] + 0.5, 3.2, 3.0, 0, 0.5);
    });
    tableTop.build(); tableLeg.build(); chairS.build(); chairB.build(); umbP.build(); umbC.build();
    // 조명 줄
    [[-9.6, 8.2, 9.6, 8.2], [-9.6, 0.4, -9.6, 8.2], [9.6, 0.4, 9.6, 8.2]].forEach(sg => {
      const n = Math.round(Math.hypot(sg[2] - sg[0], sg[3] - sg[1]) / 0.8);
      for (let i = 0; i <= n; i++) { const u = i / n, lx = sg[0] + (sg[2] - sg[0]) * u, lz = sg[1] + (sg[3] - sg[1]) * u, wp = f.w(lx, lz); glowS(wp[0], 3.3 - 0.35 * Math.sin(u * Math.PI), wp[1]); }
    });
    [[-9.6, 8.2], [9.6, 8.2]].forEach(p => { const wp = f.w(p[0], p[1]); poleI.add(wp[0], 1.65, wp[1], 0, 0.06, 3.3, 0.06); });
    const cc = f.w(0, -BD / 2); addBoxCol(cc[0], cc[1], BW / 2, BD / 2, ry, BH);
    shadowRect(f.w(0, -BD / 2 + 0.6)[0], f.w(0, -BD / 2 + 0.6)[1], BW + 5, BD + 4.5, ry);
    // 자판기 3대
    [['#d94f4f', 0], ['#3f7fb3', 1], ['#e2b03c', 2]].forEach((v, i) => {
      const tex = ctex(128, 256, (g, w, h) => { g.fillStyle = '#1b1828'; g.fillRect(0, 0, w, h); const gr = g.createLinearGradient(0, 14, 0, 170); gr.addColorStop(0, '#fff7da'); gr.addColorStop(1, '#ffe2a0'); g.fillStyle = gr; g.fillRect(10, 14, 82, 160);
        for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) { g.fillStyle = ['#e85a5a', '#4d90d0', '#59b36b', '#f0b43c', '#b57ad0'][(r * 3 + c + i) % 5]; g.fillRect(16 + c * 26, 22 + r * 38, 18, 28); }
        g.fillStyle = '#0d0b16'; g.fillRect(14, 196, 74, 40); g.fillStyle = '#403a55'; g.fillRect(98, 40, 22, 40); g.fillStyle = '#ffd36a'; g.fillRect(102, 48, 14, 8); });
      const lx = 11.0 + i * 1.25; pbox(f, 1.1, 2.0, 0.9, M(v[0]), lx, 1.0, -0.5); pplane(f, 1.0, 1.9, basic(tex), lx, 1.0, -0.04); glowS(f.w(lx, 0.3)[0], 1.2, f.w(lx, 0.3)[1]);
    });
    { const c2 = f.w(12.25, -0.5); addBoxCol(c2[0], c2[1], 1.95, 0.5, ry, 2.0); }
    city.spots.cafe = { x: fx, z: fz, ry };
  }

  /* ═════════ 편의점 ═════════ */
  {
    const [fx, fz] = P(SPOT.store, 45.5), ry = faceCenter(fx, fz), f = frame(fx, fz, ry), BW = 14, BD = 8, BH = 5.4;
    const facade = ctex(768, 296, (g, w, h) => {
      g.fillStyle = '#f2f6f1'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#2fa05b'; g.fillRect(0, 0, w, 56); g.fillStyle = '#fff'; g.fillRect(0, 56, w, 8); g.fillStyle = '#f08a24'; g.fillRect(0, 64, w, 8);
      const gr = g.createLinearGradient(0, 92, 0, 256); gr.addColorStop(0, '#fff6d6'); gr.addColorStop(1, '#ffe9b0'); g.fillStyle = '#5c6b64'; g.fillRect(20, 86, w - 40, 176); g.fillStyle = gr; g.fillRect(28, 94, w - 56, 160);
      for (let s = 0; s < 3; s++) { g.fillStyle = '#d8c690'; g.fillRect(36 + s * 0, 128 + s * 40, w - 72, 4); }
      for (let c = 0; c < 22; c++) for (let r = 0; r < 3; r++) { g.fillStyle = ['#e85a5a', '#4d90d0', '#59b36b', '#f0b43c', '#b57ad0', '#f6a3b8'][(c + r * 2) % 6]; g.fillRect(40 + c * 30, 104 + r * 40, 20, 20); }
      g.fillStyle = '#5c6b64'; g.fillRect(w / 2 - 4, 86, 8, 176); g.fillStyle = 'rgba(255,255,255,.28)'; g.fillRect(w / 2 - 70, 96, 22, 156); g.fillRect(w / 2 + 48, 96, 22, 156);
      g.fillStyle = '#8aa396'; g.fillRect(0, 262, w, 34);
    });
    pbox(f, BW, BH, BD, M('#e9f0e8'), 0, BH / 2, -BD / 2); pplane(f, BW - 0.04, BH, basic(facade), 0, BH / 2, 0.03);
    pbox(f, BW + 0.7, 0.4, BD + 0.7, M('#b4bcc0'), 0, BH + 0.2, -BD / 2 + 0.2);
    const sign = textBoard(384, 96, '#ffffff', '#1d8a4a', '편의점 24', 58, (g, W, H) => { g.fillStyle = '#f08a24'; g.fillRect(0, H - 14, W, 14); g.fillStyle = '#1d8a4a'; g.fillRect(0, 0, W, 10); });
    pbox(f, 6.6, 1.3, 0.3, M('#e7efe8'), 0, BH + 1.1, 0.0); pplane(f, 6.4, 1.2, basic(sign), 0, BH + 1.1, 0.17); glow(f.w(0, 0.8)[0], BH + 1.2, f.w(0, 0.8)[1]);
    pbox(f, 2.4, 0.04, 1.2, M('#6d7b74'), 0, 0.03, 1.0);
    // 야외 파라솔 테이블, 쓰레기통
    const tp = f.w(-5.4, 3.0); const tT = new Inst(cyl8, M('#e9eee8')), tL = new Inst(cyl8, M('#4a4352')); tT.add(tp[0], 0.8, tp[1], 0, 0.55, 0.06, 0.55); tL.add(tp[0], 0.4, tp[1], 0, 0.05, 0.8, 0.05); tT.build(); tL.build(); addCircle(tp[0], tp[1], 0.9);
    const um = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.65, 8), M('#2fa05b')); um.position.set(tp[0], 2.5, tp[1]); scene.add(um); const up = mesh(cyl8, M('#efe6d6'), tp[0], 1.15, tp[1]); up.scale.set(0.04, 2.3, 0.04);
    [-6.2, -4.6].forEach(lx => { const p = f.w(lx, 3.0 + (lx > -5 ? 0.6 : 0)); const ch = new THREE.Mesh(unit, M('#f08a24')); ch.scale.set(0.46, 0.06, 0.46); ch.position.set(p[0], 0.46, p[1]); scene.add(ch); });
    [5.6, 6.5].forEach((lx, i) => { const p = f.w(lx, 0.8); const bin = mesh(unit, M(i ? '#3f7fb3' : '#59b36b'), p[0], 0.5, p[1], ry); bin.scale.set(0.7, 1.0, 0.6); addCircle(p[0], p[1], 0.45); });
    const cc = f.w(0, -BD / 2); addBoxCol(cc[0], cc[1], BW / 2, BD / 2, ry, BH);
    shadowRect(cc[0], cc[1], BW + 5, BD + 4, ry); shadow(tp[0] + 0.5, tp[1] + 0.4, 3, 3, 0, 0.5);
    [-6.4, 6.4].forEach(lx => { const p = f.w(lx, 0.6); glowS(p[0], 3.4, p[1]); });
    city.spots.store = { x: fx, z: fz, ry };
  }

  /* ═════════ 버스 정류장 ═════════ */
  {
    const [fx, fz] = P(SPOT.shelter, 49.5), ry = faceCenter(fx, fz), f = frame(fx, fz, ry);
    const glass = new THREE.MeshLambertMaterial({ color: '#b6dbe8', transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false });
    pbox(f, 6.6, 0.14, 2.4, M('#4a5a66'), 0, 2.75, -0.4); pbox(f, 6.8, 0.1, 2.6, M('#e8a089'), 0, 2.87, -0.4);
    [[-3, 0.5], [3, 0.5], [-3, -1.2], [3, -1.2]].forEach(p => { pbox(f, 0.1, 2.7, 0.1, M('#4a5a66'), p[0], 1.35, p[1]); });
    pbox(f, 6, 2.4, 0.05, glass, 0, 1.35, -1.2); pbox(f, 0.05, 2.4, 1.6, glass, -3, 1.35, -0.4); pbox(f, 0.05, 2.4, 1.6, glass, 3, 1.35, -0.4);
    const bus = ctex(256, 128, (g, w, h) => { g.fillStyle = '#16213a'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffb347'; g.font = '700 30px ' + FONT; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('퇴근버스 7', 18, 34); g.fillText('곧 도착', 18, 78); g.fillStyle = '#9fe0a8'; g.font = '700 24px ' + FONT; g.fillText('3분', 168, 78); g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(10, 52, w - 20, 2); });
    pplane(f, 2.6, 1.3, basic(bus), 0.4, 1.65, -1.14); glowS(f.w(0.4, -1.0)[0], 1.9, f.w(0.4, -1.0)[1]);
    const bp0 = f.w(-0.2, -0.6); benchSeat.add(bp0[0], 0.5, bp0[1], ry, 2.4, 0.09, 0.55, '#7a8a96'); const bb = f.w(-0.2, -0.85); benchBack.add(bb[0], 0.86, bb[1], ry, 2.4, 0.4, 0.06, '#7a8a96', -0.12);
    [-1, 1].forEach(sd => { const lp = f.w(-0.2 + sd * 1.05, -0.6); benchLeg.add(lp[0], 0.25, lp[1], ry, 0.08, 0.5, 0.5); });
    city.benches.push({ x: +bp0[0].toFixed(2), z: +bp0[1].toFixed(2), ry: +ry.toFixed(3) });
    const sp = f.w(4.4, 0.6); const sg = textBoard(128, 128, '#2d62b8', '#ffffff', '버스', 40, (g, W, H) => { g.strokeStyle = '#fff'; g.lineWidth = 6; g.beginPath(); g.arc(64, 64, 56, 0, TAU); g.stroke(); });
    poleI.add(sp[0], 1.6, sp[1], 0, 0.05, 3.2, 0.05); const sgm = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), basic(sg, { side: THREE.DoubleSide })); sgm.position.set(sp[0], 3.0, sp[1]); sgm.rotation.y = ry; scene.add(sgm); addCircle(sp[0], sp[1], 0.2);
    [[-3, 0.5], [3, 0.5]].forEach(p => { const w2 = f.w(p[0], p[1]); addCircle(w2[0], w2[1], 0.16); });
    const bc = f.w(0, -1.2); addBoxCol(bc[0], bc[1], 3.0, 0.1, ry, 2.6);
    shadowRect(f.w(0, -0.4)[0], f.w(0, -0.4)[1], 8, 4.4, ry);
    city.spots.shelter = { x: fx, z: fz, ry };
  }

  /* ═════════ 푸드트럭 ═════════ */
  {
    const [fx, fz] = P(SPOT.truck, 47.5), ry = faceCenter(fx, fz), f = frame(fx, fz, ry);
    const body = M('#f5e6c8'), teal = M('#3f8f8a');
    pbox(f, 6.4, 2.5, 2.7, body, 0.6, 1.95, -1.35); pbox(f, 6.42, 0.45, 2.72, teal, 0.6, 0.98, -1.35);
    pbox(f, 1.9, 1.9, 2.5, M('#3f8f8a'), -3.6, 1.65, -1.35); pbox(f, 0.06, 0.8, 2.0, M('#bfe3ea'), -4.55, 2.0, -1.35);
    pbox(f, 6.6, 0.16, 2.9, M('#d8c9aa'), 0.6, 3.25, -1.35);
    const wt = new Inst(new THREE.CylinderGeometry(1, 1, 1, 14), M('#2d2a37'));
    [[-3.6, 0.1], [-3.6, -2.8], [2.0, 0.1], [2.0, -2.8]].forEach(p => { const wp = f.w(p[0], p[1]); wt.add(wp[0], 0.46, wp[1], ry, 0.46, 0.32, 0.46, null, Math.PI / 2); });
    wt.build();
    const win = ctex(512, 200, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffe3a8'); gr.addColorStop(1, '#f2a860'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(120,60,40,.5)'; g.beginPath(); g.arc(150, 90, 24, 0, TAU); g.fill(); g.fillRect(120, 112, 60, 90);
      g.fillStyle = '#fff3d0'; g.fillRect(260, 20, 230, 110); g.fillStyle = '#6a4a3a'; g.font = '700 26px ' + FONT; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText('붕어빵 · 호떡', 276, 48); g.fillText('떡볶이 · 어묵', 276, 84); g.fillStyle = '#c4553c'; g.fillText('오늘도 수고했어요', 276, 116);
      g.fillStyle = '#7a5242'; g.fillRect(0, h - 22, w, 22);
    });
    pplane(f, 3.9, 1.5, basic(win), 1.1, 2.0, 0.01); pbox(f, 4.1, 0.1, 0.55, M('#8b6a52'), 1.1, 1.2, 0.28);
    const stripe = ctex(256, 32, (g, w, h) => { for (let i = 0; i < 10; i++) { g.fillStyle = i % 2 ? '#f6ebd6' : '#3f8f8a'; g.fillRect(i * w / 10, 0, w / 10 + 1, h); } });
    const awn = new THREE.MeshLambertMaterial({ map: stripe });
    pbox(f, 4.5, 0.1, 1.5, awn, 1.1, 2.95, 0.65, 0.24); pbox(f, 4.5, 0.32, 0.07, awn, 1.1, 2.55, 1.28);
    const sg = textBoard(512, 110, '#3f8f8a', '#fff3d0', '퇴근길 분식 트럭', 56, (g, W, H) => { g.strokeStyle = '#fff3d0'; g.lineWidth = 4; g.strokeRect(8, 8, W - 16, H - 16); });
    pbox(f, 3.4, 0.74, 0.14, M('#2b6b67'), 0.9, 3.75, -0.5); pplane(f, 3.2, 0.66, basic(sg), 0.9, 3.75, -0.42); glow(f.w(0.9, 0.3)[0], 3.9, f.w(0.9, 0.3)[1]);
    for (let i = 0; i <= 9; i++) { const u = i / 9, lx = -1.1 + u * 4.6, wp = f.w(lx, 1.25); glowS(wp[0], 2.55 - 0.18 * Math.sin(u * Math.PI), wp[1]); }
    const ab = f.w(-2.2, 2.0); const abm = mesh(unit, M('#f4ead8'), ab[0], 0.55, ab[1], ry); abm.scale.set(0.7, 1.1, 0.12); addCircle(ab[0], ab[1], 0.5);
    const tc = f.w(0.6, -1.35); addBoxCol(tc[0], tc[1], 3.25, 1.35, ry, 3.3); const cb = f.w(-3.6, -1.35); addBoxCol(cb[0], cb[1], 0.95, 1.25, ry, 2.6);
    shadowRect(f.w(-0.4, -1.3)[0], f.w(-0.4, -1.3)[1], 10.2, 6.0, ry);
    city.spots.truck = { x: fx, z: fz, ry };
  }

  /* ═════════ 순환도로 자동차 ═════════ */
  const NCAR = 12, cars = [];
  const carBody = new THREE.InstancedMesh(unit, M('#ffffff'), NCAR), carCab = new THREE.InstancedMesh(unit, M('#2c2a3d'), NCAR);
  const carF = new THREE.InstancedMesh(unit, new THREE.MeshBasicMaterial({ color: '#fff0c0' }), NCAR), carB = new THREE.InstancedMesh(unit, new THREE.MeshBasicMaterial({ color: '#ff4636' }), NCAR);
  { const pal = ['#e8564a', '#f2c14a', '#4a7fb5', '#f5efe6', '#2d3047', '#7bb08a', '#d98fb0', '#e89a45'], col = new THREE.Color();
    for (let i = 0; i < NCAR; i++) { const lane = i % 2; cars.push({ r: lane ? 73.0 : 66.0, dir: lane ? -1 : 1, v: R(5, 9), a: R(0, TAU) }); col.set(pal[i % pal.length]); carBody.setColorAt(i, col); } }
  [carBody, carCab, carF, carB].forEach(m => { m.frustumCulled = false; scene.add(m); });
  function placeCar(m, i, x, y, z, ry, sx, sy, sz) { tmp.position.set(x, y, z); tmp.rotation.set(0, ry, 0, 'YXZ'); tmp.scale.set(sx, sy, sz); tmp.updateMatrix(); m.setMatrixAt(i, tmp.matrix); }

  /* ═════════ 낙엽 ═════════ */
  const NLEAF = 150, leafPos = new Float32Array(NLEAF * 3), leafD = [];
  for (let i = 0; i < NLEAF; i++) { const a = R(0, TAU), r = Math.sqrt(rnd()) * 54; leafPos[i * 3] = Math.cos(a) * r; leafPos[i * 3 + 1] = R(0.2, 10); leafPos[i * 3 + 2] = Math.sin(a) * r; leafD.push({ vy: R(0.35, 0.9), ph: R(0, TAU), sw: R(0.4, 1.2) }); }
  const leafGeo = new THREE.BufferGeometry(); leafGeo.setAttribute('position', new THREE.BufferAttribute(leafPos, 3));
  const leaves = new THREE.Points(leafGeo, new THREE.PointsMaterial({ size: 0.3, map: glowTex, color: '#f0bf45', transparent: true, depthWrite: false })); leaves.frustumCulled = false; scene.add(leaves);

  /* ═════════ 인스턴스 / 글로우 / 그림자 확정 ═════════ */
  [trunkI, crownI[0], crownI[1], crownI[2], planterI, bushI, flowerI, bolI, bolCap, benchSeat, benchBack, benchLeg, poleI, lampBase, headI].forEach(i => i.build());
  { const pg = new THREE.PlaneGeometry(1, 1); pg.rotateX(-Math.PI / 2);
    const bm = new THREE.InstancedMesh(pg, new THREE.MeshBasicMaterial({ map: blobTex, color: '#241838', transparent: true, opacity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), shadowBlobs.length);
    shadowBlobs.forEach((s, i) => { tmp.position.set(s[0], 0.075, s[1]); tmp.rotation.set(0, s[4], 0); tmp.scale.set(s[2], 1, s[3]); tmp.updateMatrix(); bm.setMatrixAt(i, tmp.matrix); }); bm.frustumCulled = false; bm.renderOrder = 1; scene.add(bm);
    if (shadowRects.length) { const rm = new THREE.InstancedMesh(pg, new THREE.MeshBasicMaterial({ alphaMap: rectTex, color: '#241838', transparent: true, opacity: 0.36, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), shadowRects.length);
      shadowRects.forEach((s, i) => { tmp.position.set(s[0], 0.072, s[1]); tmp.rotation.set(0, s[4], 0); tmp.scale.set(s[2], 1, s[3]); tmp.updateMatrix(); rm.setMatrixAt(i, tmp.matrix); }); rm.frustumCulled = false; rm.renderOrder = 1; scene.add(rm); } }
  function glowPoints(arr, size, color, op) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ size, map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: op })); p.frustumCulled = false; scene.add(p);
  }
  glowPoints(glowPts, 5.0, '#ffb86a', 0.8); glowPoints(glowSmall, 0.85, '#ffd592', 0.95);

  /* ═════════ 충돌 · 카메라 · 갱신 ═════════ */
  city.resolve = function (p, rad) {
    for (let it = 0; it < 2; it++) {
      for (const c of city.colliders) { const dx = p.x - c.x, dz = p.z - c.z, m = c.r + rad, d2 = dx * dx + dz * dz; if (d2 < m * m) { const d = Math.sqrt(d2) || 0.001; p.x = c.x + dx / d * m; p.z = c.z + dz / d * m; } }
      for (const b of city.boxes) {
        const ox = p.x - b.x, oz = p.z - b.z, lx = ox * b.c - oz * b.s, lz = ox * b.s + oz * b.c, ex = b.hw + rad, ez = b.hd + rad;
        if (Math.abs(lx) < ex && Math.abs(lz) < ez) {
          const px = ex - Math.abs(lx), pz = ez - Math.abs(lz); let nx = lx, nz = lz;
          if (px < pz) nx = (lx < 0 ? -ex : ex); else nz = (lz < 0 ? -ez : ez);
          p.x = b.x + nx * b.c + nz * b.s; p.z = b.z - nx * b.s + nz * b.c;
        }
      }
    }
  };
  city.boxBlocked = function (x, y, z) {
    for (const b of city.boxes) { const ox = x - b.x, oz = z - b.z, lx = ox * b.c - oz * b.s, lz = ox * b.s + oz * b.c; if (Math.abs(lx) < b.hw + 0.7 && Math.abs(lz) < b.hd + 0.7 && y < b.h + 0.7) return true; }
    return false;
  };
  city.treeBlocked = function (x, y, z) {
    for (const t of city.trees) { const dx = x - t[0], dz = z - t[1], r = 2.6 * t[2]; if (dx * dx + dz * dz < r * r && y > 2.0 * t[2] && y < 6.6 * t[2]) return true; }
    return false;
  };
  city.camBlocked = function (x, y, z) { return city.boxBlocked(x, y, z) || city.treeBlocked(x, y, z); };
  city.lineBlocked = function (tx, ty, tz, cx, cy, cz, trees) {
    const f = trees ? city.treeBlocked : city.boxBlocked;
    for (let i = 1; i <= 7; i++) { const u = i / 8; if (f(tx + (cx - tx) * u, ty + (cy - ty) * u, tz + (cz - tz) * u)) return true; }
    return false;
  };
  const tmpCol = new THREE.Color();
  city.update = function (dt, T, camPos) {
    sky.position.copy(camPos); clouds.rotation.y += dt * 0.0022;
    waterMat.uniforms.uT.value = T; sheetMat.uniforms.uT.value = T;
    for (let i = 0; i < NDROP; i++) {
      const d = dropData[i], t = ((T * 0.62 + d.ph) % 1) * 1.9, y = 4.7 + d.v0 * t - 4.9 * t * t;
      if (y < 1.0) { dropPos[i * 3 + 1] = -50; continue; }
      dropPos[i * 3] = Math.cos(d.a) * d.vh * t; dropPos[i * 3 + 1] = y; dropPos[i * 3 + 2] = Math.sin(d.a) * d.vh * t;
    }
    dropGeo.attributes.position.needsUpdate = true;
    for (let i = 0; i < NCAR; i++) {
      const c = cars[i]; c.a += c.dir * c.v / c.r * dt; const x = Math.cos(c.a) * c.r, z = Math.sin(c.a) * c.r;
      const tx = c.dir > 0 ? -Math.sin(c.a) : Math.sin(c.a), tz = c.dir > 0 ? Math.cos(c.a) : -Math.cos(c.a), ry = Math.atan2(tx, tz);
      placeCar(carBody, i, x, 0.8, z, ry, 1.9, 0.85, 4.2); placeCar(carCab, i, x - tx * 0.3, 1.58, z - tz * 0.3, ry, 1.7, 0.78, 2.3);
      placeCar(carF, i, x + tx * 2.12, 0.85, z + tz * 2.12, ry, 1.6, 0.2, 0.08); placeCar(carB, i, x - tx * 2.12, 0.85, z - tz * 2.12, ry, 1.6, 0.18, 0.08);
    }
    [carBody, carCab, carF, carB].forEach(m => { m.instanceMatrix.needsUpdate = true; }); if (carBody.instanceColor) carBody.instanceColor.needsUpdate = true;
    for (let i = 0; i < NLEAF; i++) {
      const d = leafD[i]; let y = leafPos[i * 3 + 1] - d.vy * dt;
      leafPos[i * 3] += (Math.sin(T * 0.6 + d.ph) * d.sw + 0.35) * dt; leafPos[i * 3 + 2] += Math.cos(T * 0.5 + d.ph) * d.sw * 0.6 * dt;
      if (y < 0.1) { y = R(7, 12); const a = R(0, TAU), r = Math.sqrt(rnd()) * 54; leafPos[i * 3] = Math.cos(a) * r; leafPos[i * 3 + 2] = Math.sin(a) * r; }
      leafPos[i * 3 + 1] = y;
    }
    leafGeo.attributes.position.needsUpdate = true;
  };
  city.sunDir = sunDir;
  return city;
}
global.buildCity = buildCity;
})(window);
