/* Healing Lounge — 드라이빙 코스 (순환형)
   입구 대로(45°) → 분기점 → 왼쪽 500m / 가운데 5km / 오른쪽 10km 순환, 각각 다른 횡단보도(315°·225°·135°)로 복귀.
   길 데이터는 cars.js의 NET(서버와 공용). 경관은 화면에 보이는 거리만 그때그때 배치(스트리밍)해서 10km여도 가벼워요. */
window.COURSE = (function () {
  'use strict';
  let api = { info: null, update() {} };

  function build(THREE, scene, city) {
    const CA = window.CARS, NET = CA.NET, toon = city.toon;
    const asphalt = toon('#6b6877'), verge = toon('#cdb9a4'), dashM = toon('#f3dca2'), grayM = toon('#8d8a99');
    const unit = new THREE.BoxGeometry(1, 1, 1);
    const OLD = 316;                                           // 기존 대로가 이미 깔려 있는 거리(광장 중심에서)

    /* ── 경로 도우미: 구간 길이 · s(길이)로 위치/방향 ── */
    const R = NET.ROUTES;
    R.forEach(r => { r.cum = [0]; for (let i = 0; i + 1 < r.pts.length; i++) r.cum.push(r.cum[i] + Math.hypot(r.pts[i + 1][0] - r.pts[i][0], r.pts[i + 1][1] - r.pts[i][1])); });
    function pt(r, s) {                                        // [x, z, 진행방향 tx, tz]
      s = Math.max(0, Math.min(r.total, s)); let i = 0; while (i + 2 < r.cum.length && r.cum[i + 1] < s) i++;
      const a = r.pts[i], b = r.pts[i + 1], L = r.cum[i + 1] - r.cum[i] || 1, k = (s - r.cum[i]) / L, tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L;
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, tx, tz];
    }
    const kmTxt = m => (m >= 1000 ? (+(m / 1000).toFixed(1)) + ' km' : Math.round(m) + ' m');

    /* ── 글자판 ── */
    function boardTex(lines, bg, fg, w, h) {
      const c = document.createElement('canvas'); c.width = w || 512; c.height = h || 256; const g = c.getContext('2d');
      g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
      g.strokeStyle = '#ffffff'; g.lineWidth = 10; g.strokeRect(10, 10, c.width - 20, c.height - 20);
      g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
      const n = lines.length, lh = (c.height - 40) / n;
      lines.forEach((ln, i) => { const sz = Math.min(lh * 0.78, (c.width - 60) / Math.max(4, ln.length) * 1.55); g.font = '800 ' + Math.floor(sz) + 'px system-ui,"Malgun Gothic","Apple SD Gothic Neo",sans-serif'; g.fillText(ln, c.width / 2, 20 + lh * (i + 0.5)); });
      const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
    }
    const bmat = tex => new THREE.MeshBasicMaterial({ map: tex, fog: true });
    /* 위치 (x,z), 진행방향 (tx,tz) 기준의 표지판 그룹: 로컬 +z = 진행방향, +x = 왼쪽 */
    function mkGroup(x, z, tx, tz) { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = Math.atan2(tx, tz); scene.add(g); return g; }
    function board(g, lx, y, w, h, front, back, bgF, bgB, depth) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(w, h), bmat(boardTex(front, bgF, '#fff', w > 8 ? 1024 : 512, w > 8 ? 256 : 256))); f.position.set(lx, y, -(depth || 0.06)); f.rotation.y = Math.PI; g.add(f);
      const b = new THREE.Mesh(new THREE.PlaneGeometry(w, h), bmat(boardTex(back, bgB, '#fff', w > 8 ? 1024 : 512, 256))); b.position.set(lx, y, depth || 0.06); g.add(b);
    }
    function post(g, lx, bw, bh, front, back, bgF, high) {
      const H = high || 3.6, pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, H, 6), grayM); pole.position.set(lx, H / 2, 0); g.add(pole);
      board(g, lx, H + bh / 2 - 0.2, bw, bh, front, back, bgF || '#2f6b4f', '#2f6b4f');
    }
    function gantryFrame(g, half) {
      [-1, 1].forEach(s => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 7, 8), grayM); p.position.set(s * half, 3.5, 0); g.add(p); });
      const beam = new THREE.Mesh(unit, grayM); beam.scale.set(half * 2 + 0.4, 0.5, 0.5); beam.position.set(0, 7, 0); g.add(beam);
    }

    /* ── 도로 그리기 (기존 대로 구간은 건너뛰고 316m부터) ── */
    const verges = [], asphaltPts = [], dashList = [];
    function drawPoly(pts) {
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); if (L < 0.5) continue;
        const mk = (w, mat, y) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, L), mat); m.rotation.x = -Math.PI / 2; const g = new THREE.Group(); g.position.set((a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2); g.rotation.y = Math.atan2(dx, dz); g.add(m); scene.add(g); };
        mk(27, verge, 0.05); mk(17, asphalt, 0.075);
        const nd = Math.floor((L - 24) / 8);
        for (let k = 0; k < nd; k++) { const s = 12 + k * 8 + 3; dashList.push([a[0] + dx / L * s, a[1] + dz / L * s, Math.atan2(dx, dz)]); }
      }
      pts.forEach(p => {
        const c1 = new THREE.Mesh(new THREE.CircleGeometry(13.5, 20), verge); c1.rotation.x = -Math.PI / 2; c1.position.set(p[0], 0.05, p[1]); scene.add(c1);
        const c2 = new THREE.Mesh(new THREE.CircleGeometry(8.5, 20), asphalt); c2.rotation.x = -Math.PI / 2; c2.position.set(p[0], 0.075, p[1]); scene.add(c2);
      });
    }
    /* 각 코스에서 기존 대로(중심에서 316m 안쪽) 부분을 빼고 그려요 */
    function trim(pts) {
      const out = [], r = p => Math.hypot(p[0], p[1]);
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), cross = a[0] * (b[1] - a[1]) - a[1] * (b[0] - a[0]);
        out.push({ a, b, axis: Math.abs(cross) < 1e-3 * (r(a) * L + 1), ra: r(a), rb: r(b) });
      }
      return out;
    }
    R.forEach(rt => {
      let cur = null; const flush = () => { if (cur && cur.length > 1) drawPoly(cur); cur = null; };
      trim(rt.pts).forEach(sg => {
        let { a, b } = sg; const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (sg.axis && Math.max(sg.ra, sg.rb) <= OLD) { flush(); return; }                         // 전부 기존 대로 안쪽
        if (sg.axis && Math.min(sg.ra, sg.rb) < OLD) {                                              // 일부만 겹침: 316m 지점부터
          const k = (OLD - sg.ra) / (sg.rb - sg.ra); const cut = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
          if (sg.ra < sg.rb) { flush(); cur = [cut, b]; } else { drawPoly([a, cut]); flush(); }
          return;
        }
        if (!cur) cur = [a]; cur.push(b);
      });
      flush();
    });
    { const dash = new THREE.InstancedMesh(unit, dashM, Math.max(1, dashList.length)), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pv = new THREE.Vector3(), sc = new THREE.Vector3(0.22, 0.02, 3.2);
      dashList.forEach((d, i) => { q.setFromAxisAngle(up, d[2]); pv.set(d[0], 0.095, d[1]); m4.compose(pv, q, sc); dash.setMatrixAt(i, m4); }); dash.frustumCulled = false; scene.add(dash); }

    /* ── 표지판 ── */
    const rA = R[1], rL = R[0], rR = R[2];
    const forkS = NET.RF - NET.MOUTH;                           // 입구 대로에서 분기점까지의 길이
    /* 코스 입구 + 분기점 */
    { const p = pt(rA, 110 - NET.MOUTH + 0); const g = mkGroup(p[0], p[1], p[2], p[3]); gantryFrame(g, 10.4);
      board(g, 0, 8.9, 15, 3.6, ['🏁 DRIVING COURSE', '← 500 m · ↑ 5 km · → 10 km'], ['🌿 Healing Plaza', 'Bye~'], '#1f5fa8', '#2f6b4f', 0.3); }
    { const p = pt(rA, forkS - 130); const g = mkGroup(p[0], p[1], p[2], p[3]); post(g, -10.8, 5.2, 2.6, ['FORK 130 m', '← 500m  ↑ 5km  → 10km'], ['🌿 Plaza', '↩'], '#2a8a5a'); post(g, 10.8, 5.2, 2.6, ['FORK 130 m', '← 500m  ↑ 5km  → 10km'], ['🌿 Plaza', '↩'], '#2a8a5a'); }
    { const p = pt(rA, forkS - 20); const g = mkGroup(p[0], p[1], p[2], p[3]); gantryFrame(g, 10.4);
      board(g, 5.4, 8.7, 4.8, 3.2, ['← 500 m', 'LOOP'], ['🌿 Plaza', 'Back'], '#e8793a', '#2f6b4f', 0.3);
      board(g, 0, 8.7, 4.8, 3.2, ['↑ 5 km', 'LOOP'], ['🌿 Plaza', 'Back'], '#1f5fa8', '#2f6b4f', 0.3);
      board(g, -5.4, 8.7, 4.8, 3.2, ['10 km →', 'LOOP'], ['🌿 Plaza', 'Back'], '#b5342a', '#2f6b4f', 0.3); }
    /* 거리 표지판 (남은 거리 · 복귀 안내) */
    R.forEach(rt => {
      const step = rt.len >= 10000 ? 1000 : rt.len >= 5000 ? 500 : 100;
      for (let m = step; m < rt.len; m += step) {
        const s = m - rt.off; if (s <= 6 || s >= rt.total - 6) continue; const p = pt(rt, s), g = mkGroup(p[0], p[1], p[2], p[3]);
        post(g, -10.6, 4.2, 2.1, [kmTxt(m), kmTxt(rt.len - m) + ' to go'], ['🌿 Plaza', kmTxt(m)], '#2f6b4f', 3.6);
      }
      /* 복귀 안내: 횡단보도가 가까워지면 */
      const sBack = rt.total - 160, p2 = pt(rt, sBack), g2 = mkGroup(p2[0], p2[1], p2[2], p2[3]);
      post(g2, -10.6, 4.4, 2.2, ['🌿 Plaza', '160 m'], ['LOOP', kmTxt(rt.len)], '#1f5fa8', 3.8);
      const p3 = pt(rt, rt.total - 27), g3 = mkGroup(p3[0], p3[1], p3[2], p3[3]); gantryFrame(g3, 10.4);
      board(g3, 0, 8.9, 14, 3.4, ['🌿 Welcome back!', kmTxt(rt.len) + ' LOOP done'], ['🏁 DRIVING COURSE', kmTxt(rt.len) + ' LOOP'], '#2f6b4f', '#1f5fa8', 0.3);
    });

    /* ── 땅: 카메라를 따라다니는 큰 잔디 원 ── */
    const TILE = 880 / 56;
    const gnd = new THREE.Mesh(new THREE.CircleGeometry(330, 48), toon('#86c566', { map: city.groundTexR(42) })); gnd.rotation.x = -Math.PI / 2; gnd.position.y = -0.04; gnd.visible = false; scene.add(gnd);

    /* ── 경관 스트리밍 ── */
    const GL = THREE.GLTFLoader ? new THREE.GLTFLoader() : null, loader = new THREE.TextureLoader(), texC = {};
    const getTex = n => texC[n] || (texC[n] = loader.load('/models/' + n + '.png', t => { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; }));
    let curKey = '';
    const inst = {}, lists = {};
    function reg(name, cap) { inst[name] = { parts: [], cap }; lists[name] = []; }
    const NAT = { CommonTree_1: 110, CommonTree_2: 110, CommonTree_3: 110, Pine_1: 130, Pine_2: 130, Pine_3: 130, Bush_Common: 110, Bush_Common_Flowers: 110, Flower_3_Group: 110, Flower_4_Group: 110, Grass_Common_Tall: 130, Rock_Medium_1: 60, Rock_Medium_2: 60, Fern_1: 90 };
    Object.keys(NAT).forEach(n => reg(n, NAT[n]));
    function loadNat(name) {
      if (!GL) return;
      GL.load('/models/nature/' + name + '.gltf', gl => {
        gl.scene.updateMatrixWorld(true);
        gl.scene.traverse(o => {
          if (!o.isMesh) return;
          const geo = o.geometry.clone(); geo.applyMatrix4(o.matrixWorld); const src = o.material, cut = src.alphaTest > 0;
          const mat = toon({ map: src.map || null, color: '#ffffff', side: THREE.DoubleSide, alphaTest: cut ? 0.5 : 0 }); mat.userData.noOutline = true;
          const im = new THREE.InstancedMesh(geo, mat, inst[name].cap); im.count = 0; im.frustumCulled = false; scene.add(im); inst[name].parts.push(im); curKey = '';
        });
      }, undefined, () => {});
    }
    Object.keys(NAT).forEach(loadNat);
    const TOWN = [['House', 7, 'HouseTexture1'], ['House2', 7.5, 'HouseTexture2'], ['House3', 6.5, 'HouseTexture3'], ['House4', 6.5, 'HouseTexture4'], ['House5', 6.5, 'HouseTexture1'], ['Flat', 4.6, 'Hotel'], ['Flat2', 4.6, 'Shop'], ['Shop', 5, 'Shop']];
    ['1Story', '1Story_GableRoof', '1Story_RoundRoof', '2Story', '2Story_2', '2Story_Balcony', '2Story_GableRoof', '2Story_Wide', '3Story_Small', '3Story_Balcony', '4Story'].forEach((n, i) => TOWN.push(['b2/' + n, 4.5, 'b2/Texture_' + ['Red', 'Yellow', 'Light', 'Blue', 'Grey'][i % 5]]));
    TOWN.forEach((tw, i) => reg('H' + i, 40));
    function parseOBJ(txt) {
      const v = [], vt = [], vn = [], pos = [], uv = [], nor = [];
      txt.split('\n').forEach(l => {
        const s = l.trim().split(/\s+/), k = s[0];
        if (k === 'v') v.push([+s[1], +s[2], +s[3]]); else if (k === 'vt') vt.push([+s[1], +s[2]]); else if (k === 'vn') vn.push([+s[1], +s[2], +s[3]]);
        else if (k === 'f') { const cc = s.slice(1).map(q => { const a = q.split('/'); return [+a[0] - 1, a[1] ? +a[1] - 1 : -1, a[2] ? +a[2] - 1 : -1]; });
          for (let i = 1; i < cc.length - 1; i++) [cc[0], cc[i], cc[i + 1]].forEach(q => { pos.push.apply(pos, v[q[0]]); if (q[1] >= 0) uv.push(vt[q[1]][0], vt[q[1]][1]); else uv.push(0.5, 0.5); if (q[2] >= 0) nor.push.apply(nor, vn[q[2]]); else nor.push(0, 1, 0); }); }
      });
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); return g;
    }
    TOWN.forEach((tw, i) => fetch('/models/' + tw[0] + '.obj').then(r => r.text()).then(txt => {
      const mat = toon({ map: getTex(tw[2]) }), im = new THREE.InstancedMesh(parseOBJ(txt), mat, inst['H' + i].cap); im.count = 0; im.frustumCulled = false; scene.add(im); inst['H' + i].parts.push(im); curKey = '';
    }).catch(() => {}));
    reg('lampPole', 200); reg('lampHead', 200);
    { const a = new THREE.InstancedMesh(unit, grayM, 200), b = new THREE.InstancedMesh(unit, new THREE.MeshBasicMaterial({ color: '#ffe2a8', fog: true }), 200); a.count = b.count = 0; a.frustumCulled = b.frustumCulled = false; scene.add(a); scene.add(b); inst.lampPole.parts.push(a); inst.lampHead.parts.push(b); }

    function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    const CH = 100;
    const theme = (rt, s) => { if (rt.len < 1000) return 'town'; const k = Math.min(3, Math.floor((s + rt.off) / rt.len * 4)); return ['town', 'forest', 'meadow', 'pine'][k]; };
    function gen(ri, ci) {
      const rt = R[ri], r = rng((ri + 1) * 7919 + ci * 104729 + 17), s0 = ci * CH;
      if (s0 >= rt.total || s0 + CH <= 0) return;
      const th = theme(rt, s0 + 50);
      const put = (name, s, lat, y, sc, minD, ry) => {
        if (!lists[name]) return; const p = pt(rt, s), lx = p[3], lz = -p[2], x = p[0] + lx * lat, z = p[1] + lz * lat;
        if (Math.hypot(x, z) < 330) return;                                   // 도시 쪽은 기존 건물이 있어요
        if (CA.nearNet(x, z)[0] < minD) return;                                // 다른 길 위에는 두지 않아요
        lists[name].push([x, y, z, ry == null ? r() * 6.283 : ry, sc]);
      };
      const tr = ['CommonTree_1', 'CommonTree_2', 'CommonTree_3'], pn = ['Pine_1', 'Pine_2', 'Pine_3'];
      const nTree = th === 'town' ? 8 : th === 'forest' ? 24 : th === 'meadow' ? 7 : 18;
      for (let i = 0; i < nTree; i++) { const s = s0 + r() * CH, side = r() < 0.5 ? -1 : 1, lat = side * (r() < 0.6 ? 15 + r() * 12 : 42 + r() * 48); put(th === 'pine' || (th === 'forest' && r() < 0.6) ? pn[Math.floor(r() * 3)] : tr[Math.floor(r() * 3)], s, lat, 0, 1.2 + r() * 0.7, 14); }
      const nSmall = th === 'meadow' ? 26 : 14;
      for (let i = 0; i < nSmall; i++) { const s = s0 + r() * CH, side = r() < 0.5 ? -1 : 1, lat = side * (14.5 + r() * 16), k = r();
        put(k < 0.22 ? 'Bush_Common' : k < 0.4 ? 'Bush_Common_Flowers' : k < 0.58 ? 'Flower_3_Group' : k < 0.72 ? 'Flower_4_Group' : k < 0.88 ? 'Grass_Common_Tall' : th === 'pine' ? 'Rock_Medium_1' : 'Fern_1', s, lat, 0.03, 0.9 + r() * 0.6, 14); }
      if (th === 'pine' || th === 'meadow') for (let i = 0; i < 3; i++) put(r() < 0.5 ? 'Rock_Medium_1' : 'Rock_Medium_2', s0 + r() * CH, (r() < 0.5 ? -1 : 1) * (15 + r() * 20), 0, 0.8 + r() * 0.8, 14);
      const pHouse = th === 'town' ? 0.85 : th === 'meadow' ? 0.18 : th === 'forest' ? 0.12 : 0.1;
      for (let side = -1; side <= 1; side += 2) for (let k = 0; k < 3; k++) {
        if (r() > pHouse) continue; const s = s0 + k * 33 + 6 + r() * 14, lat = side * (30 + r() * 7), ti = Math.floor(r() * TOWN.length), p = pt(rt, s);
        const dirx = -side * p[3], dirz = side * p[2];                          // 길 쪽을 바라보게
        put('H' + ti, s, lat, 0.02, TOWN[ti][1], 24, Math.atan2(dirx, dirz) + (r() - 0.5) * 0.1);
      }
      for (let k = 0; k < 3; k++) { const s = s0 + 10 + k * 36, side = (ci + k) % 2 ? 1 : -1, p = pt(rt, s), x = p[0] + p[3] * side * 12.4, z = p[1] - p[2] * side * 12.4;
        if (Math.hypot(x, z) < 330 || CA.nearNet(x, z)[0] < 11.5) continue; lists.lampPole.push([x, 2.1, z, 0, 0]); lists.lampHead.push([x, 4.4, z, 0, 0]); }
    }
    const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pv = new THREE.Vector3(), sv = new THREE.Vector3();
    function flush() {
      Object.keys(inst).forEach(k => {
        const L = lists[k], I = inst[k];
        I.parts.forEach(im => {
          const n = Math.min(L.length, I.cap);
          for (let i = 0; i < n; i++) {
            const a = L[i];
            if (k === 'lampPole') sv.set(0.14, 4.2, 0.14); else if (k === 'lampHead') sv.set(0.5, 0.4, 0.5); else sv.set(a[4], a[4], a[4]);
            qq.setFromAxisAngle(up, a[3]); pv.set(a[0], a[1], a[2]); m4.compose(pv, qq, sv); im.setMatrixAt(i, m4);
          }
          im.count = n; im.instanceMatrix.needsUpdate = true;
        });
        L.length = 0;
      });
    }
    function progress(x, z) {                                   // 가장 가까운 코스와 그 위 진행 거리
      let best = null;
      R.forEach((rt, ri) => { let bd = 1e18, bs = 0;
        for (let i = 0; i + 1 < rt.pts.length; i++) { const a = rt.pts[i], b = rt.pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz; let t = ((x - a[0]) * dx + (z - a[1]) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t; const d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); if (d < bd) { bd = d; bs = rt.cum[i] + Math.sqrt(L2) * t; } }
        if (!best || bd < best.d - 0.01) best = { ri, d: bd, s: bs }; });
      return best;
    }
    api.update = function (cam) {
      const x = cam.x, z = cam.z, r = Math.hypot(x, z);
      gnd.visible = r > 130; if (gnd.visible) { gnd.position.x = Math.round(x / TILE) * TILE; gnd.position.z = Math.round(z / TILE) * TILE; }
      const pr = r > 150 ? progress(x, z) : null;
      if (pr && pr.d < 40) {
        const rt = R[pr.ri];
        if (pr.ri === 1 && pr.s < forkS && r < NET.RF + 5) api.info = { txt: '🔀 FORK ' + Math.max(0, Math.round(forkS - pr.s)) + ' m  ← 500m · ↑ 5km · → 10km' };
        else { const p = pr.s + rt.off; api.info = { txt: '🏁 ' + kmTxt(rt.len) + ' LOOP · ' + (rt.len >= 1000 ? (p / 1000).toFixed(2) : Math.round(p)) + ' / ' + kmTxt(rt.len) }; }
      } else api.info = null;
      const key = Math.floor(x / 40) + ':' + Math.floor(z / 40);
      if (key === curKey) return; curKey = key;
      if (r < 250 && !pr) { Object.keys(inst).forEach(k => inst[k].parts.forEach(im => { im.count = 0; })); return; }
      R.forEach((rt, ri) => { for (let ci = 0; ci * CH < rt.total; ci++) { const m = pt(rt, ci * CH + CH / 2); if (Math.hypot(m[0] - x, m[1] - z) < 420) gen(ri, ci); } });
      flush();
    };
  }
  return { build, get info() { return api.info; }, update(cam) { api.update(cam); } };
})();
