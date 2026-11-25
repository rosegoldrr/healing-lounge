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
    for (let i = 0; i < 46; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      s.visible = false; scene.add(s); D.parts.push({ s, life: 0, max: 1, v: new THREE.Vector3() });
    }
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
        a.tracks = a.tracks.filter(t => !(/\.position$/.test(t.name) && /^(_rootJoint|root_02|Bip001_03)\./.test(t.name)));   // 제자리 비행 (이동은 게임이 담당)
        act[a.name] = mixer.clipAction(a);
      });
      D.mixer = mixer; D.act = act; D.holder = holder; D.ready = true;
      if (act.Idle) { act.Idle.play(); D.cur = 'Idle'; }
    });
    const tv = new THREE.Vector3(), fw = new THREE.Vector3();
    /* x,y,z 위치 · ry 방향 · pt 기울기 · air 공중 여부 · fire 불 뿜는 중 · show 보이기 */
    D.update = function (x, y, z, ry, pt, air, fire, dt, show, spd) {
      D.root.visible = show && D.ready;
      if (D.ready && show) {
        D.root.position.set(x, y, z); D.root.rotation.set(0, ry, 0, 'YXZ'); D.holder.rotation.x = -pt * 0.6;
        const want = air ? 'Fly' : (fire ? 'Breath' : (spd > 1 ? 'Walk' : 'Idle'));
        if (want !== D.cur && D.act[want]) { const a = D.act[want], b = D.act[D.cur]; a.reset().setEffectiveWeight(1).play(); if (b) a.crossFadeFrom(b, 0.35, false); D.cur = want; }
        D.mixer.update(dt);
      }
      /* 불꽃 */
      D.fireT += dt;
      let mx = 0, my = 0, mz = 0;
      if (D.ready) { fw.set(Math.sin(ry) * Math.cos(pt), Math.sin(pt) * 0.9, Math.cos(ry) * Math.cos(pt)); mx = x + fw.x * 2.5; my = y + 2.5 + fw.y * 2.5; mz = z + fw.z * 2.5; }
      if (fire && show && D.ready) {
        let n = Math.floor(D.fireT * 110); if (n > 0) D.fireT = 0;
        for (const p of D.parts) { if (n <= 0) break; if (p.life > 0) continue; n--; p.life = p.max = 0.55 + Math.random() * 0.35;
          p.s.position.set(mx, my, mz); p.v.set(fw.x * 15 + (Math.random() - 0.5) * 3.2, fw.y * 15 + (Math.random() - 0.3) * 2.4, fw.z * 15 + (Math.random() - 0.5) * 3.2); p.s.visible = true; }
      }
      for (const p of D.parts) {
        if (p.life <= 0) { p.s.visible = false; continue; }
        p.life -= dt; const k = 1 - p.life / p.max; p.s.position.addScaledVector(p.v, dt); p.v.y += dt * 1.5; p.v.multiplyScalar(1 - dt * 0.8);
        p.s.scale.setScalar(0.8 + k * 3.4); p.s.material.opacity = Math.max(0, 0.95 * (1 - k)); p.s.material.color.setRGB(1, 1 - k * 0.55, 1 - k * 0.9);
      }
    };
    return D;
  }
  return { make, load, SCALE };
})();
