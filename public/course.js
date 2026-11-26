/* Healing Lounge — 드라이빙 코스
   광장에서 뻗은 대로를 길게 이어 붙이고, 표지판 · 유턴 구간 · 길가 경관(건물·나무·가로등)을 만들어요.
   경관은 화면에 보이는 거리(약 340m)만 그때그때 다시 배치(스트리밍)해서 10km여도 가벼워요. */
window.COURSE = (function () {
  'use strict';
  const D2R = Math.PI / 180, TILE = 880 / 56;
  let api = { info: null, update() {} };

  function build(THREE, scene, city) {
    const CA = window.CARS, toon = city.toon;
    const asphalt = toon('#6b6877'), walkM = toon('#cdb9a4'), dashM = toon('#f3dca2'), grayM = toon('#8d8a99'), stripeR = toon('#e8564a'), stripeW = toon('#f5efe6');
    const unit = new THREE.BoxGeometry(1, 1, 1);
    const ang = d => Math.atan2(Math.cos(d * D2R), Math.sin(d * D2R));
    const ux = d => Math.cos(d * D2R), uz = d => Math.sin(d * D2R);

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
    /* 길가 표지판: 앞면(바깥으로 가는 차가 봄) · 뒷면(돌아오는 차가 봄) */
    function sign(g, t, lat, front, back, bw, bh, bg, fg, high) {
      const H = high || 3.6, pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, H, 6), grayM); pole.position.set(lat, H / 2, t); g.add(pole);
      const f = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), bmat(boardTex(front, bg, fg))); f.position.set(lat, H + bh / 2 - 0.2, t - 0.06); f.rotation.y = Math.PI; g.add(f);
      const b = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), bmat(boardTex(back, '#2f6b4f', '#ffffff'))); b.position.set(lat, H + bh / 2 - 0.2, t + 0.06); g.add(b);
    }
    function gantry(g, t, front, back) {
      [-1, 1].forEach(s => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 7, 8), grayM); p.position.set(s * 10.4, 3.5, t); g.add(p); });
      const beam = new THREE.Mesh(unit, grayM); beam.scale.set(21, 0.5, 0.5); beam.position.set(0, 7, t); g.add(beam);
      const f = new THREE.Mesh(new THREE.PlaneGeometry(15, 3.6), bmat(boardTex(front, '#1f5fa8', '#ffffff', 1024, 256))); f.position.set(0, 8.9, t - 0.3); f.rotation.y = Math.PI; g.add(f);
      const b = new THREE.Mesh(new THREE.PlaneGeometry(15, 3.6), bmat(boardTex(back, '#2f6b4f', '#ffffff', 1024, 256))); b.position.set(0, 8.9, t + 0.3); g.add(b);
    }
    const kmTxt = m => (m % 1000 === 0 ? (m / 1000) + ' km' : m >= 1000 ? (m / 1000).toFixed(1) + ' km' : m + ' m');

    /* ── 코스별 도로 · 유턴 구간 · 표지판 ── */
    CA.AVD.forEach(d => {
      const c = CA.COURSES[d]; if (c.len <= 300) return;
      const g = new THREE.Group(); g.rotation.y = ang(d); scene.add(g);
      const tmax = CA.tMax(c), t0 = 314, t1 = tmax + 14, L = t1 - t0;
      const road = new THREE.Mesh(new THREE.PlaneGeometry(17, L), asphalt); road.rotation.x = -Math.PI / 2; road.position.set(0, 0.06, t0 + L / 2); g.add(road);
      [-1, 1].forEach(s => { const sw = new THREE.Mesh(new THREE.PlaneGeometry(5, L), walkM); sw.rotation.x = -Math.PI / 2; sw.position.set(s * 11, 0.07, t0 + L / 2); g.add(sw); });
      const nd = Math.floor((tmax - 316) / 8), dash = new THREE.InstancedMesh(unit, dashM, nd), m4 = new THREE.Matrix4(), sc = new THREE.Vector3(0.22, 0.02, 3.2), q0 = new THREE.Quaternion();
      for (let i = 0; i < nd; i++) { m4.compose(new THREE.Vector3(0, 0.09, 316 + i * 8), q0, sc); dash.setMatrixAt(i, m4); }
      dash.frustumCulled = false; g.add(dash);
      /* 유턴 구간(넓은 포장) */
      c.uts.forEach(u => {
        const sh = new THREE.Shape(), HW = 8.5 + CA.BAY_X, pts = [[-8.5, u - 30], [-HW, u - 20], [-HW, u + 20], [-8.5, u + 30], [8.5, u + 30], [HW, u + 20], [HW, u - 20], [8.5, u - 30]];
        pts.forEach((p, i) => i ? sh.lineTo(p[0], -p[1]) : sh.moveTo(p[0], -p[1])); sh.closePath();
        const bay = new THREE.Mesh(new THREE.ShapeGeometry(sh), asphalt); bay.rotation.x = -Math.PI / 2; bay.position.y = 0.08; g.add(bay);
        const ar = document.createElement('canvas'); ar.width = 256; ar.height = 256; const x = ar.getContext('2d');
        x.strokeStyle = '#f5efe6'; x.lineWidth = 22; x.lineCap = 'round'; x.lineJoin = 'round'; x.beginPath(); x.moveTo(70, 235); x.lineTo(70, 100); x.arc(128, 100, 58, Math.PI, 0); x.lineTo(186, 190); x.stroke();
        x.fillStyle = '#f5efe6'; x.beginPath(); x.moveTo(186, 235); x.lineTo(150, 185); x.lineTo(222, 185); x.closePath(); x.fill();
        const arr = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(ar), transparent: true, fog: true, depthWrite: false })); arr.rotation.set(-Math.PI / 2, 0, Math.PI); arr.position.set(0, 0.1, u); g.add(arr);
        const end = u === c.len;
        sign(g, u - 24, 10.6, [end ? '🏁 END' : '↩ U-TURN', kmTxt(u)], ['🌿 Plaza', kmTxt(u)], 4.2, 2.2, end ? '#b5342a' : '#1f5fa8', '#fff', 3.8);
        sign(g, u - 24, -10.6, [end ? '🏁 END' : '↩ U-TURN', kmTxt(u)], ['🌿 Plaza', kmTxt(u)], 4.2, 2.2, end ? '#b5342a' : '#1f5fa8', '#fff', 3.8);
        /* 유턴 예고 표지판 */
        const adv = c.len >= 5000 ? 500 : 100;
        if (u - adv - 30 > 330) sign(g, u - 30 - adv, 10.6, ['↩ U-TURN', adv + ' m'], ['🌿 Plaza', kmTxt(u - 30 - adv)], 4.2, 2.2, '#2a8a5a', '#fff', 3.8);
        if (end) { // 막다른 끝: 줄무늬 차단봉
          for (let i = -8; i <= 8; i++) { const b = new THREE.Mesh(unit, i % 2 ? stripeR : stripeW); b.scale.set(2.2, 1.1, 0.5); b.position.set(i * 2.2, 0.55, u + 32); g.add(b); }
          sign(g, u + 30, 0, ['🏁 END', 'U-TURN ↩'], ['🌿 Plaza', kmTxt(u)], 7, 2.6, '#b5342a', '#fff', 2.6);
        }
      });
      /* 거리 표지판 */
      const step = c.len >= 5000 ? 1000 : 100;
      for (let m = step; m < c.len; m += step) { if (c.uts.indexOf(m) >= 0) continue; sign(g, m, 10.6, [kmTxt(m), '🏁 ' + kmTxt(c.len)], ['🌿 Plaza', kmTxt(m)], 4, 2.1, '#2f6b4f', '#fff', 3.6); }
      /* 코스 입구 문 */
      gantry(g, 110, ['🏁 DRIVING COURSE ' + kmTxt(c.len), 'U-TURN  ' + c.uts.map(u => kmTxt(u).replace(' km', '').replace(' m', 'm')).join(' · ')], ['🌿 Healing Plaza', '→ Plaza']);
    });

    /* ── 땅: 카메라를 따라다니는 큰 잔디 원 (멀리서도 허공이 안 보이게) ── */
    const gnd = new THREE.Mesh(new THREE.CircleGeometry(330, 48), toon('#86c566', { map: city.groundTexR(42) })); gnd.rotation.x = -Math.PI / 2; gnd.position.y = -0.04; gnd.visible = false; gnd.receiveShadow = false; scene.add(gnd);

    /* ── 경관 스트리밍 ── */
    const GL = THREE.GLTFLoader ? new THREE.GLTFLoader() : null, loader = new THREE.TextureLoader(), texC = {};
    const getTex = n => texC[n] || (texC[n] = loader.load('/models/' + n + '.png', t => { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; }));
    let curKey = '';
    const inst = {}, lists = {};
    function reg(name, cap) { inst[name] = { parts: [], cap }; lists[name] = []; }
    const NAT = { CommonTree_1: 70, CommonTree_2: 70, CommonTree_3: 70, Pine_1: 90, Pine_2: 90, Pine_3: 90, Bush_Common: 70, Bush_Common_Flowers: 70, Flower_3_Group: 70, Flower_4_Group: 70, Grass_Common_Tall: 90, Rock_Medium_1: 40, Rock_Medium_2: 40, Fern_1: 60 };
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
    /* 집 (동네 집 모델 재사용) */
    const TOWN = [['House', 7, 'HouseTexture1'], ['House2', 7.5, 'HouseTexture2'], ['House3', 6.5, 'HouseTexture3'], ['House4', 6.5, 'HouseTexture4'], ['House5', 6.5, 'HouseTexture1'], ['Flat', 4.6, 'Hotel'], ['Flat2', 4.6, 'Shop'], ['Shop', 5, 'Shop']];
    ['1Story', '1Story_GableRoof', '1Story_RoundRoof', '2Story', '2Story_2', '2Story_Balcony', '2Story_GableRoof', '2Story_Wide', '3Story_Small', '3Story_Balcony', '4Story'].forEach((n, i) => TOWN.push(['b2/' + n, 4.5, 'b2/Texture_' + ['Red', 'Yellow', 'Light', 'Blue', 'Grey'][i % 5]]));
    TOWN.forEach((tw, i) => reg('H' + i, 26));
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
    /* 가로등 */
    reg('lampPole', 120); reg('lampHead', 120);
    { const a = new THREE.InstancedMesh(unit, grayM, 120), b = new THREE.InstancedMesh(unit, new THREE.MeshBasicMaterial({ color: '#ffe2a8', fog: true }), 120); a.count = b.count = 0; a.frustumCulled = b.frustumCulled = false; scene.add(a); scene.add(b); inst.lampPole.parts.push(a); inst.lampHead.parts.push(b); }

    function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    const CH = 100;
    function theme(c, t) { if (c.len < 5000) return 'town'; const k = t / 1000; return k < 2.5 ? 'town' : k < 5 ? 'forest' : k < 7.5 ? 'meadow' : 'pine'; }
    function gen(d, ci) {
      const c = CA.COURSES[d], r = rng(d * 7919 + ci * 104729 + 17), ex = ux(d), ez = uz(d), nx = -ez, nz = ex, t0 = ci * CH;
      if (t0 + CH < 330 || t0 > CA.tMax(c) + 90) return;
      const th = theme(c, t0 + 50), W = (t, lat) => [ex * t + nx * lat, ez * t + nz * lat];
      const put = (name, t, lat, y, s, ry) => { if (!lists[name]) return; const p = W(t, lat); lists[name].push([p[0], y, p[1], ry == null ? r() * 6.283 : ry, s]); };
      const tr = ['CommonTree_1', 'CommonTree_2', 'CommonTree_3'], pn = ['Pine_1', 'Pine_2', 'Pine_3'];
      const nTree = th === 'town' ? 8 : th === 'forest' ? 24 : th === 'meadow' ? 7 : 18;
      for (let i = 0; i < nTree; i++) { const t = t0 + r() * CH, side = r() < 0.5 ? -1 : 1, lat = side * (r() < 0.6 ? 15 + r() * 12 : 42 + r() * 48); put(th === 'pine' || (th === 'forest' && r() < 0.6) ? pn[Math.floor(r() * 3)] : tr[Math.floor(r() * 3)], t, lat, 0, 1.2 + r() * 0.7); }
      const nSmall = th === 'meadow' ? 26 : 14;
      for (let i = 0; i < nSmall; i++) { const t = t0 + r() * CH, side = r() < 0.5 ? -1 : 1, lat = side * (14 + r() * 16), k = r();
        put(k < 0.22 ? 'Bush_Common' : k < 0.4 ? 'Bush_Common_Flowers' : k < 0.58 ? 'Flower_3_Group' : k < 0.72 ? 'Flower_4_Group' : k < 0.88 ? 'Grass_Common_Tall' : th === 'pine' ? 'Rock_Medium_1' : 'Fern_1', t, lat, 0.03, 0.9 + r() * 0.6); }
      if (th === 'pine' || th === 'meadow') for (let i = 0; i < 3; i++) put(r() < 0.5 ? 'Rock_Medium_1' : 'Rock_Medium_2', t0 + r() * CH, (r() < 0.5 ? -1 : 1) * (15 + r() * 20), 0, 0.8 + r() * 0.8);
      const pHouse = th === 'town' ? 0.85 : th === 'meadow' ? 0.18 : th === 'forest' ? 0.12 : 0.1;
      for (let side = -1; side <= 1; side += 2) for (let k = 0; k < 3; k++) {
        if (r() > pHouse) continue; const t = t0 + k * 33 + 6 + r() * 14, lat = side * (30 + r() * 7), ti = Math.floor(r() * TOWN.length), dir = [-side * nx, -side * nz];
        const p = W(t, lat); lists['H' + ti].push([p[0], 0.02, p[1], Math.atan2(dir[0], dir[1]) + (r() - 0.5) * 0.1, TOWN[ti][1]]);
      }
      for (let k = 0; k < 3; k++) { const t = t0 + 10 + k * 36, side = (ci + k) % 2 ? 1 : -1, p = W(t, side * 12.4); lists.lampPole.push([p[0], 2.1, p[1], 0, 0]); lists.lampHead.push([p[0], 4.4, p[1], 0, 0]); }
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
    api.update = function (cam) {
      const x = cam.x, z = cam.z, r = Math.hypot(x, z);
      gnd.visible = r > 130; if (gnd.visible) { gnd.position.x = Math.round(x / TILE) * TILE; gnd.position.z = Math.round(z / TILE) * TILE; }
      /* 어느 코스 위에 있나 */
      let best = null;
      if (r > 150) CA.AVD.forEach(d => { const c = CA.COURSES[d], t = x * ux(d) + z * uz(d), lat = -x * uz(d) + z * ux(d); if (t > 150 && t < CA.tMax(c) + 120 && Math.abs(lat) < 120 && (!best || Math.abs(lat) < Math.abs(best.lat))) best = { d, t, lat, len: c.len }; });
      api.info = best;
      if (!best || best.len <= 300) { if (curKey) { curKey = ''; Object.keys(inst).forEach(k => inst[k].parts.forEach(im => { im.count = 0; })); } return; }
      const c0 = Math.floor((best.t - 360) / CH), c1 = Math.floor((best.t + 360) / CH), key = best.d + ':' + c0;
      if (key === curKey) return; curKey = key;
      for (let ci = c0; ci <= c1; ci++) gen(best.d, ci);
      flush();
    };
  }
  return { build, get info() { return api.info; }, update(cam) { api.update(cam); } };
})();
