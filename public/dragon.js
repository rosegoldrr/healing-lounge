/* 드래곤 탈것: GLB(뼈대 애니메이션) + 불 뿜기 파티클 */
window.DRG = (function () {
  const SCALE = 0.13;
  let gltf = null, waits = null;
  function load(cb) {
    if (gltf) return cb && cb();
    if (waits) { if (cb) waits.push(cb); return; }
    waits = cb ? [cb] : [];
    new THREE.GLTFLoader().load('/models/dragon.glb', g => { gltf = g; const w = waits; waits = null; w.forEach(f => f()); }, undefined, () => { waits = null; });
  }
  function cloneSkinned(src) {
    const clone = src.clone(true), A = [], B = [];
    src.traverse(o => A.push(o)); clone.traverse(o => B.push(o));
    const map = new Map(); A.forEach((o, k) => map.set(o, B[k]));
    const skels = new Map();
    A.forEach((o, k) => { if (!o.isSkinnedMesh) return; const c = B[k]; let sk = skels.get(o.skeleton); if (!sk) { sk = new THREE.Skeleton(o.skeleton.bones.map(b => map.get(b)), o.skeleton.boneInverses); skels.set(o.skeleton, sk); } c.skeleton = sk; c.bind(sk, c.matrixWorld); });
    return clone;
  }
  function glowTex() {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,230,1)'); g.addColorStop(0.35, 'rgba(255,190,70,.85)'); g.addColorStop(1, 'rgba(255,60,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }
  /* scene에 드래곤 하나를 만든다 */
  function make(scene) {
    const D = { root: new THREE.Group(), ready: false, fire: 0, cur: '', fireT: 0, parts: [] };
    D.root.visible = false; scene.add(D.root);
    const tex = glowTex();
    const mk = (blend, n) => { for (let i = 0; i < n; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: blend ? tex : smokeTex, transparent: true, depthWrite: false, blending: blend ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: 0 }));
      sp.visible = false; scene.add(sp); D.parts.push({ s: sp, life: 0, max: 1, v: new THREE.Vector3(), smoke: !blend, ph: Math.random() * 6.28 }); } };
    const smokeTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(70,60,55,.55)'); g.addColorStop(1, 'rgba(40,35,35,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
    mk(true, 150); mk(false, 40);
    load(() => {
      const root = cloneSkinned(gltf.scene);
      root.traverse(o => {
        if (!o.isSkinnedMesh && !o.isMesh) return;
        o.frustumCulled = false; o.castShadow = true;
        const m = o.material, map = m.map || null;
        if (map) map.encoding = THREE.LinearEncoding;          // 색 보정 없이 그대로 표시
        o.material = new THREE.MeshLambertMaterial({ map, color: map ? '#ffffff' : m.color.clone().convertLinearToSRGB(), skinning: !!o.isSkinnedMesh, side: m.side, transparent: !!m.transparent, alphaTest: m.alphaTest || 0 });
        if (o.name && /head/i.test(o.name)) D.headMesh = o;
      });
      root.traverse(o => { if (o.isBone && /Bip001-Head/.test(o.name)) D.head = o; });
      const holder = new THREE.Group(); holder.add(root); holder.scale.setScalar(SCALE); D.root.add(holder);
      const mixer = new THREE.AnimationMixer(root), act = {};
      gltf.animations.forEach(a => {
        a.tracks = a.tracks.filter(t => !(/^(_rootJoint|root_02|Bip001_03)\.(position|quaternion|rotation|scale)$/.test(t.name)));   // 제자리 비행 (이동은 게임이 담당)
        act[a.name] = mixer.clipAction(a);
      });
      D.mixer = mixer; D.act = act; D.holder = holder; D.ready = true;
      if (act.Idle) { act.Idle.play(); D.cur = 'Idle'; }
    });
    const tv = new THREE.Vector3(), fw = new THREE.Vector3();
    /* x,y,z 위치 · ry 방향 · pt 기울기 · air 공중 여부 · fire 불 뿜는 중 · show 보이기 */
    D.update = function (x, y, z, ry, pt, air, fire, dt, show, spd, roar) {
      D.root.visible = show && D.ready;
      if (D.ready && show) {
        D.root.position.set(x, y, z); D.root.rotation.set(0, ry, 0, 'YXZ'); D.holder.rotation.x = -pt * 0.6;
        const want = air ? 'Fly' : ((fire || roar > 0) ? 'Breath' : (spd > 1 ? 'Walk' : 'Idle'));
        if (want !== D.cur && D.act[want]) { const a = D.act[want], b = D.act[D.cur]; a.reset().setEffectiveWeight(1).play(); if (b) a.crossFadeFrom(b, 0.35, false); D.cur = want; }
        D.mixer.update(dt);
        if (roar > 0 && D.head) {                    // 울부짖기: 목을 뒤로 젖히고 머리를 떨며 포효 (애니메이션이 매 프레임 덮어쓰므로 누적되지 않아요)
          const q = new THREE.Quaternion(), ax = new THREE.Vector3(1, 0, 0), tt = performance.now() / 1000, sh = Math.sin(tt * 42) * 0.06 * roar;
          let b = D.head; const chain = [];
          for (let i = 0; i < 4 && b && b.isBone; i++) { chain.push(b); b = b.parent; }
          chain.forEach((bn, i) => { q.setFromAxisAngle(ax, (i === 0 ? -0.55 : -0.22) * roar + (i === 0 ? sh : 0)); bn.quaternion.multiply(q); });
        }
      }
      /* 불꽃: 누르는 동안 계속 뿜고, 떼면 바로 멈춤 */
      D.fireT += dt; D.smokeT = (D.smokeT || 0) + dt;
      let mx = x, my = y, mz = z;
      fw.set(Math.sin(ry) * Math.cos(pt), Math.sin(pt) * 0.9, Math.cos(ry) * Math.cos(pt));
      if (D.ready) { mx = x + fw.x * 2.4; my = y + 1.9 + fw.y * 2.4; mz = z + fw.z * 2.4; }
      const on = fire && show && D.ready;
      if (on) {
        let n = Math.floor(D.fireT * 140); if (n > 0) D.fireT = 0;
        let m = Math.floor(D.smokeT * 18); if (m > 0) D.smokeT = 0;
        for (const p of D.parts) {
          if (p.life > 0) continue;
          if (p.smoke) { if (m <= 0) continue; m--; } else { if (n <= 0) continue; n--; }
          const sp = p.smoke ? 6 : 17 + Math.random() * 7, cone = p.smoke ? 0.28 : 0.1;
          p.life = p.max = p.smoke ? 1.3 + Math.random() * 0.6 : 0.5 + Math.random() * 0.45;
          p.s.position.set(mx + (Math.random() - 0.5) * 0.3, my + (Math.random() - 0.5) * 0.3, mz + (Math.random() - 0.5) * 0.3);
          p.v.set(fw.x * sp + (Math.random() - 0.5) * sp * cone * 2, fw.y * sp + (Math.random() - 0.5) * sp * cone * 2, fw.z * sp + (Math.random() - 0.5) * sp * cone * 2);
          p.s.visible = true;
        }
      }
      for (const p of D.parts) {
        if (p.life <= 0) { p.s.visible = false; continue; }
        p.life -= dt; const k = 1 - p.life / p.max;
        p.s.position.addScaledVector(p.v, dt); p.v.y += dt * (p.smoke ? 2.5 : 3.2); p.v.multiplyScalar(1 - dt * (p.smoke ? 1.2 : 1.6));
        p.s.position.x += Math.sin(p.ph + k * 9) * dt * 0.9; p.s.position.z += Math.cos(p.ph + k * 8) * dt * 0.9;
        if (p.smoke) { p.s.scale.setScalar(1.6 + k * 5); p.s.material.opacity = Math.max(0, 0.5 * Math.min(1, k * 3) * (1 - k)); }
        else {
          p.s.scale.setScalar(0.5 + Math.sin(Math.min(1, k * 1.2) * 1.7) * 3.8);
          p.s.material.opacity = Math.max(0, 0.95 * (1 - k * k));
          p.s.material.color.setRGB(1, Math.max(0.12, 0.95 - k * 0.85), Math.max(0, 0.55 - k * 0.8));    // 노랑 → 주황 → 붉은색
        }
      }
    };
    return D;
  }
  return { make, load, SCALE };
})();
