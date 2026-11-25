/* ─────────────────────────────────────────────────────────────
   Healing Lounge — 힐링 공간 4곳 + 달문(입구)
   🌲 숲속 쉼터 · 🌅 노을 바닷가 · 🌌 별빛 언덕 · ♨️ 달빛 온천
   공간마다 멀리 떨어진 곳(ox, oz)에 지어 놓고, 들어갈 때만 보이게 합니다.
   buildSpaces(THREE, scene, city, OPT) → S
   ───────────────────────────────────────────────────────────── */
(function (global) {
'use strict';

function buildSpaces(THREE, scene, city, OPT) {
  const ZN = global.ZONES, Z = ZN.ZONES, TAU = Math.PI * 2;
  let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const R = (a, b) => a + (b - a) * rnd();
  const pick = a => a[Math.floor(rnd() * a.length)];
  const toon = city.toon, UIF = 'system-ui,"Apple SD Gothic Neo","Malgun Gothic","Noto Color Emoji",sans-serif';
  const persist = city.persist || new Set();
  const plazaKids = scene.children.filter(o => !persist.has(o) && !o.isLight && (o.isMesh || o.isGroup || o.isPoints || o.isSprite));
  const S = { zone: 'plaza' }; S._z = {};
  const zones = {};

  /* ── 도우미 ── */
  function ctex(w, h, draw, rep) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); } t.anisotropy = 4; return t;
  }
  const glowTex = ctex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.35)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
  function groundTex(base, dabs, rep) {
    return ctex(512, 512, (g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      dabs.forEach(d => { for (let i = 0; i < d[1]; i++) { g.globalAlpha = d[4] || 0.4; g.fillStyle = d[0]; g.beginPath(); g.ellipse(R(0, w), R(0, h), R(d[2], d[3]), R(d[2], d[3]) * R(0.4, 1), R(0, TAU), 0, TAU); g.fill(); } });
      g.globalAlpha = 1;
    }, rep);
  }
  const mc = {}; const M = c => mc[c] || (mc[c] = toon(c));
  const UNIT = new THREE.BoxGeometry(1, 1, 1), CYL = new THREE.CylinderGeometry(1, 1, 1, 10), CYLT = new THREE.CylinderGeometry(0.72, 1, 1, 8),
    SPH = new THREE.SphereGeometry(1, 10, 8), ICO = new THREE.IcosahedronGeometry(1, 0), CONE = new THREE.ConeGeometry(1, 1, 6), CONE4 = new THREE.ConeGeometry(1, 1, 4);
  function lumpy(amp, sd) {
    const geo = new THREE.SphereGeometry(1, 14, 10), p = geo.attributes.position, col = new Float32Array(p.count * 3), lo = new THREE.Color('#b3bfd2'), hi = new THREE.Color('#ffffff'), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i); const k = 1 + amp * (Math.sin(x * 3.1 + sd) * Math.sin(y * 2.7 + sd * 1.3) + Math.sin(z * 3.4 + sd * 0.7) * 0.6);
      p.setXYZ(i, x * k, y * k * 0.92, z * k); const t = Math.min(1, Math.max(0, (y * k * 0.92 + 1) / 2)); c.copy(lo).lerp(hi, t * t * (3 - 2 * t)); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals(); return geo;
  }
  const leafGeos = [lumpy(0.16, 1.3), lumpy(0.2, 4.1)], leafMat = toon({ color: '#ffffff', vertexColors: true });
  const GREEN = ['#63c052', '#80d158', '#52ad5e', '#95d860', '#6cc86a'], PINK = ['#f6b9d0', '#f4a3c2', '#ffd3e2', '#f8c4d8'], DEEP = ['#3f8f5a', '#4aa061', '#357e55', '#58a868'];
  const labelCache = {};
  function labelSprite(text, color) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
    g.fillStyle = 'rgba(30,22,48,.62)'; g.strokeStyle = color; g.lineWidth = 6; g.beginPath(); g.roundRect ? g.roundRect(8, 14, 496, 100, 50) : g.rect(8, 14, 496, 100); g.fill(); g.stroke();
    g.font = '700 50px ' + UIF; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText(text, 256, 66);
    const t = new THREE.CanvasTexture(c), sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })); sp.scale.set(6.4, 1.6, 1); return sp;
  }
  function glowSprite(color, size, op, blend) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity: op == null ? 0.8 : op, depthWrite: false, blending: blend === false ? THREE.NormalBlending : THREE.AdditiveBlending }));
    sp.scale.set(size, size, 1); return sp;
  }

  /* ── 공간 하나를 만드는 틀 ── */
  function makeZone(id) {
    const z = Z[id], g = new THREE.Group(); g.position.set(z.ox, 0, z.oz); g.visible = false; scene.add(g);
    const Q = { id, z, g, cols: [], canopies: [], benches: [], trees: [], insts: [], upd: [], walk: null, gates: [], fireFlicker: [] };
    Q.col = (x, zz, r) => Q.cols.push({ x, z: zz, r });
    Q.mesh = (geo, mat, x, y, zz, sx, sy, sz, ry) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, zz); if (sx !== undefined) m.scale.set(sx, sy, sz); if (ry) m.rotation.y = ry; m.castShadow = m.receiveShadow = true; g.add(m); return m; };
    Q.inst = (geo, mat, max) => {
      const m = new THREE.InstancedMesh(geo, mat, max); m.castShadow = m.receiveShadow = true; m.frustumCulled = false; g.add(m);
      const o = new THREE.Object3D(), c = new THREE.Color();
      const api = { m, n: 0, add(x, y, zz, sx, sy, sz, ry, col, rx, rz) { if (api.n >= max) return; o.position.set(x, y, zz); o.rotation.set(rx || 0, ry || 0, rz || 0); o.scale.set(sx, sy, sz); o.updateMatrix(); m.setMatrixAt(api.n, o.matrix); if (col) m.setColorAt(api.n, c.set(col)); api.n++; } };
      Q.insts.push(api); return api;
    };
    Q.ground = (tex, color, r, y) => { const geo = new THREE.CircleGeometry(r, 56); geo.rotateX(-Math.PI / 2); const m = new THREE.Mesh(geo, toon({ map: tex, color: color || '#ffffff' })); m.position.y = y || -0.02; m.receiveShadow = true; g.add(m); return m; };
    Q.glow = (x, y, zz, color, size, op) => { const s = glowSprite(color, size, op); s.position.set(x, y, zz); g.add(s); return s; };
    Q.leaf = [Q.inst(leafGeos[0], leafMat, 1100), Q.inst(leafGeos[1], leafMat, 1100)];
    Q.trunk = Q.inst(CYLT, M('#8a6347'), 160);
    Q.tree = (x, zz, s, pal, climb, simple) => {
      pal = pal || GREEN; Q.canopies.push([x, zz, s]); Q.trunk.add(x, 1.8 * s, zz, 0.42 * s, 3.6 * s, 0.42 * s, 0, pick(['#8a6347', '#7d5a42', '#96704f']));
      const B = (dx, dy, dz, r) => Q.leaf[Math.floor(rnd() * 2)].add(x + dx * s, dy * s, zz + dz * s, r * s, r * s * 0.92, r * s, R(0, TAU), pick(pal));
      B(0, 4.3, 0, 2.3);
      if (simple) { B(1.2, 3.6, 0.4, 1.5); B(-1.2, 3.8, -0.5, 1.5); }
      else { for (let k = 0; k < 5; k++) { const a = k / 5 * TAU + R(-0.3, 0.3); B(Math.cos(a) * 1.7, 3.7 + R(-0.2, 0.7), Math.sin(a) * 1.7, R(1.3, 1.7)); } B(0, 3.0, 0, 1.6); }
      if (!simple) Q.col(x, zz, 0.5 * s);
      if (climb) Q.trees.push([x, zz, s]);
    };
    Q.bench = (x, zz, ry, kind) => {
      const grp = new THREE.Group(); grp.position.set(x, 0, zz); grp.rotation.y = ry; g.add(grp);
      const add = (geo, mat, px, py, pz, sx, sy, sz, rz, rx) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.scale.set(sx, sy, sz); if (rz) m.rotation.z = rz; if (rx) m.rotation.x = rx; m.castShadow = m.receiveShadow = true; grp.add(m); return m; };
      if (kind === 'log') { const m = add(CYL, M('#9a6f48'), 0, 0.27, 0, 0.27, 2.3, 0.27, Math.PI / 2); [-1.15, 1.15].forEach(sx => add(CYL, M('#d9b98a'), sx, 0.27, 0, 0.2, 0.02, 0.2, Math.PI / 2)); }
      else { const wood = kind === 'stone' ? '#b9b2a6' : '#c68b56'; const a = add(UNIT, M(wood), 0, 0.5, 0, 2.2, 0.09, 0.56); const b = add(UNIT, M(wood), 0, 0.88, -0.27, 2.2, 0.5, 0.07, 0, -0.2); [-0.95, 0.95].forEach(lx => add(UNIT, M('#3f3b4d'), lx, 0.25, 0, 0.08, 0.5, 0.5)); }
      [-0.6, 0.6].forEach(lx => Q.col(x + Math.cos(ry) * lx, zz - Math.sin(ry) * lx, 0.62));
      Q.benches.push({ x: x + z.ox, z: zz + z.oz, ry, lx: x, lz: zz });
    };
    Q.gate = () => {
      const [gx, gz] = z.gate, ry = Math.atan2(-gx, -gz), G = makeGate(g, gx, gz, ry, '#ffd9a8', '🌿 광장으로', '#ffd9a8');
      Q.gateObj = G; const c = Math.cos(ry), s = Math.sin(ry); [-2.0, 2.0].forEach(lx => Q.col(gx + c * lx, gz - s * lx, 0.5)); Q.upd.push(G.update);
    };
    Q.finish = () => { Q.insts.forEach(api => { const m = api.m; m.count = api.n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }); };
    zones[id] = Q; S._z[id] = Q; return Q;
  }

  /* ── 달문(입구): 달 모양 돌문 + 일렁이는 빛 ── */
  const swirlTex = ctex(256, 256, (g) => {
    g.translate(128, 128);
    const r = g.createRadialGradient(0, 0, 0, 0, 0, 128); r.addColorStop(0, 'rgba(255,255,255,.5)'); r.addColorStop(0.55, 'rgba(255,255,255,.3)'); r.addColorStop(1, 'rgba(255,255,255,.08)'); g.fillStyle = r; g.fillRect(-128, -128, 256, 256);
    g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 7; g.lineCap = 'round';
    for (let a = 0; a < 4; a++) { g.beginPath(); for (let t = 0; t <= 1; t += 0.04) { const ang = a * Math.PI / 2 + t * 3.4, rr = 8 + t * 112; g.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr); } g.globalAlpha = 0.65; g.stroke(); }
    g.globalAlpha = 1;
  });
  function makeGate(parent, x, z, ry, color, text, labelColor) {
    const grp = new THREE.Group(); grp.position.set(x, 0, z); grp.rotation.y = ry; parent.add(grp);
    const stone = M('#e0d4be'), dark = M('#b9ab94');
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.95, 0.3, 10, 40), stone); ring.position.y = 2.25; ring.castShadow = ring.receiveShadow = true; grp.add(ring); city.outline(ring);
    [-1, 1].forEach(s => { const b = new THREE.Mesh(UNIT, dark); b.scale.set(1.0, 0.5, 1.0); b.position.set(s * 1.95, 0.25, 0); b.castShadow = b.receiveShadow = true; grp.add(b); });
    const base = new THREE.Mesh(UNIT, dark); base.scale.set(5.2, 0.12, 2.2); base.position.y = 0.06; base.receiveShadow = true; grp.add(base);
    const col = new THREE.Color(color);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.7, 40), new THREE.MeshBasicMaterial({ map: swirlTex, color: col, transparent: true, opacity: 0.62, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false })); disc.position.set(0, 2.25, 0); grp.add(disc);
    const disc2 = new THREE.Mesh(new THREE.CircleGeometry(1.25, 32), new THREE.MeshBasicMaterial({ map: swirlTex, color: col, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false })); disc2.position.set(0, 2.25, 0.02); grp.add(disc2);
    const halo = glowSprite(color, 6, 0.3); halo.position.set(0, 2.25, -0.2); grp.add(halo);
    const label = labelSprite(text, labelColor || color); label.position.set(0, 5.3, 0); grp.add(label);
    const star = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctex(128, 128, (g) => { g.font = '84px ' + UIF; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('✨', 64, 70); }), transparent: true, depthWrite: false })); star.scale.set(1.4, 1.4, 1); star.position.set(0, 6.5, 0); star.visible = false; grp.add(star);
    const lamps = []; [-1, 1].forEach(s => { const gl = glowSprite('#ffe3ad', 1.6, 0.85); gl.position.set(s * 1.95, 1.25, 0.3); grp.add(gl); lamps.push(gl); });
    return { grp, disc, disc2, halo, star, label, update(dt, T) { disc.rotation.z += dt * 0.6; disc2.rotation.z -= dt * 0.9; halo.material.opacity = 0.26 + 0.08 * Math.sin(T * 2); star.position.y = 6.5 + Math.sin(T * 2.6) * 0.18; lamps.forEach((l, i) => { l.material.opacity = 0.7 + 0.2 * Math.sin(T * 3 + i * 2); }); } };
  }

  /* ════════════ 🌲 숲속 쉼터 ════════════ */
  (function () {
    const Q = makeZone('forest'), g = Q.g;
    Q.ground(groundTex('#78b85e', [['#5f9e4e', 150, 6, 30, 0.35], ['#8cc96a', 130, 5, 26, 0.3], ['#4f8a45', 60, 8, 24, 0.25], ['#a8d878', 50, 3, 10, 0.25]], [30, 30]), '#ffffff', 150);
    const st = Q.inst(CYL, M('#ffffff'), 30);
    for (let i = 0; i < 16; i++) { const t = i / 15; st.add(Math.sin(t * 3.0) * 2.2 * (1 - t * 0.3), 0.04, 30 - t * 25, R(0.55, 0.8), 0.08, R(0.5, 0.7), R(0, TAU), '#cdbba2'); }
    Q.gate();
    // 나무: 큰 나무 + 둘레 + 바깥 숲
    Q.tree(-10, -8, 2.5, GREEN, true);
    Q.tree(-17, 14, 1.8, DEEP, true);
    for (let i = 0; i < 70; i++) { const a = R(0, TAU), r = R(13, 44), x = Math.cos(a) * r, zz = Math.sin(a) * r; if (Math.abs(x) < 4.5 && zz > 2) continue; if (Math.hypot(x - 12, zz + 4) < 8 || Math.hypot(x + 10, zz + 8) < 6 || Math.hypot(x, zz - 4) < 7) continue; Q.tree(x, zz, R(1.0, 1.8), rnd() < 0.15 ? PINK : pick([GREEN, DEEP])); }
    for (let i = 0; i < 46; i++) { const a = R(0, TAU), r = R(48, 100); Q.tree(Math.cos(a) * r, Math.sin(a) * r, R(1.4, 2.4), pick([GREEN, DEEP]), false, true); }
    // 쉼터: 통나무 의자 4개 + 가운데 납작한 돌
    Q.mesh(CYL, M('#bdb6a8'), 0, 0.14, 3, 0.9, 0.28, 0.9);
    for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + 0.4, x = Math.cos(a) * 3.8, zz = 3 + Math.sin(a) * 3.8; Q.bench(x, zz, Math.atan2(-x, 3 - zz), 'log'); }
    // 연못
    const pond = new THREE.Mesh(new THREE.CircleGeometry(5.2, 36), new THREE.MeshBasicMaterial({ map: ctex(256, 256, (c) => { c.fillStyle = '#5fc4be'; c.fillRect(0, 0, 256, 256); c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 3; for (let i = 0; i < 14; i++) { c.beginPath(); c.arc(R(0, 256), R(0, 256), R(6, 26), 0, TAU); c.stroke(); } }, [3, 3]), transparent: true, opacity: 0.88 }));
    pond.rotation.x = -Math.PI / 2; pond.position.set(12, 0.06, -4); g.add(pond); Q.col(12, -4, 4.9);
    Q.upd.push((dt, T) => { pond.material.map.offset.set(T * 0.01, T * 0.015); });
    const rk = Q.inst(ICO, M('#ffffff'), 60);
    for (let i = 0; i < 20; i++) { const a = i / 20 * TAU; rk.add(12 + Math.cos(a) * 5.5, 0.22, -4 + Math.sin(a) * 5.5, R(0.45, 0.8), R(0.3, 0.5), R(0.45, 0.8), R(0, TAU), pick(['#9a9a96', '#8a948a', '#a8a8a0'])); }
    for (let i = 0; i < 9; i++) { const a = R(0, TAU), r = R(1, 4); const lx = 12 + Math.cos(a) * r, lz = -4 + Math.sin(a) * r; const lp = Q.mesh(CYL, M('#4fa863'), lx, 0.09, lz, R(0.35, 0.55), 0.02, R(0.35, 0.55)); lp.castShadow = false; if (rnd() < 0.5) { const fl = Q.mesh(SPH, M('#ffb6d0'), lx, 0.16, lz, 0.13, 0.1, 0.13); fl.castShadow = false; } }
    // 풀 · 꽃 · 버섯 · 바위
    const gr = Q.inst(CONE4, M('#ffffff'), 1800), fl = Q.inst(SPH, M('#ffffff'), 260);
    for (let i = 0; i < 1800; i++) { const a = R(0, TAU), r = Math.sqrt(rnd()) * 46, x = Math.cos(a) * r, zz = Math.sin(a) * r; if (Math.abs(x) < 2.2 && zz > 6) continue; if (Math.hypot(x - 12, zz + 4) < 5.5) continue; const s = R(0.7, 1.3); gr.add(x, 0.14 * s, zz, 0.075 * s, 0.34 * s, 0.075 * s, R(0, TAU), pick(['#6fc05a', '#86d067', '#9bdc72', '#5fb050'])); }
    for (let i = 0; i < 260; i++) { const a = R(0, TAU), r = Math.sqrt(rnd()) * 44, x = Math.cos(a) * r, zz = Math.sin(a) * r; if (Math.hypot(x - 12, zz + 4) < 5.8 || (Math.abs(x) < 2.2 && zz > 6)) continue; fl.add(x, 0.34, zz, 0.075, 0.075, 0.075, 0, pick(['#fff1d6', '#f7a8c0', '#f4d06a', '#c9b6f2', '#ffffff'])); }
    const ms = Q.inst(CYL, M('#f6efe0'), 40), mc2 = Q.inst(SPH, M('#ffffff'), 40);
    for (let c = 0; c < 8; c++) { const a = R(0, TAU), r = R(10, 36), cx = Math.cos(a) * r, cz = Math.sin(a) * r; if (Math.hypot(cx - 12, cz + 4) < 8) continue; for (let k = 0; k < 4; k++) { const x = cx + R(-0.7, 0.7), zz = cz + R(-0.7, 0.7), s = R(0.5, 1.1); ms.add(x, 0.14 * s, zz, 0.05 * s, 0.28 * s, 0.05 * s, 0, '#f6efe0'); mc2.add(x, 0.3 * s, zz, 0.15 * s, 0.1 * s, 0.15 * s, 0, pick(['#e8564a', '#f09a4a', '#e8564a'])); } }
    for (let i = 0; i < 26; i++) { const a = R(0, TAU), r = R(8, 42), x = Math.cos(a) * r, zz = Math.sin(a) * r; if (Math.hypot(x - 12, zz + 4) < 8 || (Math.abs(x) < 4 && zz > 4)) continue; const s = R(0.5, 1.5); rk.add(x, 0.25 * s, zz, s, 0.7 * s, s * 0.9, R(0, TAU), pick(['#9a9a96', '#7f8e7c'])); if (s > 1.1) Q.col(x, zz, 0.8 * s); }
    // 햇살 기둥
    const shaftTex = ctex(64, 256, (c) => { const gd = c.createLinearGradient(0, 0, 0, 256); gd.addColorStop(0, 'rgba(255,248,210,0)'); gd.addColorStop(0.25, 'rgba(255,248,210,.9)'); gd.addColorStop(1, 'rgba(255,248,210,0)'); c.fillStyle = gd; c.fillRect(0, 0, 64, 256); const hx = c.createLinearGradient(0, 0, 64, 0); hx.addColorStop(0, 'rgba(0,0,0,1)'); hx.addColorStop(0.5, 'rgba(0,0,0,0)'); hx.addColorStop(1, 'rgba(0,0,0,1)'); c.globalCompositeOperation = 'destination-out'; c.fillStyle = hx; c.fillRect(0, 0, 64, 256); });
    const shafts = [];
    for (let i = 0; i < 7; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(R(2.2, 4), 20), new THREE.MeshBasicMaterial({ map: shaftTex, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); const a = R(0, TAU), r = R(2, 16); m.position.set(Math.cos(a) * r - 2, 9, Math.sin(a) * r + 1); m.rotation.set(0, R(0, TAU), 0.32); g.add(m); shafts.push(m); }
    Q.upd.push((dt, T) => { shafts.forEach((m, i) => { m.material.opacity = 0.15 + 0.08 * Math.sin(T * 0.5 + i * 1.7); }); });
    // 나비
    const bt = ctex(64, 64, (c) => { c.fillStyle = '#fff'; c.strokeStyle = 'rgba(60,40,70,.6)'; c.lineWidth = 2; [[-1, 1], [1, 1]].forEach(s => { c.beginPath(); c.ellipse(32 + s[0] * 14, 28, 13, 17, s[0] * 0.5, 0, TAU); c.fill(); c.stroke(); c.beginPath(); c.ellipse(32 + s[0] * 10, 44, 8, 11, -s[0] * 0.4, 0, TAU); c.fill(); c.stroke(); }); });
    const bf = []; for (let i = 0; i < 9; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: bt, color: pick(['#ffd36e', '#ff9ec4', '#a8d4ff', '#ffffff']), transparent: true })); sp.scale.set(0.4, 0.4, 1); g.add(sp); bf.push({ sp, a: R(0, TAU), r: R(3, 20), cx: R(-12, 12), cz: R(-6, 14), y: R(1, 2.4), v: R(0.4, 0.9), ph: R(0, TAU) }); }
    Q.upd.push((dt, T) => { bf.forEach(b => { b.a += b.v * dt; const x = b.cx + Math.cos(b.a) * b.r * 0.5, zz = b.cz + Math.sin(b.a * 1.3) * b.r * 0.4; b.sp.position.set(x, b.y + Math.sin(T * 2 + b.ph) * 0.35, zz); b.sp.scale.x = 0.4 * (0.35 + 0.65 * Math.abs(Math.sin(T * 9 + b.ph))); }); });
    Q.walk = null; Q.finish();
  })();

  /* ════════════ 🌅 노을 바닷가 ════════════ */
  (function () {
    const Q = makeZone('beach'), g = Q.g;
    // 모래
    const sg = new THREE.PlaneGeometry(200, 300); sg.rotateX(-Math.PI / 2);
    const sand = new THREE.Mesh(sg, toon({ map: groundTex('#efd7a8', [['#e2c590', 200, 4, 22, 0.35], ['#f8e6bf', 160, 3, 16, 0.4], ['#d6b680', 60, 5, 18, 0.25]], [28, 40]), color: '#dccfba' })); sand.position.set(70, -0.01, 0); sand.receiveShadow = true; g.add(sand);
    const wet = new THREE.Mesh(new THREE.PlaneGeometry(6, 300), new THREE.MeshBasicMaterial({ color: '#b98c62', transparent: true, opacity: 0.45, depthWrite: false })); wet.rotation.x = -Math.PI / 2; wet.position.set(-9, 0.012, 0); g.add(wet);
    // 바다
    const sea = new THREE.PlaneGeometry(700, 400); sea.rotateX(-Math.PI / 2); sea.translate(-12 - 350, 0, 0);
    const seaMat = new THREE.ShaderMaterial({
      transparent: true, fog: true, depthWrite: false,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uT: { value: 0 }, uShallow: { value: new THREE.Color('#ffd7b0') }, uMid: { value: new THREE.Color('#f0928f') }, uDeep: { value: new THREE.Color('#4b5fa6') } }]),
      vertexShader: 'varying vec3 vP;\n#include <fog_pars_vertex>\nvoid main(){ vP=position; vec4 mvPosition=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mvPosition;\n#include <fog_vertex>\n}',
      fragmentShader: 'uniform float uT; uniform vec3 uShallow,uMid,uDeep; varying vec3 vP;\n#include <fog_pars_fragment>\nvoid main(){ float d=clamp((-12.0-vP.x)/90.0,0.0,1.0);\n vec3 c=mix(uShallow,uMid,smoothstep(0.0,0.16,d)); c=mix(c,uDeep,smoothstep(0.10,0.95,d));\n float w=sin(vP.z*0.5+uT*0.8+sin(vP.x*0.15)*2.0)+sin(vP.z*1.1-uT*1.1+vP.x*0.3)*0.7+sin(vP.x*0.9+uT*0.7)*0.5;\n c+=vec3(1.0,0.82,0.62)*smoothstep(1.5,2.1,w)*0.30;\n float band=exp(-pow((vP.z+10.0)/(8.0+d*46.0),2.0)); c+=vec3(1.0,0.78,0.5)*band*(0.18+0.4*smoothstep(0.6,1.4,w))*(0.3+d)*1.2;\n float a=mix(0.28,1.0,smoothstep(0.0,0.2,d)); gl_FragColor=vec4(c,a);\n#include <fog_fragment>\n}'
    });
    const seaM = new THREE.Mesh(sea, seaMat); seaM.position.y = 0.03; seaM.renderOrder = 1; g.add(seaM);
    // 거품
    const foamTex = ctex(256, 64, (c) => { for (let i = 0; i < 90; i++) { c.fillStyle = 'rgba(255,255,255,' + R(0.25, 0.8) + ')'; c.beginPath(); c.ellipse(R(0, 256), R(14, 50), R(6, 26), R(2, 5), 0, 0, TAU); c.fill(); } }, [1, 1]);
    const foams = []; for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 300), new THREE.MeshBasicMaterial({ map: foamTex, transparent: true, opacity: 0.6, depthWrite: false })); m.material.map.repeat.set(1, 6); m.rotation.x = -Math.PI / 2; m.position.set(-12, 0.05, 0); m.renderOrder = 2; g.add(m); foams.push(m); }
    Q.upd.push((dt, T) => { seaMat.uniforms.uT.value = T; foams.forEach((m, i) => { const k = (T * 0.16 + i / 3) % 1; m.position.x = -9.5 - Math.sin(k * Math.PI) * 3.4 + k * 0; m.material.opacity = 0.65 * Math.sin(k * Math.PI); }); });
    Q.gate();
    // 부두
    const deck = Q.mesh(UNIT, M('#b98a5e'), -23, 0.045, -12, 26, 0.09, 3.0); deck.castShadow = false;
    const pp = Q.inst(CYL, M('#6e5240'), 40); for (let i = 0; i < 14; i++) { const x = -11 - i * 1.85; [-1.45, 1.45].forEach(s => { pp.add(x, 0.5, -12 + s, 0.1, 1.2, 0.1, 0, '#6e5240'); }); }
    for (let i = 0; i < 12; i++) { const x = -11 - i * 2.2; [-1.45, 1.45].forEach(s => { const m = Q.mesh(UNIT, M('#a9794e'), x - 1.1, 0.78, -12 + s, 2.2, 0.06, 0.07); m.castShadow = false; }); }
    Q.mesh(SPH, M('#ffe3ad'), -35.4, 1.5, -12, 0.2, 0.2, 0.2); Q.glow(-35.4, 1.5, -12, '#ffd48a', 3.2, 0.9);
    Q.mesh(CYL, M('#6e5240'), -35.4, 0.75, -12, 0.07, 1.5, 0.07);
    Q.bench(-33.4, -12, -Math.PI / 2, 'wood');      // 부두 끝 벤치: 바다를 보고 앉기
    // 모닥불 + 통나무
    const FX = 6, FZ = 12;
    for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + 0.8, x = FX + Math.cos(a) * 3.3, zz = FZ + Math.sin(a) * 3.3; Q.bench(x, zz, Math.atan2(FX - x, FZ - zz), 'log'); }
    const ring = Q.inst(ICO, M('#ffffff'), 12); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; ring.add(FX + Math.cos(a) * 0.95, 0.18, FZ + Math.sin(a) * 0.95, 0.3, 0.22, 0.3, R(0, TAU), '#8d8a86'); }
    Q.col(FX, FZ, 1.0);
    const flames = []; [['#ff8a3a', 0.55, 1.5], ['#ffc84a', 0.4, 1.1], ['#fff0a0', 0.25, 0.7]].forEach((f, i) => { const m = new THREE.Mesh(new THREE.ConeGeometry(f[1], f[2], 7), new THREE.MeshBasicMaterial({ color: f[0], transparent: true, opacity: 0.92 })); m.position.set(FX, f[2] / 2 + 0.1, FZ); g.add(m); flames.push(m); });
    const fglow = Q.glow(FX, 1.0, FZ, '#ff9a4a', 9, 0.7);
    const sparks = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: 0.16, map: glowTex, color: '#ffbe6a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); const SP = 36, sp = new Float32Array(SP * 3), sd = []; for (let i = 0; i < SP; i++) sd.push({ p: R(0, 1), a: R(0, TAU), r: R(0.1, 0.8), s: R(0.5, 1.2) }); sparks.geometry.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sparks.frustumCulled = false; g.add(sparks);
    Q.upd.push((dt, T) => { flames.forEach((m, i) => { const f = 1 + 0.18 * Math.sin(T * (9 + i * 3) + i * 2) + 0.08 * Math.sin(T * 23 + i); m.scale.set(1 - (f - 1) * 0.5, f, 1 - (f - 1) * 0.5); m.rotation.y += dt * 2; }); fglow.material.opacity = 0.6 + 0.15 * Math.sin(T * 11) + 0.08 * Math.sin(T * 17);
      for (let i = 0; i < SP; i++) { const d = sd[i]; d.p = (d.p + dt * 0.35 * d.s) % 1; const h = d.p * 5; sp[i * 3] = FX + Math.cos(d.a + d.p * 2) * d.r * (1 + d.p); sp[i * 3 + 1] = 0.5 + h; sp[i * 3 + 2] = FZ + Math.sin(d.a + d.p * 2) * d.r * (1 + d.p); } sparks.geometry.attributes.position.needsUpdate = true; });
    // 파라솔 · 의자 · 담요
    { const px = -3, pz = -5; Q.mesh(CYL, M('#f3ece0'), px, 1.2, pz, 0.05, 2.4, 0.05);
      const cano = new THREE.Mesh(new THREE.ConeGeometry(2.1, 0.8, 10), new THREE.MeshToonMaterial({ map: ctex(128, 64, (c) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#ffffff' : '#f2776a'; c.fillRect(i * 16, 0, 16, 64); } }), gradientMap: M('#fff').gradientMap })); cano.position.set(px, 2.55, pz); cano.castShadow = true; g.add(cano);
      Q.mesh(UNIT, M('#f6e3c8'), px + 0.2, 0.05, pz + 2.4, 2.4, 0.05, 1.7, 0.2).castShadow = false; Q.col(px, pz, 0.3);
      Q.bench(px - 2.6, pz + 0.5, Math.PI / 2 + 0.2, 'wood'); }
    // 바위 · 유목 · 조개 · 소나무
    const rk = Q.inst(ICO, M('#ffffff'), 40); for (let i = 0; i < 22; i++) { const a = R(-1.2, 1.2), r = R(-1, 1); let x = R(-14, 40), zz = R(-40, 40); if (Math.hypot(x - FX, zz - FZ) < 6 || Math.abs(zz + 12) < 3 && x < -8) continue; const s = R(0.4, 1.4); rk.add(x, 0.2 * s, zz, s, 0.6 * s, s * 0.85, R(0, TAU), pick(['#8c8a8e', '#a09a94', '#767a86'])); if (s > 0.9) Q.col(x, zz, 0.8 * s); }
    const sh = Q.inst(SPH, M('#ffffff'), 80); for (let i = 0; i < 70; i++) sh.add(R(-14, 40), 0.04, R(-40, 40), 0.08, 0.04, 0.08, 0, pick(['#fff1e8', '#ffd3c4', '#f8e0f0']));
    for (let i = 0; i < 18; i++) { const x = R(38, 70), zz = R(-60, 60); Q.trunk.add(x, 2.2, zz, 0.3, 4.4, 0.3, 0, '#7b5a44'); const sc = R(1.0, 1.6); Q.leaf[0].add(x, 5, zz, 1.7 * sc, 1.3 * sc, 1.7 * sc, 0, pick(['#4f8f58', '#5aa064', '#3f7f52'])); Q.leaf[1].add(x, 6.5, zz, 1.2 * sc, 1.0 * sc, 1.2 * sc, 0, '#5aa064'); if (Math.abs(x) < 46 && Math.hypot(x, zz) < 44) Q.col(x, zz, 0.45); }
    for (let i = 0; i < 4; i++) { const x = R(14, 34), zz = R(-34, 34), s = R(0.8, 1.2); Q.mesh(CYL, M('#8a7058'), x, 0.16, zz, 0.12 * s, 2.4 * s, 0.12 * s).rotation.z = Math.PI / 2 + R(-0.2, 0.2); }
    // 등대
    { const lx = -90, lz = -80; Q.mesh(CYLT, M('#f4efe6'), lx, 12, lz, 3.6, 24, 3.6); for (let i = 0; i < 3; i++) Q.mesh(CYL, M('#e0574e'), lx, 5 + i * 8, lz, 3.0 - i * 0.35, 2.2, 3.0 - i * 0.35); Q.mesh(CYL, M('#4a4458'), lx, 25, lz, 2.3, 2.4, 2.3); Q.glow(lx, 25, lz, '#ffe08a', 14, 0.9); Q.mesh(CONE, M('#e0574e'), lx, 27.6, lz, 2.6, 2.6, 2.6); }
    Q.walk = (p) => { if (p.x < -15.5) { if (Math.abs(p.z + 12) < 1.3 && p.x > -35.2) { p.z = Math.max(-13.3, Math.min(-10.7, p.z)); } else if (p.x < -15.5) p.x = -15.5; } };
    Q.finish();
  })();

  /* ════════════ 🌌 별빛 언덕 ════════════ */
  (function () {
    const Q = makeZone('stars'), g = Q.g;
    Q.ground(groundTex('#6aa88c', [['#4f8f78', 160, 6, 28, 0.35], ['#82bf9d', 130, 5, 22, 0.3], ['#3f7a68', 60, 8, 24, 0.25]], [30, 30]), '#ffffff', 150);
    // 멀리 보이는 능선
    const hl = Q.inst(SPH, M('#ffffff'), 30); for (let i = 0; i < 26; i++) { const a = i / 26 * TAU + R(-0.1, 0.1), r = R(95, 125), w = R(24, 46); hl.add(Math.cos(a) * r, -4, Math.sin(a) * r, w, R(14, 26), w, 0, pick(['#2f4a5a', '#38546a', '#2a4252'])); }
    Q.gate();
    Q.tree(-9, -9, 2.2, ['#4a9a7a', '#3f8a6e', '#58a888'], true);
    for (let i = 0; i < 16; i++) { const a = R(0, TAU), r = R(30, 44); Q.tree(Math.cos(a) * r, Math.sin(a) * r, R(1.2, 1.9), ['#3f8a6e', '#357a62', '#4a9a7a'], false, false); }
    // 돗자리(눕기 좋은 곳)
    const mats = [[3, 6, 0.3, '#f2776a'], [-5, 10, -0.5, '#6fa8e0'], [8, -3, 0.9, '#f2c14a'], [-12, 2, 0.1, '#b98ae0']];
    const checker = c0 => ctex(64, 64, (c) => { c.fillStyle = '#fff4e4'; c.fillRect(0, 0, 64, 64); c.fillStyle = c0; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2) c.fillRect(x * 8, y * 8, 8, 8); }, [3, 2]);
    mats.forEach(m => { const mm = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.4), new THREE.MeshToonMaterial({ map: checker(m[3]), gradientMap: M('#fff').gradientMap })); mm.rotation.set(-Math.PI / 2, 0, m[2]); mm.position.set(m[0], 0.03, m[1]); mm.receiveShadow = true; g.add(mm); const pl = Q.mesh(UNIT, M('#fff4e4'), m[0] + 0.9, 0.12, m[1] - 0.9, 0.7, 0.2, 0.45, m[2] + 0.4); pl.castShadow = false; });
    Q.bench(13, 9, Math.atan2(-13, -9) + 0.4, 'wood'); Q.bench(-14, -12, Math.atan2(14, 12) - 0.3, 'wood');
    // 망원경
    { const tx = 6, tz = 0; for (let k = 0; k < 3; k++) { const a = k / 3 * TAU; const leg = Q.mesh(CYL, M('#6a5a4a'), tx + Math.cos(a) * 0.35, 0.75, tz + Math.sin(a) * 0.35, 0.04, 1.6, 0.04); leg.rotation.set(Math.sin(a) * 0.22, 0, -Math.cos(a) * 0.22); }
      const tube = Q.mesh(CYL, M('#e8e2d4'), tx, 1.6, tz, 0.17, 1.5, 0.17); tube.rotation.set(0.9, 0.4, 0); Q.mesh(CYL, M('#b08a50'), tx - 0.3, 2.05, tz + 0.2, 0.2, 0.08, 0.2).rotation.set(0.9, 0.4, 0); Q.col(tx, tz, 0.5); }
    // 등불 + 전구줄
    const lamps = []; for (let i = 0; i < 12; i++) { const a = R(0, TAU), r = R(5, 26), x = Math.cos(a) * r, zz = Math.sin(a) * r; if (Math.abs(x) < 3 && zz > 14) continue; Q.mesh(CYL, M('#4a3f55'), x, 0.25, zz, 0.12, 0.5, 0.12); Q.mesh(SPH, M('#ffe3ad'), x, 0.58, zz, 0.16, 0.2, 0.16).castShadow = false; lamps.push(Q.glow(x, 0.58, zz, '#ffd48a', 2.2, 0.8)); }
    { const a = [-14, 18], b = [14, 18]; [a, b].forEach(p => { Q.mesh(CYL, M('#5a4a3f'), p[0], 2.4, p[1], 0.09, 4.8, 0.09); Q.col(p[0], p[1], 0.25); });
      const N = 26, pts = new Float32Array(N * 3); for (let i = 0; i < N; i++) { const t = i / (N - 1); pts[i * 3] = a[0] + (b[0] - a[0]) * t; pts[i * 3 + 1] = 4.6 - Math.sin(t * Math.PI) * 1.0; pts[i * 3 + 2] = a[1]; }
      const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pts, 3)); const bulbs = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.55, map: glowTex, color: '#ffd9a0', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); bulbs.frustumCulled = false; g.add(bulbs); Q.upd.push((dt, T) => { bulbs.material.opacity = 0.8 + 0.2 * Math.sin(T * 2.2); }); }
    // 풀 · 꽃
    const gr = Q.inst(CONE4, M('#ffffff'), 700); for (let i = 0; i < 700; i++) { const a = R(0, TAU), r = Math.sqrt(rnd()) * 46, x = Math.cos(a) * r, zz = Math.sin(a) * r; if (Math.abs(x) < 2.2 && zz > 6) continue; const s = R(0.8, 1.6); gr.add(x, 0.2 * s, zz, 0.12 * s, 0.5 * s, 0.12 * s, R(0, TAU), pick(['#4e9a7a', '#5fae8a', '#3f8a70'])); }
    // 별 하늘: 별가루 + 은하수 + 별똥별
    const sky = new THREE.Group(); scene.add(sky); sky.visible = false; Q.sky = sky;
    function starPts(n, size, op, band) {
      const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), c = new THREE.Color(); let k = 0;
      while (k < n) { let x, y, z;
        if (band) { const t = R(0, TAU), w = (rnd() + rnd() + rnd() - 1.5) * 0.22; x = Math.cos(t); z = Math.sin(t); y = w + Math.sin(t * 1) * 0.35 + 0.28; const l = Math.hypot(x, y, z); x /= l; y /= l; z /= l; } else { x = R(-1, 1); y = R(-1, 1); z = R(-1, 1); const l = Math.hypot(x, y, z); if (l > 1 || l < 0.2) continue; x /= l; y /= l; z /= l; }
        if (y < 0.03) continue; pos[k * 3] = x * 430; pos[k * 3 + 1] = y * 430; pos[k * 3 + 2] = z * 430; c.set(band ? pick(['#b9c4ff', '#d8c4ff', '#aab8ff']) : pick(['#ffffff', '#fff2d8', '#cfe0ff', '#ffe0e0'])); col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b; k++; }
      const gm = new THREE.BufferGeometry(); gm.setAttribute('position', new THREE.BufferAttribute(pos, 3)); gm.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const p = new THREE.Points(gm, new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: op, depthWrite: false, fog: false, blending: THREE.AdditiveBlending })); p.frustumCulled = false; sky.add(p); return p;
    }
    const sBig = starPts(260, 2.8, 0.95), sSmall = starPts(1500, 1.5, 0.8), sBand = starPts(2600, 1.3, 0.5, true);
    const mTex = ctex(64, 256, (c) => { const gd = c.createLinearGradient(0, 0, 0, 256); gd.addColorStop(0, 'rgba(255,255,255,0)'); gd.addColorStop(1, 'rgba(255,255,255,1)'); c.fillStyle = gd; c.beginPath(); c.moveTo(32, 0); c.lineTo(40, 250); c.lineTo(24, 250); c.closePath(); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(32, 250, 6, 0, TAU); c.fill(); });
    const meteors = []; for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(5, 60), new THREE.MeshBasicMaterial({ map: mTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })); m.frustumCulled = false; sky.add(m); meteors.push({ m, t: -R(1, 6), dur: 1.3, live: false, from: new THREE.Vector3(), to: new THREE.Vector3() }); }
    const ax = new THREE.Vector3(), ay = new THREE.Vector3(), dv = new THREE.Vector3(), orig = new THREE.Vector3();
    Q.upd.push((dt, T, cp) => {
      sky.position.copy(cp); sBig.material.opacity = 0.75 + 0.25 * Math.sin(T * 1.7);
      meteors.forEach(q => {
        q.t += dt; if (q.t < 0) { q.m.material.opacity = 0; return; }
        if (!q.live) { q.live = true; const a = R(0, TAU), el = R(0.35, 0.9); q.from.set(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)).multiplyScalar(380); q.to.set(q.from.x + R(-120, 120), q.from.y - R(70, 120), q.from.z + R(-120, 120)); }
        if (q.t > q.dur) { q.live = false; q.t = -R(3, 10); q.m.material.opacity = 0; return; }
        const k = q.t / q.dur; q.m.position.lerpVectors(q.from, q.to, k); q.m.lookAt(orig);
        dv.subVectors(q.to, q.from).normalize(); ax.set(1, 0, 0).applyQuaternion(q.m.quaternion); ay.set(0, 1, 0).applyQuaternion(q.m.quaternion);
        q.m.rotateZ(Math.atan2(dv.dot(ax), -dv.dot(ay))); q.m.material.opacity = Math.sin(k * Math.PI) * 0.95;
      });
    });
    Q.onShow = v => { sky.visible = v; };
    Q.walk = null; Q.finish();
  })();

  /* ════════════ ♨️ 달빛 온천 ════════════ */
  (function () {
    const Q = makeZone('spring'), g = Q.g;
    Q.ground(groundTex('#5d7f66', [['#4d6f59', 160, 6, 26, 0.35], ['#7a9a7c', 120, 4, 20, 0.3], ['#43604f', 70, 8, 26, 0.25], ['#8c8a82', 40, 3, 9, 0.3]], [28, 28]), '#e0d4ff', 150);
    Q.gate();
    const PX = 0, PZ = -5, PR = 7.4;
    // 돌길
    const path = Q.inst(CYL, M('#ffffff'), 30); for (let i = 0; i < 15; i++) { const t = i / 14; path.add(Math.sin(t * 2.4) * 1.6, 0.04, 28 - t * 19, R(0.6, 0.85), 0.08, R(0.55, 0.75), R(0, TAU), '#b9b2a6'); }
    // 물
    const wTex = ctex(256, 256, (c) => { c.fillStyle = '#6fd9d2'; c.fillRect(0, 0, 256, 256); c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 3; for (let i = 0; i < 16; i++) { c.beginPath(); c.arc(R(0, 256), R(0, 256), R(8, 30), 0, TAU); c.stroke(); } }, [3, 3]);
    const water = new THREE.Mesh(new THREE.CircleGeometry(PR, 40), new THREE.MeshBasicMaterial({ map: wTex, color: '#d8fff6', transparent: true, opacity: 0.6, depthWrite: false })); water.rotation.x = -Math.PI / 2; water.position.set(PX, 0.32, PZ); water.renderOrder = 1; g.add(water);
    const bed = new THREE.Mesh(new THREE.CircleGeometry(PR, 40), new THREE.MeshBasicMaterial({ color: '#3f8f8c' })); bed.rotation.x = -Math.PI / 2; bed.position.set(PX, 0.01, PZ); g.add(bed);
    Q.upd.push((dt, T) => { wTex.offset.set(T * 0.012, T * 0.02); });
    // 둘레 바위 (남쪽 입구는 비워 둠)
    const rk = Q.inst(ICO, M('#ffffff'), 40);
    for (let i = 0; i < 26; i++) { const a = i / 26 * TAU; const deg = a * 180 / Math.PI; if (deg > 62 && deg < 118) continue; const s = R(0.8, 1.35), r = PR + 0.5; rk.add(PX + Math.cos(a) * r, 0.3 * s, PZ + Math.sin(a) * r, s, 0.75 * s, s * 0.9, R(0, TAU), pick(['#8a8580', '#9a948c', '#7a7a80'])); Q.col(PX + Math.cos(a) * r, PZ + Math.sin(a) * r, 0.8 * s); }
    // 김
    const steamTex = ctex(64, 64, (c) => { const r = c.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,.9)'); r.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = r; c.fillRect(0, 0, 64, 64); });
    const steam = []; for (let i = 0; i < 34; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: steamTex, color: '#ffe9f4', transparent: true, opacity: 0, depthWrite: false })); g.add(sp); const a = R(0, TAU), r = Math.sqrt(rnd()) * (PR - 1); steam.push({ sp, x: PX + Math.cos(a) * r, z: PZ + Math.sin(a) * r, p: R(0, 1), s: R(0.12, 0.25) }); }
    Q.upd.push((dt) => { steam.forEach(q => { q.p = (q.p + dt * q.s) % 1; q.sp.position.set(q.x + Math.sin(q.p * 6 + q.x) * 0.4, 0.5 + q.p * 4.5, q.z); q.sp.scale.setScalar(1.6 + q.p * 2.6); q.sp.material.opacity = Math.sin(q.p * Math.PI) * 0.32; }); });
    // 정자(지붕 있는 쉼터)
    { const hx = -15, hz = 9; Q.mesh(UNIT, M('#a98a66'), hx, 0.18, hz, 7, 0.36, 7);
      [[-3, -3], [3, -3], [-3, 3], [3, 3]].forEach(p => { Q.mesh(CYL, M('#b0503f'), hx + p[0], 1.9, hz + p[1], 0.22, 3.2, 0.22); Q.col(hx + p[0], hz + p[1], 0.35); });
      const roof = Q.mesh(CONE4, M('#4b4a5e'), hx, 4.6, hz, 6.4, 2.6, 6.4, Math.PI / 4); Q.mesh(UNIT, M('#8a3a35'), hx, 3.55, hz, 6.2, 0.22, 6.2);
      Q.mesh(SPH, M('#d9b66a'), hx, 6.0, hz, 0.26, 0.4, 0.26); Q.bench(hx, hz - 1.8, 0, 'wood'); Q.bench(hx - 1.8, hz + 0.5, Math.PI / 2, 'wood');
      const lg = Q.glow(hx, 3.0, hz, '#ffd29a', 5, 0.8); Q.upd.push((dt, T) => { lg.material.opacity = 0.7 + 0.1 * Math.sin(T * 2); }); }
    // 등불 기둥
    const lan = []; function lantern(x, zz, h) { Q.mesh(CYL, M('#5a4a3f'), x, h / 2, zz, 0.07, h, 0.07); Q.mesh(CYL, M('#ffd9a0'), x, h + 0.25, zz, 0.28, 0.5, 0.28).castShadow = false; Q.mesh(CYL, M('#7a3a35'), x, h + 0.55, zz, 0.34, 0.07, 0.34); Q.col(x, zz, 0.2); lan.push(Q.glow(x, h + 0.25, zz, '#ffb870', 3.4, 0.9)); }
    for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU + 0.2, deg = a * 180 / Math.PI; if (deg > 55 && deg < 125) continue; lantern(PX + Math.cos(a) * (PR + 3), PZ + Math.sin(a) * (PR + 3), 2.4); }
    lantern(-3, 26, 2.2); lantern(3, 26, 2.2); lantern(-3.5, 15, 2.2); lantern(3.5, 15, 2.2);
    Q.upd.push((dt, T) => { lan.forEach((l, i) => { l.material.opacity = 0.75 + 0.15 * Math.sin(T * 2.4 + i * 1.3); }); });
    // 하늘로 오르는 소원 등
    const skyL = []; const lt = ctex(64, 64, (c) => { c.fillStyle = '#ffb35a'; c.beginPath(); c.roundRect ? c.roundRect(14, 10, 36, 44, 6) : c.rect(14, 10, 36, 44); c.fill(); c.fillStyle = '#fff1b0'; c.fillRect(22, 20, 20, 24); });
    for (let i = 0; i < 18; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: lt, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); sp.scale.set(0.9, 1.1, 1); g.add(sp); skyL.push({ sp, x: R(-30, 30), z: R(-40, 20), p: R(0, 1), s: R(0.02, 0.045) }); }
    Q.upd.push((dt, T) => { skyL.forEach(q => { q.p = (q.p + dt * q.s) % 1; q.sp.position.set(q.x + Math.sin(T * 0.3 + q.x) * 1.2, 4 + q.p * 36, q.z); q.sp.material.opacity = Math.sin(q.p * Math.PI) * 0.9; }); });
    // 벚나무 + 꽃잎
    Q.tree(14, 7, 1.7, PINK, true); Q.tree(-20, -14, 1.5, PINK, false); Q.tree(22, -16, 1.4, PINK, false);
    const petals = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: 0.22, map: glowTex, color: '#ffc4dc', transparent: true, depthWrite: false })); const NP = 90, pp = new Float32Array(NP * 3), pd = []; for (let i = 0; i < NP; i++) pd.push({ x: R(-8, 8), z: R(-8, 8), y: R(0, 9), s: R(0.4, 0.9), ph: R(0, TAU) }); petals.geometry.setAttribute('position', new THREE.BufferAttribute(pp, 3)); petals.frustumCulled = false; g.add(petals);
    Q.upd.push((dt, T) => { for (let i = 0; i < NP; i++) { const d = pd[i]; d.y -= d.s * dt; if (d.y < 0.1) { d.y = 8 + R(0, 2); d.x = R(-6, 6); d.z = R(-6, 6); } pp[i * 3] = 14 + d.x + Math.sin(T * 0.8 + d.ph) * 1.4; pp[i * 3 + 1] = d.y; pp[i * 3 + 2] = 7 + d.z + Math.cos(T * 0.7 + d.ph) * 1.4; } petals.geometry.attributes.position.needsUpdate = true; });
    // 대나무 숲 · 바깥 나무
    const bam = Q.inst(CYL, M('#ffffff'), 120); for (let i = 0; i < 90; i++) { const a = R(2.4, 4.6), r = R(26, 52), h = R(7, 12); const x = Math.cos(a) * r, zz = Math.sin(a) * r; bam.add(x, h / 2, zz, 0.09, h, 0.09, 0, pick(['#7cb86a', '#6aa85e', '#8cc874'])); const bl = Q.leaf[0]; bl.add(x, h, zz, 0.7, 0.5, 0.7, R(0, TAU), '#7cc86a'); if (r < 40) Q.col(x, zz, 0.2); }
    for (let i = 0; i < 40; i++) { const a = R(0, TAU), r = R(44, 95); Q.tree(Math.cos(a) * r, Math.sin(a) * r, R(1.5, 2.4), ['#3f7f62', '#357258', '#4a8f70'], false, true); }
    const gr = Q.inst(CONE4, M('#ffffff'), 500); for (let i = 0; i < 500; i++) { const a = R(0, TAU), r = Math.sqrt(rnd()) * 38, x = Math.cos(a) * r, zz = Math.sin(a) * r; if (Math.hypot(x - PX, zz - PZ) < PR + 0.5) continue; const s = R(0.7, 1.4); gr.add(x, 0.2 * s, zz, 0.12 * s, 0.5 * s, 0.12 * s, R(0, TAU), pick(['#5a8f6a', '#6aa478', '#4a7f5e'])); }
    Q.walk = null; Q.finish();
  })();

  /* ── 광장 쪽 달문 4개 ── */
  const plazaGates = new THREE.Group(); scene.add(plazaGates);
  const pgObjs = {}, pgCols = [];
  ZN.PLAZA_GATES.forEach(pg => {
    const z = Z[pg.to], ry = Math.atan2(-pg.x, -pg.z), G = makeGate(plazaGates, pg.x, pg.z, ry, z.color, z.emoji + ' ' + z.name, z.color);
    pgObjs[pg.to] = G; const c = Math.cos(ry), s = Math.sin(ry); [-2.0, 2.0].forEach(lx => pgCols.push({ x: pg.x + c * lx, z: pg.z - s * lx, r: 0.5 }));
  });
  /* 광장 가로등 불빛이 겹치지 않게 입구 위에 은은한 빛 */
  S.setRecommended = id => { for (const k in pgObjs) pgObjs[k].star.visible = (k === id); };

  /* ── 바깥에서 쓰는 함수들 ── */
  function resolveCols(list, p, rad) { for (const c of list) { const dx = p.x - c.x, dz = p.z - c.z, m = c.r + rad, d2 = dx * dx + dz * dz; if (d2 < m * m) { const d = Math.sqrt(d2) || 0.001; p.x = c.x + dx / d * m; p.z = c.z + dz / d * m; } } }
  S.setZone = function (id) {
    S.zone = id; const plaza = id === 'plaza';
    plazaKids.forEach(o => { o.visible = plaza; }); plazaGates.visible = plaza;
    for (const k in zones) { zones[k].g.visible = (k === id); if (zones[k].onShow) zones[k].onShow(k === id); }
    const z = Z[id]; city.cx = z.ox || 0; city.cz = z.oz || 0;
    return z;
  };
  S.resolve = function (p, rad) {
    if (S.zone === 'plaza') { city.resolve(p, rad); resolveCols(pgCols, p, rad); return; }
    const Q = zones[S.zone], q = { x: p.x - Q.z.ox, z: p.z - Q.z.oz };
    resolveCols(Q.cols, q, rad); if (Q.walk) Q.walk(q); p.x = q.x + Q.z.ox; p.z = q.z + Q.z.oz;
  };
  S.camBlocked = (x, y, z) => { const Q = zones[S.zone]; if (!Q) return false; const ox = Q.z.ox, oz = Q.z.oz; for (const t of Q.canopies) { const dx = x - ox - t[0], dz = z - oz - t[1], dy = y - 4.3 * t[2], r = 2.9 * t[2]; if (dx * dx + dz * dz + dy * dy < r * r) return true; } return false; };
  S.camLine = (tx, ty, tz, cx, cy, cz) => { for (let i = 1; i <= 8; i++) { const u = i / 9; if (S.camBlocked(tx + (cx - tx) * u, ty + (cy - ty) * u, tz + (cz - tz) * u)) return true; } return false; };
  S.benches = () => S.zone === 'plaza' ? city.benches : zones[S.zone].benches;
  S.trees = () => S.zone === 'plaza' ? city.trees : zones[S.zone].trees.map(t => [t[0] + Z[S.zone].ox, t[1] + Z[S.zone].oz, t[2]]);
  S.gates = () => {
    if (S.zone === 'plaza') return ZN.PLAZA_GATES.map(g => ({ to: g.to, x: g.x, z: g.z, name: Z[g.to].emoji + ' ' + Z[g.to].name }));
    const z = Z[S.zone]; return [{ to: 'plaza', x: z.gate[0] + z.ox, z: z.gate[1] + z.oz, name: '🌿 광장' }];
  };
  const cp = new THREE.Vector3();
  S.update = function (dt, T, camPos) {
    if (S.zone === 'plaza') { for (const k in pgObjs) pgObjs[k].update(dt, T); return; }
    const Q = zones[S.zone]; Q.upd.forEach(f => f(dt, T, camPos));
  };
  S.setZone('plaza');
  return S;
}
global.buildSpaces = buildSpaces;
})(window);
