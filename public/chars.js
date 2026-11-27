/* 캐릭터 팩 (Quaternius, CC0) — 공통 뼈대 + 공유 애니메이션 */
window.CHARS = (function () {
  const NAMES = ["캐주얼 남","캐주얼 여","후드 남","후드 여","셔츠 남","셔츠 여","대머리","정장 남","정장 여","젊은 의사 남","나이든 의사 남","젊은 의사 여","나이든 의사 여","요리사 남","요리사 여","요리사 모자","공사장 남","공사장 여","군인 남","군인 여","파랑 군인 남","파랑 군인 여","카우보이 남","카우보이 여","카우보이 긴머리","신사 할아버지","귀부인 할머니","해적 남","해적 여","바이킹 남","바이킹 여","바이킹 투구","기사","황금 기사 남","황금 기사 여","닌자 남","닌자 머리 남","닌자 여","사막 닌자 남","사막 닌자 여","기모노 남","기모노 여","마법사","마녀","엘프","고블린 남","고블린 여","좀비 남","좀비 여","퍼그","젖소","마네킹"];
  const RIDER = 99;                 // 운영자 전용 라이더 복장 (후드 남 모델을 기반으로 색과 장비를 바꿔요)
  const SCALE = 0.64;               // 모델 키 약 3.1 → 2.0
  const cache = {}, waits = {}, matCache = {};
  let riderSrc = null, riderTried = false;
  let clips = null, clipWait = null;
  const loader = new THREE.GLTFLoader();

  function loadAnim(cb) {
    if (clips) return cb();
    if (clipWait) return clipWait.push(cb);
    clipWait = [cb];
    loader.load('/models/chars/anim.glb', g => {
      clips = {}; g.animations.forEach(a => { clips[a.name] = a; });
      const w = clipWait; clipWait = null; w.forEach(f => f());
    }, undefined, () => { clipWait = null; });
  }
  function load(i, cb) {
    if (!(i >= 1 && i <= NAMES.length) && i !== RIDER) return;
    if (cache[i]) { if (cb) cb(); return; }
    if (waits[i]) { if (cb) waits[i].push(cb); return; }
    waits[i] = cb ? [cb] : [];
    let n = i === RIDER ? 3 : 2;
    const done = () => { if (--n) return; const w = waits[i]; delete waits[i]; w.forEach(f => f()); };
    loadAnim(done);
    loader.load('/models/chars/' + (i === RIDER ? 3 : i) + '.glb', g => { cache[i] = g; done(); }, undefined, () => { delete waits[i]; });
    if (i === RIDER) loader.load('/models/chars/rider.glb?v=1', g => { riderSrc = g; riderTried = true; done(); }, undefined, () => { riderSrc = null; riderTried = true; done(); });   // 운영자 전용 3D 모델(없으면 기본 라이더 복장)
  }
  const ready = i => !!(cache[i] && clips && (i !== RIDER || riderTried));

  function cloneSkinned(src) {
    const clone = src.clone(true);
    const A = [], B = [];
    src.traverse(o => A.push(o)); clone.traverse(o => B.push(o));
    const map = new Map(); A.forEach((o, k) => map.set(o, B[k]));
    const skels = new Map();
    A.forEach((o, k) => {
      if (!o.isSkinnedMesh) return;
      const c = B[k];
      let sk = skels.get(o.skeleton);
      if (!sk) { sk = new THREE.Skeleton(o.skeleton.bones.map(b => map.get(b)), o.skeleton.boneInverses); skels.set(o.skeleton, sk); }
      c.skeleton = sk; c.bind(sk, c.matrixWorld);
    });
    return clone;
  }
  function mat(toon, m, i) {
    const col = m.color.clone().convertLinearToSRGB();
    const key = col.getHexString();
    return matCache[key] || (matCache[key] = toon(col, { skinning: true }));
  }

  /* ═════ 운영자: 블랙 풀페이스 헬멧 + 로즈골드 · 블랙 후디 · 블랙 장갑·청바지 · 화이트 부츠 ═════ */
  function riderText(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h); const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t; }
  function splitBoots(o, toon, upper, boot, maxY) {
    const g = o.geometry.clone(), idx = g.index && g.index.array, p = g.attributes.position; if (!idx) return;
    const A = [], B = [];
    for (let t = 0; t < idx.length; t += 3) { const a = idx[t], b = idx[t + 1], c = idx[t + 2], cy = (p.getY(a) + p.getY(b) + p.getY(c)) / 3, cx = (p.getX(a) + p.getX(b) + p.getX(c)) / 3; ((cy < maxY && Math.abs(cx) < 0.66) ? B : A).push(a, b, c); }
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(A.concat(B)), 1)); g.clearGroups(); g.addGroup(0, A.length, 0); g.addGroup(A.length, B.length, 1);
    o.geometry = g; o.material = [toon(new THREE.Color(upper), { skinning: true }), toon(new THREE.Color(boot), { skinning: true })];
  }
  function dressRider(root, toon) {
    const K = hex => toon(new THREE.Color(hex), { skinning: true }), S = hex => toon(new THREE.Color(hex), {});
    root.traverse(o => {
      if (!o.isSkinnedMesh) return; const n = o.material.name; o.frustumCulled = false; o.castShadow = true;
      if (n === 'Shirt') o.material = K('#16161b'); else if (n === 'Belt') o.material = K('#0c0c0f'); else if (n === 'Face' || n === 'Hair') o.material = K('#0f0f13');
      else if (n === 'Pants') splitBoots(o, toon, '#1a1b21', '#f3f3f6', 0.86);
      else if (n === 'Skin') splitBoots(o, toon, '#0d0d10', '#f3f3f6', 0.78);
    });
    const head = root.getObjectByName('Head'), neck = root.getObjectByName('Neck'), torso = root.getObjectByName('Torso');
    const rose = '#d99872', roseL = '#f0b895';
    const sph = (r, mat, sx, sy, sz, x, y, z, par) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 18), mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); par.add(m); return m; };
    if (head) {
      const shell = S('#0b0b0f'), dark = new THREE.MeshBasicMaterial({ color: '#5d6876' }), gold = new THREE.MeshBasicMaterial({ color: rose });
      const H = new THREE.Group(); H.position.set(0, 0.8, -0.02); head.add(H);
      sph(0.6, shell, 1, 1.0, 1.08, 0, 0, 0, H);                              // 헬멧 껍데기
      sph(0.46, shell, 1.05, 0.62, 0.95, 0, -0.34, 0.2, H);                   // 턱 보호대
      const vis = new THREE.Mesh(new THREE.SphereGeometry(0.61, 36, 16, Math.PI / 2 - 1.05, 2.1, 1.0, 0.78), dark); vis.scale.set(1, 1, 1.09); H.add(vis);   // 거울 바이저
      const peak = new THREE.Mesh(new THREE.SphereGeometry(0.625, 36, 10, Math.PI / 2 - 1.12, 2.24, 0.78, 0.22), gold); peak.scale.set(1, 1, 1.09); H.add(peak);  // 로즈골드 바이저 윗띠
      const strip = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.018, 8, 48, Math.PI), gold); strip.rotation.set(0, Math.PI / 2, 0); strip.scale.set(1.08, 1, 1); strip.position.set(0, 0.0, 0); strip.rotation.x = 0; H.add(strip);   // 머리 위 로즈골드 선
      [-1, 1].forEach(sx => {                                                 // 옆면 'Rose Gold' 글씨
        const tx = riderText(512, 160, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = roseL; g.font = 'italic 900 96px Georgia, "Times New Roman", serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Rose Gold', w / 2, h / 2 + 6); });
        const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.24), new THREE.MeshBasicMaterial({ map: tx, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
        pl.position.set(sx * 0.605, -0.1, 0.0); pl.rotation.set(0, sx * Math.PI / 2, 0.06 * sx); H.add(pl);
      });
      [-1, 1].forEach(sx => sph(0.07, gold, 1, 0.4, 0.8, sx * 0.5, 0.18, 0.42, H));   // 앞쪽 환기구 로즈골드 장식
    }
    if (neck) sph(0.34, S('#16161b'), 1.15, 0.8, 0.8, 0, 0.14, -0.26, neck);           // 후드(모자) 볼륨
    if (torso) {
      const tx = riderText(512, 560, (g, w, h) => {                                   // 등판 프린트: 크림색 가시 무늬 + 문구
        g.clearRect(0, 0, w, h); g.fillStyle = '#efe6d2';
        for (let k = 0; k < 9; k++) { const x = 30 + k * 56, tall = 120 + ((k * 53) % 70); g.beginPath(); g.moveTo(x - 30, 190); g.quadraticCurveTo(x - 8, 190 - tall * 0.7, x + (k % 2 ? 10 : -6), 190 - tall); g.quadraticCurveTo(x + 26, 190 - tall * 0.5, x + 34, 190); g.closePath(); g.fill(); }
        g.fillRect(24, 168, w - 48, 44);
        g.textAlign = 'center'; g.font = 'italic 700 62px Georgia, "Times New Roman", serif'; g.fillText('Presence', w / 2, 300); g.fillText('in', w / 2, 366); g.fillText('absence', w / 2, 432);
      });
      const bp = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 1.07), new THREE.MeshBasicMaterial({ map: tx, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      bp.position.set(0, 0.13, -0.42); bp.rotation.y = Math.PI; torso.add(bp);
    }
  }
  /* ═════ 운영자 전용 3D 모델: 실제 비율 그대로, 기존 뼈대(걷기·앉기 등)에 자동으로 붙여요 ═════ */
  function applyCustomRider(root, toon) {
    const V = THREE.Vector3;
    let skel = null; const olds = [];
    root.traverse(o => { if (o.isSkinnedMesh) { olds.push(o); skel = skel || o.skeleton; } });
    if (!skel) return false;
    let sg = null, tex = null;
    riderSrc.scene.traverse(o => { if (o.isMesh && !sg) { sg = o.geometry; tex = o.material.map; } });
    if (!sg || !tex) return false;
    const B = {}; skel.bones.forEach(b => { B[b.name] = b; });
    // 1) 기본 자세(Idle) 첫 장면으로 세워 두고
    const m0 = new THREE.AnimationMixer(root); m0.clipAction(clips.Idle).play(); m0.update(0);
    root.updateMatrixWorld(true); m0.stopAllAction(); m0.uncacheRoot(root);
    const hip0 = new V(); B.Hips.getWorldPosition(hip0); root.worldToLocal(hip0);
    const sgnL = (() => { const a = new V(), b = new V(); B.UpperArmL.getWorldPosition(a); B.UpperArmR.getWorldPosition(b); return a.x >= b.x ? 1 : -1; })();
    // 2) 샘플(정규화 좌표: 키 1.0, 발바닥 -0.5) → 뼈대 공간. 비율은 그대로(실제 사람 비율), 키만 게임 캐릭터에 맞춤
    const S = 3.13 * (window.__rs || 1), cx = (-0.185 + 0.179) / 2, cz = (-0.117 + 0.105) / 2;
    const W = (sx, sy, sz) => new V(hip0.x + sx * S, (sy + 0.5) * S, hip0.z + (sz || 0) * S);
    const J = {
      Hips: W(0, -0.08, 0), Abdomen: W(0, 0.0, 0), Torso: W(0, 0.13, 0), Neck: W(0, 0.29, 0), Head: W(0, 0.325, 0.005),
      ShoulderL: W(sgnL * 0.05, 0.27, 0), UpperArmL: W(sgnL * 0.13, 0.25, 0), LowerArmL: W(sgnL * 0.145, 0.07, 0.0), FistL: W(sgnL * 0.14, -0.1, 0.01),
      ShoulderR: W(-sgnL * 0.05, 0.27, 0), UpperArmR: W(-sgnL * 0.13, 0.25, 0), LowerArmR: W(-sgnL * 0.145, 0.07, 0.0), FistR: W(-sgnL * 0.14, -0.1, 0.01),
      UpperLegL: W(sgnL * 0.06, -0.08, 0), LowerLegL: W(sgnL * 0.06, -0.28, 0.01), UpperLegR: W(-sgnL * 0.06, -0.08, 0), LowerLegR: W(-sgnL * 0.06, -0.28, 0.01)
    };
    // 3) 뼈 위치를 새 비율로 옮기고(위→아래 순서), 달라진 만큼을 애니메이션에도 반영
    const ORDER = ['Hips', 'Abdomen', 'Torso', 'Neck', 'Head', 'ShoulderL', 'UpperArmL', 'LowerArmL', 'FistL', 'ShoulderR', 'UpperArmR', 'LowerArmR', 'FistR', 'UpperLegL', 'LowerLegL', 'UpperLegR', 'LowerLegR'];
    const diff = {};
    ORDER.forEach(n => {
      const b = B[n]; if (!b) return; const old = b.position.clone();
      b.parent.updateWorldMatrix(true, false);
      b.position.copy(b.parent.worldToLocal(root.localToWorld(J[n].clone()))); b.updateMatrixWorld(true);
      diff[n] = b.position.clone().sub(old);
    });
    const RC = {};
    ['Idle', 'Walk', 'Run', 'Jump', 'Walk_Carry', 'Run_Carry', 'SitDown', 'StandUp', 'PickUp', 'Punch', 'RecieveHit', 'Roll', 'SwordSlash', 'Shoot_OneHanded', 'Defeat', 'Death'].forEach(k => {
      if (!clips[k]) return; const c = clips[k].clone(); const du = c.duration || 1;
      c.tracks.forEach(t => {
        const m = /^(.+)\.position$/.exec(t.name); if (!m || !diff[m[1]]) return;
        const d = diff[m[1]], v = t.values, times = t.times;
        for (let f = 0; f < times.length; f++) {
          let r = 1; if (m[1] === 'Hips') { const fr = Math.min(1, times[f] / du); if (k === 'SitDown') r = 1 - fr; else if (k === 'StandUp') r = fr; else if (k === 'Death' || k === 'Defeat') r = 0; }   // 앉을 땐 골반이 의자 높이에 닿게
          v[f * 3] += d.x * r; v[f * 3 + 1] += d.y * r; v[f * 3 + 2] += d.z * r;
        }
      });
      RC[k] = c;
    });
    root.userData.rclips = RC;
    // 4) 새 자세에서의 뼈 위치 → 정점 뼈 무게
    const P = n => { const v = new V(); B[n].getWorldPosition(v); return root.worldToLocal(v); };
    const g = sg.clone(), pos = g.attributes.position, n = pos.count;
    for (let v = 0; v < n; v++) pos.setXYZ(v, hip0.x + (pos.getX(v) - cx) * S, (pos.getY(v) + 0.5) * S, hip0.z + (pos.getZ(v) - cz) * S);
    const seg = [], add = (nm, a, b, pen) => { const i = skel.bones.indexOf(B[nm]); if (i >= 0) seg.push({ i, a, b, pen: pen || 1 }); };
    const R = (sx, sy, sz) => W(sx, sy, sz || 0);
    add('Hips', R(-0.07, -0.06), R(0.07, -0.06)); add('Hips', P('Hips'), P('Abdomen'));
    add('Abdomen', R(-0.09, 0.02), R(0.09, 0.02)); add('Abdomen', P('Abdomen'), P('Torso'));
    add('Torso', R(-0.1, 0.2), R(0.1, 0.2)); add('Torso', P('Torso'), P('Neck'));
    add('Neck', P('Neck'), P('Head')); add('Head', P('Head'), W(0, 0.5, 0.0)); add('Head', P('Head'), W(0, 0.4, 0.0));
    ['L', 'R'].forEach(sd => {
      const sg2 = sd === 'L' ? sgnL : -sgnL;
      add('UpperArm' + sd, P('UpperArm' + sd), P('LowerArm' + sd), 1.25); add('LowerArm' + sd, P('LowerArm' + sd), P('Fist' + sd), 1.15);
      add('Fist' + sd, P('Fist' + sd), W(sg2 * 0.14, -0.14, 0.01), 1.1);
      add('UpperLeg' + sd, P('UpperLeg' + sd), P('LowerLeg' + sd)); add('LowerLeg' + sd, P('LowerLeg' + sd), W(sg2 * 0.06, -0.43, 0.0));
      add('LowerLeg' + sd, W(sg2 * 0.06, -0.43, 0.0), W(sg2 * 0.06, -0.47, 0.07));
    });
    const sI = new Uint16Array(n * 4), sW = new Float32Array(n * 4), q = new V(), ab = new V(), ap = new V(), cp = new V();
    for (let v = 0; v < n; v++) {
      q.set(pos.getX(v), pos.getY(v), pos.getZ(v)); const best = {};
      seg.forEach(s => { ab.copy(s.b).sub(s.a); const L2 = ab.lengthSq() || 1e-6; ap.copy(q).sub(s.a); const t = Math.min(1, Math.max(0, ap.dot(ab) / L2)); cp.copy(ab).multiplyScalar(t).add(s.a); const d = q.distanceTo(cp) * s.pen; if (best[s.i] === undefined || d < best[s.i]) best[s.i] = d; });
      const ds = Object.keys(best).map(k => ({ i: +k, d: best[k] })).sort((x, y) => x.d - y.d).slice(0, 3); let tot = 0; ds.forEach(o => { o.w = 1 / Math.pow(o.d + 0.03, 6); tot += o.w; });
      for (let k = 0; k < 4; k++) { const o = ds[k]; sI[v * 4 + k] = o ? o.i : 0; sW[v * 4 + k] = o ? o.w / tot : 0; }
    }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(sI, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sW, 4));
    g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();
    tex.anisotropy = 4;
    const mesh = new THREE.SkinnedMesh(g, toon(new THREE.Color('#ffffff'), { skinning: true, map: tex }));
    mesh.frustumCulled = false; mesh.castShadow = true; root.add(mesh); root.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(skel.bones, skel.bones.map(b => b.matrixWorld.clone().invert())), mesh.matrixWorld);
    olds.forEach(o => { if (o.parent) o.parent.remove(o); });
    return true;
  }
  function make(i, toon) {
    const g = cache[i];
    const root = cloneSkinned(g.scene);
    if (i === RIDER) { if (!(riderSrc && !window.__noRiderMesh && applyCustomRider(root, toon))) dressRider(root, toon); }
    else root.traverse(o => {
      if (o.isSkinnedMesh) { o.frustumCulled = false; o.castShadow = true; o.material = mat(toon, o.material, i); }
    });
    const holder = new THREE.Group(); holder.add(root); holder.scale.setScalar(SCALE);
    const mixer = new THREE.AnimationMixer(root), act = {};
    const ONCE = { SitDown: 1, StandUp: 0, PickUp: 0, Punch: 0, RecieveHit: 0, Roll: 0, SwordSlash: 0, Shoot_OneHanded: 0, Defeat: 1, Death: 1 };   // 한 번만 재생 (1 = 끝 자세 유지)
    const CL = root.userData.rclips || clips;
    ['Idle', 'Walk', 'Run', 'Jump', 'Walk_Carry', 'Run_Carry'].concat(Object.keys(ONCE)).forEach(k => { if (CL[k]) { const a = mixer.clipAction(CL[k]); act[k] = a; if (k in ONCE) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = !!ONCE[k]; } } });
    act.Idle.play();
    holder.updateMatrixWorld(true);
    const top = new THREE.Box3().setFromObject(holder).max.y;
    return { holder, mixer, act, cur: 'Idle', top };
  }
  function play(P, name, dt) {
    if (P.cur !== name && P.act[name]) {
      const a = P.act[name], b = P.act[P.cur];
      a.reset().setEffectiveWeight(1).play(); if (b) a.crossFadeFrom(b, 0.22, false);
      P.cur = name;
    }
    { const A = P.act[P.cur];                       // 접시·컵을 들고 서 있을 때: 걷기(들기) 자세에서 멈춰 둠 → 손에 제대로 들려 있어요
      if (A && P.cur === 'Walk_Carry') { if (P.hold) { if (!A.paused) { A.paused = true; A.time = A.getClip().duration * 0.25; } } else if (A.paused) A.paused = false; } }
    P.mixer.update(dt);
    const ARM = ['UpperArmL', 'UpperArmR', 'LowerArmL', 'LowerArmR'];
    if (P.hand || P.hbase) {                        // 운전대/핸들 잡는 팔 자세 (애니메이션 뒤에 덮어씀 — 누적되지 않게 기준 자세를 기억)
      if (!P.bones) { P.bones = {}; P.holder.traverse(o => { if (o.isBone) P.bones[o.name] = o; }); P.q = new THREE.Quaternion(); P.ax = new THREE.Vector3(1, 0, 0); P.ay = new THREE.Vector3(0, 1, 0); P.az = new THREE.Vector3(0, 0, 1); P.hbase = null; P.hlast = {}; }
      const H = P.hand, ang = H ? { UpperArmL: H.ul, UpperArmR: H.ur, LowerArmL: H.ll, LowerArmR: H.lr } : null;
      if (!P.hbase) { P.hbase = {}; P.hlast = {}; }
      ARM.forEach(n => {
        const b = P.bones[n]; if (!b) return;
        const last = P.hlast[n];
        if (!last || !b.quaternion.equals(last)) { P.hbase[n] = (P.hbase[n] || new THREE.Quaternion()).copy(b.quaternion); }   // 애니메이션이 새로 쓴 자세
        const base = P.hbase[n];
        if (H && ang[n]) {
          P.q.setFromAxisAngle(H.ax === 'z' ? P.az : H.ax === 'y' ? P.ay : P.ax, ang[n]);
          b.quaternion.copy(base).multiply(P.q);
          P.hlast[n] = (last || new THREE.Quaternion()).copy(b.quaternion);
        } else { b.quaternion.copy(base); P.hlast[n] = (last || new THREE.Quaternion()).copy(b.quaternion); }
      });
      if (!H) { P.hbase = null; P.hlast = {}; }
    }
  }
  const dur = (P, n) => (P.act[n] ? P.act[n].getClip().duration : 1);
  return { names: NAMES, count: NAMES.length, load, ready, make, play, dur, SCALE };
})();
