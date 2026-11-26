/* 캐릭터 팩 (Quaternius, CC0) — 공통 뼈대 + 공유 애니메이션 */
window.CHARS = (function () {
  const NAMES = ["캐주얼 남","캐주얼 여","후드 남","후드 여","셔츠 남","셔츠 여","대머리","정장 남","정장 여","젊은 의사 남","나이든 의사 남","젊은 의사 여","나이든 의사 여","요리사 남","요리사 여","요리사 모자","공사장 남","공사장 여","군인 남","군인 여","파랑 군인 남","파랑 군인 여","카우보이 남","카우보이 여","카우보이 긴머리","신사 할아버지","귀부인 할머니","해적 남","해적 여","바이킹 남","바이킹 여","바이킹 투구","기사","황금 기사 남","황금 기사 여","닌자 남","닌자 머리 남","닌자 여","사막 닌자 남","사막 닌자 여","기모노 남","기모노 여","마법사","마녀","엘프","고블린 남","고블린 여","좀비 남","좀비 여","퍼그","젖소","마네킹"];
  const SCALE = 0.64;               // 모델 키 약 3.1 → 2.0
  const cache = {}, waits = {}, matCache = {};
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
    if (!(i >= 1 && i <= NAMES.length)) return;
    if (cache[i]) { if (cb) cb(); return; }
    if (waits[i]) { if (cb) waits[i].push(cb); return; }
    waits[i] = cb ? [cb] : [];
    let n = 2;
    const done = () => { if (--n) return; const w = waits[i]; delete waits[i]; w.forEach(f => f()); };
    loadAnim(done);
    loader.load('/models/chars/' + i + '.glb', g => { cache[i] = g; done(); }, undefined, () => { delete waits[i]; });
  }
  const ready = i => !!(cache[i] && clips);

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
  function make(i, toon) {
    const g = cache[i];
    const root = cloneSkinned(g.scene);
    root.traverse(o => {
      if (o.isSkinnedMesh) { o.frustumCulled = false; o.castShadow = true; o.material = mat(toon, o.material, i); }
    });
    const holder = new THREE.Group(); holder.add(root); holder.scale.setScalar(SCALE);
    const mixer = new THREE.AnimationMixer(root), act = {};
    ['Idle', 'Walk', 'Run', 'Jump', 'SitDown'].forEach(k => { if (clips[k]) { const a = mixer.clipAction(clips[k]); act[k] = a; if (k === 'SitDown') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; } } });
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
  return { names: NAMES, count: NAMES.length, load, ready, make, play, SCALE };
})();
