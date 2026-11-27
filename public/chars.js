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
    if (i === RIDER) loader.load('/models/chars/rider.glb?v=4', g => { riderSrc = g; riderTried = true; done(); }, undefined, () => { riderSrc = null; riderTried = true; done(); });   // 운영자 전용 3D 모델(없으면 기본 라이더 복장)
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
  function applyRetargetRider(root, toon) {
    const V = THREE.Vector3, Q = THREE.Quaternion;
    const src = {}, olds = [];
    root.traverse(o => { if (o.isBone) src[o.name] = o; if (o.isSkinnedMesh) olds.push(o); });
    let tex = null; riderSrc.scene.traverse(o => { if (o.isMesh && !tex && o.material) tex = o.material.map; });
    if (!tex || !src.Hips) return null;
    const rg = cloneSkinned(riderSrc.scene);
    const T = {}; rg.traverse(o => { if (o.isBone) T[o.name] = o; });
    if (!T.CC_Base_Hip || !T.CC_Base_Pelvis || !T.CC_Base_L_Foot) return null;
    tex.anisotropy = 4;
    rg.traverse(o => { if (o.isSkinnedMesh) { o.frustumCulled = false; o.castShadow = true; o.material = toon(new THREE.Color('#ffffff'), { skinning: true, map: tex }); } });
    const H = (() => { const bb = new THREE.Box3().setFromObject(rg), z = new V(); bb.getSize(z); return z.y || 1.7; })();
    const F = 3.13 / H * (window.__rs || 1); rg.scale.setScalar(F);          // 키만 게임 캐릭터에 맞추고 비율은 실제 사람 그대로
    root.add(rg); olds.forEach(o => { if (o.parent) o.parent.remove(o); });
    root.updateMatrixWorld(true);
    {   // 후디 밑단이 다리 뼈에 끌려 늘어나는 것 방지: 허리~골반 높이의 정점은 다리 영향을 줄이고 골반으로 옮김
      const names = Object.keys(T), idx = {}; let sk0 = null; rg.traverse(o => { if (o.isSkinnedMesh && !sk0) sk0 = o; });
      if (sk0) {
        const bi = n => sk0.skeleton.bones.indexOf(T[n]), pel = bi('CC_Base_Pelvis'), legs = new Set(names.filter(n => /Thigh|Calf/.test(n)).map(bi));
        const g = sk0.geometry, P = g.attributes.position, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, v = new V();
        for (let k = 0; k < P.count; k++) {
          v.fromBufferAttribute(P, k).applyMatrix4(sk0.matrixWorld); root.worldToLocal(v); const y = v.y / F;
          const f = Math.max(0, Math.min(1, (0.53 * H - y) / (0.047 * H))); if (f >= 1) continue;
          let move = 0, ps = -1, small = 0;
          for (let j = 0; j < 4; j++) { const ji = SI.array[k * 4 + j], w = SW.array[k * 4 + j]; if (ji === pel) ps = j; if (w < SW.array[k * 4 + small]) small = j; if (legs.has(ji) && w > 0) { move += w * (1 - f); SW.array[k * 4 + j] = w * f; } }
          if (move > 0) { if (ps < 0) { ps = small; SI.array[k * 4 + ps] = pel; SW.array[k * 4 + ps] = 0; } SW.array[k * 4 + ps] += move; }
        }
        SI.needsUpdate = SW.needsUpdate = true;
      }
    }
    const IDQ = new Q(), rq = new Q(), Gi = new Q(), qa = new Q(), qp = new Q(), qt = new Q(), v1 = new V(), v2 = new V();
    const wq = b => { const q = new Q(); b.getWorldQuaternion(q); return q; };
    const TIP = { Hips: 'Abdomen', Abdomen: 'Torso', Torso: 'Neck', Neck: 'Head', ShoulderL: 'UpperArmL', UpperArmL: 'LowerArmL', LowerArmL: 'FistL', ShoulderR: 'UpperArmR', UpperArmR: 'LowerArmR', LowerArmR: 'FistR', UpperLegL: 'LowerLegL', UpperLegR: 'LowerLegR' };
    const MAP = { Hips: 'CC_Base_Pelvis', Abdomen: 'CC_Base_Waist', Torso: 'CC_Base_Spine02', Neck: 'CC_Base_NeckTwist01', Head: 'CC_Base_Head',
      ShoulderL: 'CC_Base_L_Clavicle', UpperArmL: 'CC_Base_L_Upperarm', LowerArmL: 'CC_Base_L_Forearm', FistL: 'CC_Base_L_Hand',
      ShoulderR: 'CC_Base_R_Clavicle', UpperArmR: 'CC_Base_R_Upperarm', LowerArmR: 'CC_Base_R_Forearm', FistR: 'CC_Base_R_Hand',
      UpperLegL: 'CC_Base_L_Thigh', LowerLegL: 'CC_Base_L_Calf', UpperLegR: 'CC_Base_R_Thigh', LowerLegR: 'CC_Base_R_Calf' };
    const DAMP = { Hips: 0.7, Abdomen: 0.5, Torso: 0.5, Neck: 0.5, Head: 0.5, UpperLegL: 0.85, UpperLegR: 0.85 };   // 원본의 숙이는 동작·큰 걸음을 사람 비율에 맞게 줄임
    const wp = b => { const v = new V(); b.getWorldPosition(v); return v; };
    const PAIRS = Object.keys(MAP).filter(k => src[k] && T[MAP[k]]).map(k => {
      const s0 = src[k], t0 = T[MAP[k]], tk = TIP[k];
      let al = new Q();                                                              // 휴식 자세가 달라도(T자 ↔ 팔 내림) 뼈 방향을 맞춰서 전달
      if (tk && src[tk] && T[MAP[tk]]) { const ds = wp(src[tk]).sub(wp(s0)).normalize(), dt = wp(T[MAP[tk]]).sub(wp(t0)).normalize(); al.setFromUnitVectors(dt, ds); }
      return { s: s0, t: t0, sInv: wq(s0).invert(), tRest: al.multiply(wq(t0)), damp: DAMP[k] === undefined ? 1 : DAMP[k] };
    });
    const feet = ['CC_Base_L_Foot', 'CC_Base_R_Foot'].map(n => ({ t: T[n], tRest: wq(T[n]) }));
    const pos = b => { const v = new V(); b.getWorldPosition(v); return root.worldToLocal(v); };
    const hipS0 = pos(src.Hips), hipT0 = pos(T.CC_Base_Hip), ank0 = Math.min(pos(feet[0].t).y, pos(feet[1].t).y);
    const K = hipT0.y / (hipS0.y || 1), want = new V(), GROUND = { Idle: 1, Walk: 1, Run: 1, Walk_Carry: 1, Run_Carry: 1 };
    const setHip = () => { T.CC_Base_Hip.position.copy(T.CC_Base_Hip.parent.worldToLocal(root.localToWorld(v2.copy(want)))); };
    let ls = 0;
    const rt = {
      rhand: { bone: T.CC_Base_R_Hand, restQ: wq(T.CC_Base_R_Hand) },
      apply(P) {
        root.updateMatrixWorld(true);
        root.getWorldQuaternion(Gi); Gi.invert();
        const sp = pos(src.Hips);
        want.set(hipT0.x + (sp.x - hipS0.x) * K, hipT0.y + (sp.y - hipS0.y) * K, hipT0.z + (sp.z - hipS0.z) * K);
        setHip(); T.CC_Base_Hip.updateMatrixWorld(true);
        for (const p of PAIRS) {
          p.s.getWorldQuaternion(qa); qa.premultiply(Gi);
          qt.copy(qa).multiply(p.sInv); if (p.damp < 1) qt.slerp(IDQ, 1 - p.damp); qt.multiply(p.tRest);                            // 원본이 휴식 자세에서 돌아간 만큼 그대로 전달
          p.t.parent.getWorldQuaternion(qp); qp.premultiply(Gi);
          p.t.quaternion.copy(qp.invert().multiply(qt)); p.t.updateMatrixWorld(true);
        }
        for (const f of feet) { f.t.parent.getWorldQuaternion(qp); qp.premultiply(Gi); f.t.quaternion.copy(qp.invert().multiply(f.tRest)); f.t.updateMatrixWorld(true); }   // 발은 항상 평평하게
        let lift = 0;
        if (GROUND[P.cur]) { lift = ank0 - Math.min(pos(feet[0].t).y, pos(feet[1].t).y); lift = Math.max(-0.9, Math.min(0.9, lift)); }
        ls += (lift - ls) * 0.6;
        if (Math.abs(ls) > 1e-4) { want.y += ls; setHip(); }
        rg.updateMatrixWorld(true);
      }
    };
    return rt;
  }
  function make(i, toon) {
    const g = cache[i];
    const root = cloneSkinned(g.scene);
    let rt = null;
    if (i === RIDER) { rt = (riderSrc && !window.__noRiderMesh) ? applyRetargetRider(root, toon) : null; if (!rt) dressRider(root, toon); }
    else root.traverse(o => {
      if (o.isSkinnedMesh) { o.frustumCulled = false; o.castShadow = true; o.material = mat(toon, o.material, i); }
    });
    const holder = new THREE.Group(); holder.add(root); holder.scale.setScalar(SCALE);
    const mixer = new THREE.AnimationMixer(root), act = {};
    const ONCE = { SitDown: 1, StandUp: 0, PickUp: 0, Punch: 0, RecieveHit: 0, Roll: 0, SwordSlash: 0, Shoot_OneHanded: 0, Defeat: 1, Death: 1 };   // 한 번만 재생 (1 = 끝 자세 유지)
    const CL = clips;
    ['Idle', 'Walk', 'Run', 'Jump', 'Walk_Carry', 'Run_Carry'].concat(Object.keys(ONCE)).forEach(k => { if (CL[k]) { const a = mixer.clipAction(CL[k]); act[k] = a; if (k in ONCE) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = !!ONCE[k]; } } });
    act.Idle.play();
    holder.updateMatrixWorld(true);
    const top = new THREE.Box3().setFromObject(holder).max.y;
    if (rt) rt.apply({ cur: 'Idle' });
    return { holder, mixer, act, cur: 'Idle', top, rt, rhand: rt && rt.rhand };
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
    if (P.rt) P.rt.apply(P);
  }
  const dur = (P, n) => (P.act[n] ? P.act[n].getClip().duration : 1);
  return { names: NAMES, count: NAMES.length, load, ready, make, play, dur, SCALE };
})();
