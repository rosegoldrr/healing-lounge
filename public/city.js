/* ─────────────────────────────────────────────────────────────
   Healing Lounge — 힐링 광장 배경
   고층 빌딩 · 광장 · 분수 · 카페 · 편의점 · 벤치 · 가로등 · 노을 하늘
   buildCity(THREE, scene, renderer) → { update, resolve, camBlocked, benches, ... }
   ───────────────────────────────────────────────────────────── */
(function (global) {
'use strict';

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function buildCity(THREE, scene, renderer, OPT) {
  const rnd = mulberry32(20261125);
  const R = (a, b) => a + (b - a) * rnd();
  const TAU = Math.PI * 2, D2R = Math.PI / 180;
  const city = { colliders: [], boxes: [], benches: [], trees: [], spots: {}, world: 60, cx: 0, cz: 0 };
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const tmp = new THREE.Object3D();
  const FOG = '#efe0c8';
  const SUN_AZ = 225 * D2R;
  const sunDir = new THREE.Vector3(Math.cos(SUN_AZ) * 0.95, 0.30, Math.sin(SUN_AZ) * 0.95).normalize();
  const NIGHT = 0.12;                              // 창문 불 켜진 정도 (3단계에서 시간대 동기화 예정)
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
  /* ── 지브리풍 도구: 툰 램프 · 림라이트 ── */
  const gradMap = new THREE.DataTexture(new Uint8Array([
    176, 180, 200, 255, 176, 180, 200, 255, 176, 180, 200, 255,
    222, 221, 224, 255, 222, 221, 224, 255,
    255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255]), 8, 1, THREE.RGBAFormat);
  gradMap.minFilter = gradMap.magFilter = THREE.NearestFilter; gradMap.generateMipmaps = false; gradMap.needsUpdate = true;
  const rimU = { value: new THREE.Color('#ffe2b8') }, rimK = { value: 0.34 };
  function toonMat(c, extra) {
    if (c && typeof c === 'object' && !c.isColor) { extra = c; c = extra.color || '#ffffff'; }
    const m = new THREE.MeshToonMaterial(Object.assign({ color: c, gradientMap: gradMap }, extra || {}));
    m.onBeforeCompile = function (sh) {
      sh.uniforms.uRim = rimU; sh.uniforms.uRimK = rimK;
      sh.fragmentShader = 'uniform vec3 uRim;uniform float uRimK;\n' + sh.fragmentShader.replace('gl_FragColor = vec4( outgoingLight, diffuseColor.a );',
        'float rimF=pow(1.0-clamp(dot(normalize(normal),normalize(vViewPosition)),0.0,1.0),2.6);\n outgoingLight+=uRim*rimF*uRimK;\n gl_FragColor = vec4( outgoingLight, diffuseColor.a );');
    };
    return m;
  }
  function M(color, o) { const k = color + JSON.stringify(o || {}); return matCache[k] || (matCache[k] = toonMat(color, o)); }
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const cyl8 = new THREE.CylinderGeometry(1, 1, 1, 10);
  function mesh(geo, mat, x, y, z, ry) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (ry) m.rotation.y = ry; m.receiveShadow = true; m.castShadow = true; scene.add(m); return m; }
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
    m.frustumCulled = false; m.castShadow = this.noCast ? false : true; m.receiveShadow = true; scene.add(m);
    this.mesh = m; if (this.ol) this.olm = addOutlineTo(m, this.ol);
    return m;
  };

  /* 먹선 외곽선: 뒷면을 살짝 키워서 그려요 */
  const olCache = {};
  function olMat(w) {
    if (olCache[w]) return olCache[w];
    const m = new THREE.MeshBasicMaterial({ color: '#39283f', side: THREE.BackSide, fog: true });
    m.onBeforeCompile = function (sh) { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed=position+normalize(normal)*' + w.toFixed(4) + ';'); };
    m.customProgramCacheKey = function () { return 'ol' + w; };
    return (olCache[w] = m);
  }
  function addOutlineTo(m, w) {
    const o = new THREE.InstancedMesh(m.geometry, olMat(w), m.count);
    o.instanceMatrix = m.instanceMatrix; o.count = m.count; o.frustumCulled = false; o.castShadow = false; o.receiveShadow = false; o.renderOrder = -1;
    scene.add(o); return o;
  }

  /* 부드러운 원형 글로우 / 그림자 텍스처 */
  const glowTex = ctex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const blobTex = ctex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const rectTex = ctex(64, 64, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); const gx = g.createLinearGradient(0, 0, w, 0); gx.addColorStop(0, '#000'); gx.addColorStop(0.2, '#fff'); gx.addColorStop(0.8, '#fff'); gx.addColorStop(1, '#000'); const c2 = document.createElement('canvas'); c2.width = w; c2.height = h; const g2 = c2.getContext('2d'); g2.fillStyle = gx; g2.fillRect(0, 0, w, h); g2.globalCompositeOperation = 'multiply'; const gy = g2.createLinearGradient(0, 0, 0, h); gy.addColorStop(0, '#000'); gy.addColorStop(0.2, '#fff'); gy.addColorStop(0.8, '#fff'); gy.addColorStop(1, '#000'); g2.fillStyle = gy; g2.fillRect(0, 0, w, h); g.drawImage(c2, 0, 0); });
  city.blobTex = blobTex;

  /* ── 붓으로 그린 듯한 텍스처 · 카드 ── */
  const windU = { value: 0 }, playerU = { value: new THREE.Vector4(0, -50, 0, 0.8) }, cardTint = { value: new THREE.Color(1.0, 0.98, 0.93) };
  function pntTex(w, h, fn, seed) { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), mulberry32(seed), w, h); const t = new THREE.CanvasTexture(c); t.anisotropy = aniso; return t; }
  function dabE(x, px, py, rx, ry, rot, col, al) { x.save(); x.translate(px, py); x.rotate(rot); x.globalAlpha = al; x.fillStyle = col; x.beginPath(); x.ellipse(0, 0, rx, ry, 0, 0, 6.2832); x.fill(); x.restore(); }
  const PAL = {
    gA: ['#2c6e55', '#3f9a54', '#79c45a', '#c7e66a'], gB: ['#2a6a58', '#4aa35a', '#8acb62', '#d6ea70'],
    yA: ['#a8651e', '#d9962c', '#f2c94e', '#fff0a0'], oA: ['#9c3f2a', '#d46a2e', '#f09b48', '#ffd88a']
  };
  function crownTex(seed, pal) {
    return pntTex(512, 512, (x, r) => {
      const blobs = [];
      for (let i = 0; i < 10; i++) { const a = r() * 6.283, d = Math.sqrt(r()) * 105; blobs.push({ x: 256 + Math.cos(a) * d * 1.15, y: 262 + Math.sin(a) * d * 0.85, r: 62 + r() * 52 }); }
      blobs.forEach(b => dabE(x, b.x, b.y, b.r, b.r * 0.9, 0, pal[0], 1));
      for (let i = 0; i < 1150; i++) {
        const b = blobs[Math.floor(r() * blobs.length)], a = r() * 6.283, d = Math.sqrt(r()) * b.r * 1.02;
        const px = b.x + Math.cos(a) * d, py = b.y + Math.sin(a) * d * 0.92;
        let L = 0.5 + 0.5 * (((b.x - px) * 0.7 + (b.y - py) * 0.9) / b.r) + (r() - 0.5) * 0.4 - 0.22 * ((py - 180) / 280 - 0.3);
        L = Math.max(0, Math.min(1, L));
        dabE(x, px, py, 5 + r() * 14, 3.5 + r() * 8, r() * 6.283, L < 0.22 ? pal[0] : L < 0.5 ? pal[1] : L < 0.8 ? pal[2] : pal[3], 0.85);
      }
    }, seed);
  }
  function tuftTex(seed) {
    return pntTex(256, 256, (x, r) => {
      const cols = [['#2f7a4e', '#4fa857'], ['#3a8c52', '#7bc45c'], ['#46a057', '#a5d964'], ['#58b05c', '#c8e86e']];
      for (let i = 0; i < 14; i++) {
        const bx = 128 + (r() - 0.5) * 110, tipx = bx + (r() - 0.5) * 120, tipy = 20 + r() * 110, w = 7 + r() * 8, cp = (r() - 0.5) * 50;
        const c = cols[Math.floor(r() * cols.length)], g = x.createLinearGradient(0, 250, 0, tipy);
        g.addColorStop(0, c[0]); g.addColorStop(1, c[1]); x.fillStyle = g;
        x.beginPath(); x.moveTo(bx - w, 252); x.quadraticCurveTo(bx + cp - w * 0.4, (252 + tipy) / 2, tipx, tipy); x.quadraticCurveTo(bx + cp + w * 0.4, (252 + tipy) / 2, bx + w, 252); x.closePath(); x.fill();
      }
    }, seed);
  }
  function flowerTex(seed) {
    return pntTex(128, 256, (x, r) => {
      x.strokeStyle = '#4d9a55'; x.lineWidth = 5; x.lineCap = 'round'; x.beginPath(); x.moveTo(64, 250); x.quadraticCurveTo(58, 170, 64, 96); x.stroke();
      x.fillStyle = '#5aa85a'; [[64, 205, -1], [62, 172, 1]].forEach(a => { x.beginPath(); x.ellipse(a[0] + a[2] * 16, a[1], 17, 6, a[2] * -0.5, 0, 6.283); x.fill(); });
      x.fillStyle = '#ffffff'; for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283; x.beginPath(); x.ellipse(64 + Math.cos(a) * 17, 70 + Math.sin(a) * 17, 14, 9, a, 0, 6.283); x.fill(); }
      x.fillStyle = '#ffee9a'; x.beginPath(); x.arc(64, 70, 9, 0, 6.283); x.fill();
    }, seed);
  }
  function cloudTex2(seed) {
    return pntTex(512, 256, (x, r) => {
      const dabs = [];
      for (let i = 0; i < 30; i++) { const t = r(), bx = 60 + t * 392, edge = Math.abs(t - 0.5) * 2, br = (30 + r() * 44) * (1 - edge * 0.5), by = 168 - br * 0.55 - (1 - edge) * r() * 30; dabs.push([bx, by, br]); }
      dabs.forEach(d => { const g = x.createRadialGradient(d[0], d[1], d[2] * 0.1, d[0], d[1], d[2]); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.75, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.beginPath(); x.arc(d[0], d[1], d[2], 0, 6.283); x.fill(); });
      x.globalCompositeOperation = 'source-atop';
      for (let i = 0; i < 280; i++) {
        const d = dabs[Math.floor(r() * dabs.length)], a = r() * 6.283, dd = Math.sqrt(r()) * d[2], px = d[0] + Math.cos(a) * dd, py = d[1] + Math.sin(a) * dd * 0.8, low = (py - 100) / 90;
        dabE(x, px, py, 8 + r() * 16, 4 + r() * 8, r() * 0.8 - 0.4, low > 0.55 ? '#b9c3e6' : low > 0.25 ? '#d6dcf1' : (px > 316 ? '#fff0cc' : '#ffffff'), 0.5);
      }
      x.globalCompositeOperation = 'destination-in';
      const mg = x.createLinearGradient(0, 172, 0, 206); mg.addColorStop(0, 'rgba(0,0,0,1)'); mg.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = mg; x.fillRect(0, 0, 512, 256);
    }, seed);
  }
  const groundBase = (function () {
    const t = pntTex(512, 512, (x, r) => {
      x.fillStyle = '#e9e9e9'; x.fillRect(0, 0, 512, 512);
      const tints = ['#ffffff', '#fbffd0', '#d8f4ea', '#f0e8ff', '#fff0bd', '#cfe6c8'];
      const stroke = (px, py, rx, ry, rot, col, al) => { for (let ox = -512; ox <= 512; ox += 512) for (let oy = -512; oy <= 512; oy += 512) { const X = px + ox, Y = py + oy; if (X < -90 || X > 600 || Y < -90 || Y > 600) continue; dabE(x, X, Y, rx, ry, rot, col, al); } };
      for (let i = 0; i < 130; i++) stroke(r() * 512, r() * 512, 40 + r() * 60, 10 + r() * 18, (r() - 0.5) * 0.5, tints[Math.floor(r() * tints.length)], 0.55);
      for (let i = 0; i < 950; i++) stroke(r() * 512, r() * 512, 6 + r() * 14, 2 + r() * 4, -0.9 + (r() - 0.5) * 0.9, r() < 0.5 ? '#b9cfae' : '#ffffff', 0.4);
    }, 101);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  })();
  function groundTexR(rep) { const t = groundBase.clone(); t.repeat.set(rep, rep); t.needsUpdate = true; return t; }
  const CARD_GEO = new THREE.PlaneGeometry(1, 1);
  function cardMesh(tex, count, o) {
    o = o || {};
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib['fog'], { map: { value: tex }, uSway: { value: o.sway || 0.05 } }]),
      vertexShader: [
        'uniform float uTime;uniform float uSway;uniform vec4 uPlayer;varying vec2 vUv;varying vec3 vCol;',
        '#include <fog_pars_vertex>',
        'void main(){ vUv=uv;',
        ' #ifdef USE_INSTANCING_COLOR', ' vCol=instanceColor;', ' #else', ' vCol=vec3(1.0);', ' #endif',
        ' vec3 ip=vec3(instanceMatrix[3]); float sx=length(vec3(instanceMatrix[0])),sy=length(vec3(instanceMatrix[1]));',
        ' vec3 right=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]);',
        ' vec3 wp=ip+right*position.x*sx+vec3(0.0,1.0,0.0)*position.y*sy;',
        ' float sw=sin(uTime*0.9+ip.x*0.31+ip.z*0.23)+0.4*sin(uTime*1.7+ip.x*0.7-ip.z*0.5);',
        ' wp.x+=sw*uSway*(position.y+0.5)*sy;',
        ' vec2 dd=wp.xz-uPlayer.xz;float dl=length(dd);',
        ' float bend=(1.0-smoothstep(0.2,uPlayer.w+1.0,dl))*pow(position.y+0.5,1.6)*step(uPlayer.y,0.6);',
        ' wp.xz+=dd/max(dl,0.05)*bend*0.7*sy;wp.y-=bend*0.18*sy;',
        ' vec4 mvPosition=viewMatrix*vec4(wp,1.0); gl_Position=projectionMatrix*mvPosition;',
        '#include <fog_vertex>', '}'].join('\n'),
      fragmentShader: [
        'uniform sampler2D map;uniform vec3 uTint;varying vec2 vUv;varying vec3 vCol;',
        '#include <fog_pars_fragment>',
        'void main(){ vec4 t=texture2D(map,vUv); if(t.a<0.35)discard; vec3 col=(t.rgb/t.a)*vCol*uTint; gl_FragColor=vec4(col,t.a);',
        '#include <fog_fragment>', '}'].join('\n'),
      side: THREE.DoubleSide, fog: true, alphaToCoverage: true
    });
    mat.uniforms.uTint = cardTint; mat.uniforms.uTime = windU; mat.uniforms.uPlayer = playerU;
    const m = new THREE.InstancedMesh(CARD_GEO, mat, Math.max(1, count)); m.count = count; m.frustumCulled = false; scene.add(m); return m;
  }
  function cardSet(tex, list, o) {
    if (!list.length) return null; const m = cardMesh(tex, list.length, o), col = new THREE.Color();
    list.forEach((c, i) => { tmp.position.set(c.x, c.y, c.z); tmp.rotation.set(0, 0, 0); tmp.scale.set(c.w, c.h, 1); tmp.updateMatrix(); m.setMatrixAt(i, tmp.matrix); col.set(c.c); m.setColorAt(i, col); });
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; return m;
  }
  const cardJit = () => { const c = new THREE.Color(['#ffffff', '#f4ffe8', '#eaf8f0', '#fff8e2'][Math.floor(rnd() * 4)]); return c.multiplyScalar(0.86 + rnd() * 0.14); };

  const shadowBlobs = [], shadowRects = [], glowPts = [];
  function shadow(x, z, sx, sz, ry, a) { shadowBlobs.push([x, z, sx, sz, ry || 0, (a == null ? 1 : a) * 0.45]); }
  function shadowRect(x, z, sx, sz, ry) { shadowRects.push([x, z, sx, sz, ry || 0]); }
  function glow(x, y, z) { glowPts.push(x, y, z); }

  /* ═════════ 하늘 · 안개 · 빛 ═════════ */
  scene.background = new THREE.Color(FOG);
  scene.fog = new THREE.Fog(FOG, 55, 300);
  const hemiL = new THREE.HemisphereLight('#d8ecff', '#a8b47c', 0.56); scene.add(hemiL);
  const sunL = new THREE.DirectionalLight('#fff0cf', 0.62); sunL.position.copy(sunDir).multiplyScalar(120); scene.add(sunL); scene.add(sunL.target);
  const SHR = (OPT && OPT.touch) ? 1024 : 2048;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
  sunL.castShadow = true; sunL.shadow.mapSize.set(SHR, SHR); { const c = sunL.shadow.camera; c.left = -46; c.right = 46; c.top = 46; c.bottom = -46; c.near = 5; c.far = 260; c.updateProjectionMatrix(); }
  sunL.shadow.bias = -0.0007; sunL.shadow.normalBias = 0.06;

  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uSun: { value: sunDir }, uTop: { value: new THREE.Color('#3d80e0') }, uMid: { value: new THREE.Color('#99c9f2') }, uHor: { value: new THREE.Color(FOG) }, uSunCol: { value: new THREE.Color('#ffd89a') }, uNight: { value: 0.1 }, uTex: { value: null }, uTexMix: { value: 0 } },
    vertexShader: 'varying vec3 vD; void main(){ vD=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: [
      'varying vec3 vD; uniform vec3 uSun,uTop,uMid,uHor,uSunCol; uniform float uNight,uTexMix; uniform sampler2D uTex;',
      'float hs(vec3 p){p=fract(p*0.3183099+0.1);p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}',
      'void main(){ vec3 d=normalize(vD); float h=d.y;',
      ' vec3 hor=uHor; vec3 mid=uMid; vec3 top=uTop;',
      ' vec3 c=mix(hor,mid,smoothstep(0.0,0.20,h)); c=mix(c,top,smoothstep(0.16,0.78,h));',
      ' vec3 cp=c;',
      ' float s=max(dot(d,uSun),0.0);',
      ' c+=uSunCol*(pow(s,5.0)*0.38*(1.0-0.75*uNight)+pow(s,36.0)*0.6)+mix(vec3(1.0,0.98,0.9),uSunCol,0.4)*smoothstep(0.9986-0.0012*uNight,0.9996-0.0008*uNight,s)*1.6;',
      ' vec3 q=d*130.0; vec3 cl=floor(q); float sr=step(0.9972,hs(cl)); float sd=length(fract(q)-0.5); c+=vec3(1.0,0.97,0.9)*sr*smoothstep(0.38,0.0,sd)*smoothstep(0.08,0.4,h)*uNight*(0.6+0.4*hs(cl+7.0));',
      ' if(uTexMix>0.0){ float az=atan(uSun.z,uSun.x)/6.2831853; vec2 uv=vec2(fract(atan(d.z,d.x)/6.2831853-az+0.5796),clamp(0.5+asin(clamp(max(h,0.0),0.0,1.0))/3.1415926,0.0,1.0));',
      '   vec3 tx=texture2D(uTex,uv).rgb*vec3(1.04,1.0,0.97); tx*=mix(vec3(1.0),clamp(uMid/vec3(0.60,0.79,0.95),0.3,1.7),clamp(uNight*2.2,0.0,1.0)); tx=mix(tx,hor*1.05,(1.0-smoothstep(0.0,0.16,h))*0.75); float dayK=(1.0-smoothstep(0.35,0.9,uNight))*uTexMix; c=mix(c,tx+uSunCol*pow(s,60.0)*0.25,dayK); }',
      ' c=mix(c,hor,(1.0-smoothstep(-0.12,0.02,h)));',
      ' gl_FragColor=vec4(c,1.0); }'
    ].join('\n')
  });
  new THREE.TextureLoader().load('/models/sky.jpg', tx => { tx.wrapS = THREE.RepeatWrapping; tx.minFilter = THREE.LinearFilter; tx.generateMipmaps = false; skyMat.uniforms.uTex.value = tx; skyMat.uniforms.uTexMix.value = 1; });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(470, 48, 28), skyMat); sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);

  /* 물감 구름 */
  const cloudTexA = [cloudTex2(31), cloudTex2(32), cloudTex2(33)];
  const clouds = new THREE.Group();
  for (let i = 0; i < 16; i++) {
    const m = new THREE.SpriteMaterial({ map: cloudTexA[i % 3], transparent: true, depthWrite: false, fog: false, opacity: R(0.85, 1.0), color: i % 4 === 0 ? '#fff1dc' : '#ffffff' });
    const sp = new THREE.Sprite(m); const az = i / 16 * TAU + R(-0.15, 0.15), el = R(0.10, 0.40); const dist = 400;
    sp.position.set(Math.cos(az) * dist * Math.cos(el), Math.sin(el) * dist, Math.sin(az) * dist * Math.cos(el));
    const sc = R(190, 330); sp.scale.set(sc, sc * 0.42, 1); clouds.add(sp);
  }
  scene.add(clouds);

  /* ═════════ 바닥 ═════════ */
  const base = mesh(new THREE.CircleGeometry(440, 48), M('#86c566', { map: groundTexR(56) }), 0, -0.04, 0); base.rotation.x = -Math.PI / 2;

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
  const plaza = mesh(new THREE.CircleGeometry(62, 96), toonMat({ map: paverTex, color: '#c4b59c' }), 0, 0, 0); plaza.rotation.x = -Math.PI / 2;

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
  const paint = mesh(new THREE.CircleGeometry(62, 96), toonMat({ map: paintTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 0, 0.03, 0); paint.rotation.x = -Math.PI / 2;

  // 순환 도로 + 보도
  const asphalt = M('#6b6877');
  const roadRing = mesh(new THREE.RingGeometry(61.9, 77, 128), asphalt, 0, 0.02, 0); roadRing.rotation.x = -Math.PI / 2;
  const walkRing = mesh(new THREE.RingGeometry(77, 85, 128), M('#c6b396'), 0, 0.05, 0); walkRing.rotation.x = -Math.PI / 2;
  const curb = new THREE.Mesh(new THREE.LatheGeometry([[60.3, 0], [60.3, 0.3], [61.7, 0.3], [61.7, 0]].map(p => new THREE.Vector2(p[0], p[1])), 128), M('#c2b19f', { side: THREE.DoubleSide })); scene.add(curb);
  // 중앙선(점선) · 횡단보도 · 대로
  { const dash = new Inst(unit, M('#f3dca2'));
    for (let i = 0; i < 90; i++) { const a = i / 90 * TAU, r = 67.25; dash.add(Math.cos(a) * r, 0.045, Math.sin(a) * r, Math.atan2(-Math.sin(a), Math.cos(a)) + 0, 0.22, 0.02, 2.6, null); }
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
  function tri(a, b, c, tint) {
    let n = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])];
    if (n[1] < 0) { const t = a; a = b; b = t; n = [-n[0], -n[1], -n[2]]; }
    const l = Math.hypot(n[0], n[1], n[2]) || 1, o = bp.length / 3;
    [a, b, c].forEach(q => { bp.push(q[0], q[1], q[2]); bn.push(n[0] / l, n[1] / l, n[2] / l); bt.push(tint[0], tint[1], tint[2]); bi.push(0, 0, 1, -1); bu.push(0, 0); });
    bx.push(o, o + 1, o + 2);
  }
  const ROOFC = ['#c9654a', '#d28a4a', '#4f8f8a', '#6f7fb0', '#b5523f', '#7aa06a', '#8a5a7a'];
  function addRoof(cx, cz, w, d, y, ry) {
    const f = frame(cx, cz, ry), o = 0.7, hx = w / 2 + o, hz = d / 2 + o, apexH = Math.min(14, Math.max(3.2, Math.min(w, d) * 0.5));
    const c = [[-hx, -hz], [-hx, hz], [hx, hz], [hx, -hz]].map(q => { const wp = f.w(q[0], q[1]); return [wp[0], y, wp[1]]; });
    const ap = f.w(0, 0), A = [ap[0], y + apexH, ap[1]], tint = jit(ROOFC[Math.floor(rnd() * ROOFC.length)], 0.05);
    for (let i = 0; i < 4; i++) tri(c[i], c[(i + 1) % 4], A, tint);
    addBox(cx, cz, w + 0.9, d + 0.9, y - 0.7, y + 0.1, ry, jit('#f0e4d0', 0.03), 0, 0, -1);
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
  const TINTS = ['#d9c7b0', '#c9d8cf', '#e3b9a6', '#b9cfdc', '#e8d5a8', '#a9c4cc', '#d2bfd6', '#efc9a0', '#b5d1b8'];
  const towerRegs = [];
  function addTower(cx, cz, w, d, h, ry, shop, hazy) {
    towerRegs.push([cx, cz, Math.hypot(w, d) * 0.5]);
    const tint = TINTS[Math.floor(rnd() * TINTS.length)], seed = Math.floor(rnd() * 900), glass = rnd() < 0.45 ? 1 : 0, bias = R(0.65, 1.2);
    const mode = rnd();
    if (mode < 0.35) addBox(cx, cz, w, d, 0, h, ry, jit(tint), seed, bias, (shop ? 2 : 0) + glass);
    else if (mode < 0.72) { const ph = R(6, 11); addBox(cx, cz, w, d, 0, ph, ry, jit(TINTS[Math.floor(rnd() * TINTS.length)]), seed, bias, shop ? 2 : 0); addBox(cx, cz, w * 0.72, d * 0.72, ph, h, ry, jit(tint), seed + 1, bias, glass); }
    else { const h1 = h * 0.5, h2 = h * 0.8; addBox(cx, cz, w, d, 0, h1, ry, jit(tint), seed, bias, (shop ? 2 : 0) + glass); addBox(cx, cz, w * 0.78, d * 0.78, h1, h2, ry, jit(tint), seed + 2, bias, glass); addBox(cx, cz, w * 0.5, d * 0.5, h2, h, ry, jit(tint), seed + 3, bias, glass); }
    const wt = mode < 0.35 ? w : mode < 0.72 ? w * 0.72 : w * 0.5, dt = mode < 0.35 ? d : mode < 0.72 ? d * 0.72 : d * 0.5;
    if (rnd() < 0.62) addRoof(cx, cz, wt, dt, h, ry);
    else {
      addBox(cx, cz, w * 0.3, d * 0.3, h, h + 2.4, ry, [0.55, 0.52, 0.5], 0, 0, -1);
      if (rnd() < 0.55) addBox(cx, cz, 0.5, 0.5, h + 2.4, h + 2.4 + R(6, 20), ry, [0.4, 0.38, 0.42], 0, 0, -1);
    }
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
  const BILL = [112, 292], BILL_ANG = BILL;
  // (광장 바로 바깥의 낮은 구역은 아래 '동네 집들'로 채워요)
  skyline(112, 130, 30, [20, 32], [70, 150], false);
  skyline(158, 205, 32, [26, 40], [110, 230], false);
  skyline(235, 300, 30, [34, 52], [150, 300], false);
  // 건물 두 곳(전광판 없음)
  BILL.forEach((deg, i) => {
    const w = 26, d = 15, h = 48, rc = 86 + d / 2; const [cx, cz] = P(deg, rc); const ry = faceCenter(cx, cz);
    addBox(cx, cz, w, d, 0, h, ry, jit('#8d94b4'), 500 + i, 1.0, 3);
    addBox(cx, cz, w * 0.3, d * 0.3, h, h + 2.4, ry, [0.5, 0.48, 0.55], 0, 0, -1);
  });
  const bGeo = new THREE.BufferGeometry();
  bGeo.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3)); bGeo.setAttribute('normal', new THREE.Float32BufferAttribute(bn, 3));
  bGeo.setAttribute('aTint', new THREE.Float32BufferAttribute(bt, 3)); bGeo.setAttribute('aUV', new THREE.Float32BufferAttribute(bu, 2)); bGeo.setAttribute('aInfo', new THREE.Float32BufferAttribute(bi, 4));
  bGeo.setIndex(bx);
  const bMat = new THREE.ShaderMaterial({
    uniforms: { uFog: { value: new THREE.Color(FOG) }, uNear: { value: 55 }, uFar: { value: 300 }, uNight: { value: NIGHT }, uSun: { value: sunDir }, uAmbTop: { value: new THREE.Color('#fbefe0') }, uAmbBot: { value: new THREE.Color('#99a0bc') }, uSunCol: { value: new THREE.Color('#ffdba3') } },
    vertexShader: [
      'attribute vec3 aTint; attribute vec2 aUV; attribute vec4 aInfo;',
      'varying vec3 vW; varying vec3 vN; varying vec3 vT; varying vec2 vUV; varying vec4 vI;',
      'void main(){ vW=position; vN=normal; vT=aTint; vUV=aUV; vI=aInfo; gl_Position=projectionMatrix*viewMatrix*vec4(position,1.0); }'
    ].join('\n'),
    fragmentShader: [
      'uniform vec3 uFog; uniform float uNear; uniform float uFar; uniform float uNight; uniform vec3 uSun; uniform vec3 uAmbTop; uniform vec3 uAmbBot; uniform vec3 uSunCol;',
      'varying vec3 vW; varying vec3 vN; varying vec3 vT; varying vec2 vUV; varying vec4 vI;',
      'float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }',
      'float vn(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h21(i),h21(i+vec2(1.0,0.0)),f.x),mix(h21(i+vec2(0.0,1.0)),h21(i+vec2(1.0,1.0)),f.x),f.y); }',
      'void main(){',
      ' vec3 N=normalize(vN); bool roof=N.y>0.5; float sunF=smoothstep(0.04,0.6,max(dot(N,uSun),0.0));',
      ' vec3 amb=mix(uAmbBot,uAmbTop,clamp(N.y*0.5+0.5,0.0,1.0));',
      ' float nz=vn(vW.xz*0.10+vW.y*0.045)*0.55+vn(vec2(vUV.x*0.9,vUV.y*0.5)+fract(floor(vI.x+0.5)*0.37)*9.0)*0.45;',
      ' vec3 wall=vT*(0.88+0.22*nz)*(0.94+0.12*vn(vec2(vW.x*0.5+vW.z*0.5,vW.y*2.2)));',
      ' float hy=clamp(vW.y/max(vI.z,1.0),0.0,1.0);',
      ' wall*=mix(0.80,1.0,smoothstep(0.0,0.30,hy));',
      ' vec3 light=amb+uSunCol*sunF;',
      ' vec3 col=wall*light;',
      ' if(!roof && vI.w>-0.5){',
      '  vec2 cell=floor(vUV); vec2 f=fract(vUV);',
      '  float st=floor(vI.w+0.5); bool glass=mod(st,2.0)>0.5; bool shop=st>1.5; bool row=shop && vUV.y<1.0;',
      '  vec2 lo=glass?vec2(0.05,0.07):vec2(0.20,0.20); vec2 hi=glass?vec2(0.95,0.93):vec2(0.80,0.78);',
      '  if(row){ lo=vec2(0.06,0.10); hi=vec2(0.94,0.90); }',
      '  float m=smoothstep(lo.x,lo.x+0.04,f.x)*(1.0-smoothstep(hi.x-0.04,hi.x,f.x))*smoothstep(lo.y,lo.y+0.04,f.y)*(1.0-smoothstep(hi.y-0.04,hi.y,f.y));',
      '  float sd=floor(vI.x+0.5); float rnd=h21(cell+vec2(fract(sd*0.618)*41.0,fract(sd*0.381)*29.0));',
      '  float lit=step(rnd,mix(0.10,0.80,uNight)*vI.y); if(row) lit=1.0;',
      '  vec3 sky=mix(vec3(0.40,0.60,0.86),vec3(0.98,0.80,0.62),pow(sunF,1.4)*0.9+0.08);',
      '  vec3 gl=(glass?sky*0.95+vec3(0.0,0.03,0.07):sky*0.7)*(0.75+0.25*light.r)*mix(1.0,0.32,uNight);',
      '  vec3 warm=mix(vec3(1.0,0.72,0.38),vec3(1.0,0.94,0.80),h21(cell+vec2(3.1,fract(sd*0.7)*17.0)));',
      '  vec2 cq=(f-0.5*(lo+hi))/(0.5*(hi-lo)); float rr=length(max(abs(cq)-vec2(0.70),0.0));',
      '  bool plain=!glass&&!row; if(plain){ m=1.0-smoothstep(0.22,0.30,rr); }',
      '  vec3 win=mix(gl,warm*(0.95+0.45*rnd),lit); win*=0.86+0.22*f.y;',
      '  col=mix(col,win,m*0.94);',
      '  if(plain){ float mF=1.0-smoothstep(0.34,0.44,rr); vec3 fc=vec3(0.97,0.93,0.85)*(0.68+0.32*light); col=mix(col,fc,(mF-m)*0.9); float mul=max(step(abs(cq.x),0.05),step(abs(cq.y),0.04)); col=mix(col,fc*0.96,mul*m*0.85); float sill=step(0.0,-cq.y-0.96)*step(-cq.y-1.12,0.0)*step(abs(cq.x),1.0); col=mix(col,fc*0.9,sill*0.8); }',
      '  col*=1.0-0.10*smoothstep(0.0,0.12,lo.y-f.y+0.04)*(1.0-m);',
      ' }',
      ' col+=uSunCol*sunF*smoothstep(0.55,1.0,hy)*0.12;',
      ' if(roof && N.y<0.97){ col*=1.0-0.16*smoothstep(0.55,0.64,fract(vW.y*1.7+vn(vW.xz*0.35)*0.35)); }',
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
  const trunkI = new Inst(new THREE.CylinderGeometry(0.17, 0.34, 1, 9), M('#7d5c47')); trunkI.ol = 0.025;
  function lumpyGeo(amp, seed) {
    const g = new THREE.SphereGeometry(1, 18, 14), r = mulberry32(seed), pos = g.attributes.position, v = new THREE.Vector3(), q = [r() * 6, r() * 6, r() * 6, r() * 6, r() * 6, r() * 6];
    const cols = new Float32Array(pos.count * 3), lo = new THREE.Color('#b3bfd2'), hi = new THREE.Color('#ffffff'), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = Math.sin(v.x * 3.3 + q[0]) * Math.sin(v.y * 2.9 + q[1]) * Math.sin(v.z * 3.1 + q[2]) + 0.5 * Math.sin(v.x * 6.1 + q[3]) * Math.sin(v.z * 5.7 + q[4]) * Math.sin(v.y * 6.3 + q[5]);
      v.multiplyScalar(1 + n * amp); pos.setXYZ(i, v.x, v.y, v.z);
      c.copy(lo).lerp(hi, Math.pow(Math.min(1, Math.max(0, (v.y + 1) / 2)), 0.75)); cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); g.computeVertexNormals(); return g;
  }
  const leafMap = pntTex(256, 256, (x, r) => {
    x.fillStyle = '#e4e9e4'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 520; i++) { const px = r() * 256, py = r() * 256, rr = 6 + r() * 13, gv = r() < 0.58 ? 255 : 186 + Math.floor(r() * 46); for (let ox = -256; ox <= 256; ox += 256) { const X = px + ox; if (X < -30 || X > 290) continue; dabE(x, X, py, rr, rr * 0.62, r() * 6.28, 'rgb(' + gv + ',' + gv + ',' + gv + ')', 0.55); } }
  }, 71);
  leafMap.wrapS = leafMap.wrapT = THREE.RepeatWrapping; leafMap.repeat.set(3.0, 2.2);
  /* 잎은 햇빛이 비쳐 보이도록 그늘을 더 밝게 */
  const gradLeaf = new THREE.DataTexture(new Uint8Array([
    206, 212, 192, 255, 206, 212, 192, 255, 206, 212, 192, 255,
    234, 234, 224, 255, 234, 234, 224, 255,
    255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255]), 8, 1, THREE.RGBAFormat);
  gradLeaf.minFilter = gradLeaf.magFilter = THREE.NearestFilter; gradLeaf.generateMipmaps = false; gradLeaf.needsUpdate = true;
  const leafMat = toonMat({ color: '#ffffff', map: leafMap, vertexColors: true, gradientMap: gradLeaf });
  { const ob = leafMat.onBeforeCompile; leafMat.onBeforeCompile = function (sh) { ob(sh); sh.uniforms.uTime = windU; sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed=vec3(position);\n#ifdef USE_INSTANCING\n vec2 ip=instanceMatrix[3].xz;\n#else\n vec2 ip=vec2(0.0);\n#endif\n transformed.xz+=vec2(sin(uTime*1.1+ip.x*0.3+ip.y*0.2),cos(uTime*0.9+ip.y*0.3))*0.05*(position.y+1.0);'); }; leafMat.customProgramCacheKey = () => 'leafwind'; }
  const leafGeos = [lumpyGeo(0.16, 5), lumpyGeo(0.2, 9)];
  const leafI = [new Inst(leafGeos[0], leafMat), new Inst(leafGeos[1], leafMat)]; 
  const LEAFC = [['#63c052', '#80d158', '#52ad5e', '#95d860'], ['#f8d264', '#f2c04e', '#ffe492'], ['#f5a055', '#ea8b4c', '#ffbd7c']];
  const branchI = new Inst(new THREE.CylinderGeometry(0.5, 1, 1, 6), M('#7d5c47'));
  const treeTufts = [];
  function tree(x, z, s) {
    s = s || 1; trunkI.add(x, 1.3 * s, z, 0, s, 2.6 * s, s);
    const q = rnd(), pal = LEAFC[q < 0.80 ? 0 : q < 0.93 ? 1 : 2], pc = () => pal[Math.floor(rnd() * pal.length)], ry0 = R(0, 6.28);
    const blob = (dx, dy, dz, rr, sy) => leafI[Math.floor(rnd() * 2)].add(x + dx * s, dy * s, z + dz * s, R(0, 6.28), rr * s, rr * (sy || 0.88) * s, rr * s, pc(), R(-0.15, 0.15));
    blob(0, 4.2, 0, 2.4);
    for (let k = 0; k < 5; k++) { const a = ry0 + k / 5 * 6.283 + R(-0.2, 0.2), d = R(1.3, 1.8); blob(Math.cos(a) * d, R(3.5, 4.3), Math.sin(a) * d, R(1.45, 1.9)); }
    blob(R(-0.8, 0.8), 3.0, R(-0.8, 0.8), 2.0, 0.7);
    for (let k = 0; k < 2; k++) { const a = ry0 + k * 3.1 + 0.7; branchI.add(x + Math.cos(a) * 0.45 * s, 2.7 * s, z + Math.sin(a) * 0.45 * s, 0, 0.16 * s, 1.5 * s, 0.16 * s, null, Math.cos(a) * 0.5); }
    city.trees.push([x, z, s]);
    addCircle(x, z, 0.5);
    const pl = mesh(unit, M('#b8a58f'), x, 0.18, z); pl.scale.set(1.5 * s, 0.36, 1.5 * s);
    for (let k = 0; k < 7; k++) { const a = R(0, TAU), d = R(0.45, 0.78) * s, w = R(0.5, 0.95) * s; treeTufts.push({ x: x + Math.cos(a) * d, y: 0.36 + w * 0.4, z: z + Math.sin(a) * d, w, h: w * 0.9, c: cardJit() }); }
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
  function pbox(f, sx, sy, sz, mat, lx, ly, lz, rx) { const m = new THREE.Mesh(unit, mat); m.scale.set(sx, sy, sz); put(m, f, lx, ly, lz, rx); m.receiveShadow = true; m.castShadow = true; scene.add(m); return m; }
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
  bolI.ol = 0.09;
  for (let i = 0; i < 112; i++) { const deg = i * (360 / 112); if (avDist(deg) < 7.5) continue; const [x, z] = P(deg, 60.95); bolI.add(x, 0.45, z, 0, 0.13, 0.9, 0.13); bolCap.add(x, 0.93, z, 0, 0.14, 0.1, 0.14); }

  /* ═════════ 벤치 ═════════ */
  const benchSeat = new Inst(unit, M('#ffffff')), benchBack = new Inst(unit, M('#ffffff')), benchLeg = new Inst(unit, M('#3f3b4d'));
  benchSeat.ol = benchBack.ol = 0.035;
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

  /* ═════════ 카페 (큰 건물 · 내부 좌석 · 카운터 · 네온 · 메뉴판) ═════════ */
  const ZN_BINS = [[3.8, -1.9], [-3.8, -1.9]];
  const CAFE_NAME = 'CAFFEINE_DEALER';                      // 가게 이름: 여기만 바꾸면 간판·네온·메뉴판 전부 바뀌어요
  {
    const [fx, fz] = P(SPOT.cafe, 44.5), ry = faceCenter(fx, fz), f = frame(fx, fz, ry), BW = 32, BD = 15, BH = 9, HW = BW / 2;
    const wallM = M('#efd9bb'), trimM = M('#2f5c52'), woodM = M('#9a6a45'), darkM = M('#5b3d33');
    const wbox = (x0, x1, y0, y1, z0, z1, mat, cast) => { const m = pbox(f, x1 - x0, y1 - y0, z1 - z0, mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); if (cast === false) m.castShadow = false; return m; };
    const pY = (w, h, mat, lx, ly, lz, dy, rx) => { const m = pplane(f, w, h, mat, lx, ly, lz); m.rotation.order = 'YXZ'; m.rotation.set(rx || 0, f.ry + (dy || 0), 0); return m; };
    const wp = (lx, lz) => f.w(lx, lz);
    const col = (lx0, lx1, lz0, lz1, h) => { const c = wp((lx0 + lx1) / 2, (lz0 + lz1) / 2); addBoxCol(c[0], c[1], (lx1 - lx0) / 2, (lz1 - lz0) / 2, ry, h); };
    // ── 바닥 · 벽 · 지붕
    const floorTex = ctex(512, 512, (g, w, h) => { for (let i = 0; i < 10; i++) { g.fillStyle = 'hsl(30,' + R(30, 38) + '%,' + R(40, 48) + '%)'; g.fillRect(0, i * 51.2, w, 50); g.fillStyle = 'rgba(60,32,18,.4)'; g.fillRect(0, i * 51.2 + 50, w, 2); for (let k = 0; k < 4; k++) { g.fillStyle = 'rgba(60,32,18,.25)'; g.fillRect(R(0, w), i * 51.2, 2, 50); } } }, { repeat: [6, 3] });
    pY(BW - 1, BD - 0.5, toonMat({ map: floorTex }), 0, 0.04, -BD / 2 - 0.1, 0, -Math.PI / 2);
    const slat = ctex(512, 256, (g, w, h) => { g.fillStyle = '#4a3a30'; g.fillRect(0, 0, w, h); for (let i = 0; i < 32; i++) { g.fillStyle = 'rgba(' + (rnd() < 0.5 ? '120,86,60' : '70,52,40') + ',.55)'; g.fillRect(i * 16, 0, 11, h); } }, { repeat: [3, 1] });
    const plaster = ctex(256, 256, (g, w, h) => { g.fillStyle = '#d9d0c4'; g.fillRect(0, 0, w, h); for (let i = 0; i < 160; i++) { g.fillStyle = 'rgba(' + (rnd() < 0.5 ? '255,255,255' : '120,110,100') + ',' + R(0.03, 0.08) + ')'; g.fillRect(R(0, w), R(0, h), R(8, 50), R(6, 30)); } g.fillStyle = '#8b5e3c'; g.fillRect(0, h * 0.72, w, h * 0.28); }, { repeat: [5, 1] });
    pY(BW - 1, BH - 0.2, basic(slat), 0, BH / 2, -BD + 0.28, 0);                                   // 뒷벽 안쪽 (나무 슬랫)
    pY(BD - 0.6, BH - 0.2, toonMat({ map: plaster }), -HW + 0.28, BH / 2, -BD / 2, Math.PI / 2);       // 왼쪽 벽 안쪽
    pY(BD - 0.6, BH - 0.2, toonMat({ map: plaster }), HW - 0.28, BH / 2, -BD / 2, -Math.PI / 2);       // 오른쪽 벽 안쪽
    wbox(-HW, HW, 0, BH, -BD, -BD + 0.5, wallM);                                                          // 뒷벽
    wbox(-HW, -HW + 0.5, 0, BH, -BD, 0, wallM); wbox(HW - 0.5, HW, 0, BH, -BD, 0, wallM);                  // 옆벽
    // 앞벽: 큰 유리창 + 가운데 넓은 출입구(폭 5)
    [-1, 1].forEach(sd => {
      const X = (a, b) => sd > 0 ? [a, b] : [-b, -a];
      const seg = (a, b, y0, y1, mat) => { const [x0, x1] = X(a, b); wbox(x0, x1, y0, y1, -0.55, 0, mat || wallM); };
      seg(2.5, 16, 0, 1.1); seg(2.5, 16, 5.2, BH);                                                         // 창 밑·창 위
      seg(14, 16, 1.1, 5.2); seg(2.5, 4.5, 1.1, 5.2); seg(8.4, 9.1, 1.1, 5.2, trimM);                      // 기둥 · 창살
      const [gx0, gx1] = X(4.5, 14); const gl = pplane(f, 9.5, 4.1, new THREE.MeshBasicMaterial({ color: '#cfe8ee', transparent: true, opacity: 0.16, depthWrite: false }), (gx0 + gx1) / 2, 3.15, -0.3); gl.renderOrder = 3;
      col(...X(2.5, 16), -0.6, 0, BH);
    });
    wbox(-2.5, 2.5, 4.3, BH, -0.55, 0, wallM);                                                             // 출입구 위
    wbox(-2.7, -2.5, 0, 4.3, -0.6, 0.05, trimM); wbox(2.5, 2.7, 0, 4.3, -0.6, 0.05, trimM); wbox(-2.7, 2.7, 4.3, 4.6, -0.6, 0.05, trimM);   // 문틀
    col(-HW, -HW + 0.5, -BD, 0, BH); col(HW - 0.5, HW, -BD, 0, BH); col(-HW, HW, -BD, -BD + 0.5, BH);
    // 지붕 + 천장 (안에 들어오면 지붕을 숨겨서 위에서 내려다볼 수 있게 함)
    const roof = new THREE.Group(); scene.add(roof);
    const roofParts = [];
    { const r1 = pbox(f, BW + 1.2, 0.5, BD + 1.2, M('#b8644a'), 0, BH + 0.25, -BD / 2 + 0.2); r1.castShadow = false; const r2 = pbox(f, BW + 1.2, 0.2, 0.45, M('#8f4a37'), 0, BH + 0.6, 0.55); roofParts.push(r1, r2);
      const ce = pplane(f, BW - 1, BD - 0.5, basic(ctex(64, 64, (g, w, h) => { g.fillStyle = '#f1e2c8'; g.fillRect(0, 0, w, h); })), 0, BH - 0.02, -BD / 2 - 0.1); ce.rotation.set(Math.PI / 2, f.ry, 0); ce.rotation.order = 'YXZ'; ce.rotation.set(Math.PI / 2, f.ry, 0); roofParts.push(ce);
      [[-HW + 3, -BD + 3], [HW - 3, -BD + 3], [0, -BD + 4]].forEach(q => roofParts.push(pbox(f, 1.7, 0.9, 1.3, M('#bdb6c4'), q[0], BH + 1.0, q[1]))); }
    // 줄무늬 차양 · 이름 간판(네온)
    const stripe = ctex(256, 32, (g, w, h) => { for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#f6ebd6' : '#d96b4f'; g.fillRect(i * w / 16, 0, w / 16 + 1, h); } });
    const awn = toonMat({ map: stripe });
    pbox(f, BW - 1.5, 0.12, 2.3, awn, 0, 5.55, 1.1, 0.26); pbox(f, BW - 1.5, 0.42, 0.08, awn, 0, 4.95, 2.18);
    const neonTex = (txt1, txt2, w, h, big) => ctex(w, h, (g, W, H) => {
      g.fillStyle = '#14101c'; g.fillRect(0, 0, W, H); g.lineWidth = 6; g.strokeStyle = 'rgba(255,95,170,.35)'; g.strokeRect(10, 10, W - 20, H - 20);
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '800 ' + big + 'px ' + FONT;
      [['rgba(255,70,160,.35)', 26], ['rgba(255,70,160,.55)', 14], ['#ff8fcb', 4]].forEach(q => { g.shadowColor = '#ff3fa0'; g.shadowBlur = q[1]; g.fillStyle = q[0]; g.fillText(txt1, W / 2, H * 0.4); });
      g.shadowBlur = 0; g.fillStyle = '#fff3fa'; g.fillText(txt1, W / 2, H * 0.4);
      g.font = '700 ' + Math.round(big * 0.46) + 'px ' + FONT; g.shadowColor = '#37d6ff'; g.shadowBlur = 16; g.fillStyle = '#9defff'; g.fillText(txt2, W / 2, H * 0.78); g.shadowBlur = 0; g.fillStyle = '#ecfdff'; g.fillText(txt2, W / 2, H * 0.78);
    });
    const outerNeon = neonTex('CAFFEINE_DEALER', 'COFFEE · BAKERY', 1024, 256, 86);
    pbox(f, 13.2, 3.3, 0.3, M('#241f2e'), 0, 7.35, 0.18); pplane(f, 12.8, 3.0, basic(outerNeon), 0, 7.35, 0.36);
    { const pts = [[-5.6, 8.6], [-1.9, 8.8], [1.9, 8.8], [5.6, 8.6], [-5.6, 6.2], [5.6, 6.2], [0, 7.4]]; pts.forEach(q => { const w = f.w(q[0], 0.9); glow(w[0], q[1], w[1]); }); }
    // 문 앞 작은 입간판 · 화분
    pbox(f, 1.2, 1.6, 0.14, M('#2b2a30'), 4.6, 0.9, 5.6, -0.12); pplane(f, 1.0, 1.35, basic(ctex(128, 170, (g, w, h) => { g.fillStyle = '#26262c'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffd0e8'; g.textAlign = 'center'; g.font = '700 22px ' + FONT; g.fillText('OPEN', 64, 36); g.font = '700 14px ' + FONT; g.fillStyle = '#e8e6ee'; g.fillText('오늘의 커피', 64, 80); g.fillText('별로 주문해요 ✨', 64, 106); })), 4.6, 0.92, 5.7, -0.12);
    // ── 카운터 (끝에서 끝까지) + 뒤 선반
    const CZ = -10.6;
    wbox(-HW + 0.5, HW - 0.5, 0, 1.08, CZ - 0.65, CZ + 0.65, M('#5e3d2a')); wbox(-HW + 0.5, HW - 0.5, 1.08, 1.18, CZ - 0.78, CZ + 0.78, M('#f3ecdc'));
    wbox(-HW + 0.5, HW - 0.5, 0.45, 0.58, CZ + 0.64, CZ + 0.69, trimM);
    col(-HW + 0.5, HW - 0.5, CZ - 0.8, CZ + 0.8, 1.2);
    [[-0.5, 4.9, 1.0], [0.5, 6.8, 0.7]].forEach(() => { });
    // 에스프레소 머신 · 계산대 · 케이크 쇼케이스
    const mach = (lx, w) => { wbox(lx - w / 2, lx + w / 2, 1.18, 1.95, CZ - 0.3, CZ + 0.35, M('#c6cad3')); wbox(lx - w / 2 - 0.05, lx + w / 2 + 0.05, 1.9, 2.05, CZ - 0.34, CZ + 0.4, M('#2d2c36')); [-1, 1].forEach(s => wbox(lx + s * w * 0.22 - 0.06, lx + s * w * 0.22 + 0.06, 1.18, 1.5, CZ + 0.36, CZ + 0.5, M('#2d2c36'))); };
    mach(-4.8, 1.8); mach(3.2, 1.3);
    wbox(-1.6, -0.6, 1.18, 1.55, CZ - 0.3, CZ + 0.3, M('#3c3a46')); wbox(-1.45, -0.75, 1.55, 1.95, CZ - 0.05, CZ + 0.05, M('#2d2c36'));
    wbox(6.0, 9.4, 1.18, 2.1, CZ - 0.5, CZ + 0.55, new THREE.MeshBasicMaterial({ color: '#dff0f4', transparent: true, opacity: 0.22, depthWrite: false }));
    [['#e8c27a', 6.6, 1.28], ['#f1a3b7', 7.5, 1.28], ['#f6e9c8', 8.4, 1.28], ['#c98a5a', 6.6, 1.72], ['#f6e9c8', 7.5, 1.72], ['#e8c27a', 8.4, 1.72]].forEach(c => wbox(c[1] - 0.3, c[1] + 0.3, c[2], c[2] + 0.3, CZ - 0.2, CZ + 0.3, M(c[0])));
    const pastry = ctex(128, 64, (g, w, h) => { g.fillStyle = '#2b2a30'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffe9b0'; g.font = '700 22px ' + FONT; g.textAlign = 'center'; g.fillText('BAKERY', 64, 40); });
    // 뒤 선반 (병 · 컵 · 화분)
    [[-9.5, -1.6], [1.6, 9.5]].forEach(rg => { [2.2, 3.1].forEach(y => wbox(rg[0], rg[1], y, y + 0.1, -BD + 0.5, -BD + 1.1, M('#8a5a3a'))); });
    const bott = new Inst(cyl8, M('#ffffff')), cupI = new Inst(cyl8, M('#ffffff'));
    for (let i = 0; i < 26; i++) { const lx = -9.3 + i * 0.7, row = i % 2; if (lx > -1.7 && lx < 1.7) continue; const w2 = f.w(lx, -BD + 0.8); bott.add(w2[0], 2.3 + row * 0.9 + 0.22, w2[1], 0, 0.11, 0.44, 0.11, ['#6a8f7d', '#b0524a', '#d9a74a', '#7a6aa8', '#e8e0c8'][Math.floor(rnd() * 5)]); }
    bott.build();
    for (let i = 0; i < 8; i++) { const w2 = f.w(2.0 + i * 0.9, -BD + 0.8); cupI.add(w2[0], 2.3 + 0.1, w2[1], 0, 0.2, 0.2, 0.2, ['#f6ebd6', '#6d9c8a', '#c9694c'][i % 3]); } cupI.build();
    // 화분 (선반 위 · 모서리)
    for (let i = 0; i < 9; i++) { const lx = -9 + i * 2.25, w2 = f.w(lx + R(-0.3, 0.3), -BD + 1.0); bushI.add(w2[0], 4.0 + R(0, 0.3), w2[1], 0, R(0.5, 0.8), R(0.35, 0.55), R(0.5, 0.8), rnd() < 0.5 ? '#5e9a56' : '#79ad5a'); }
    [[-HW + 1.2, -BD + 1.2], [HW - 1.2, -BD + 1.2], [-HW + 1.2, -1.2], [HW - 1.2, -1.2]].forEach(q => { const w2 = f.w(q[0], q[1]); planterI.add(w2[0], 0.3, w2[1], ry, 1.0, 0.6, 1.0, '#a9937e'); [0, 1, 2].forEach(k => bushI.add(w2[0] + R(-0.2, 0.2), 0.95 + k * 0.3, w2[1] + R(-0.2, 0.2), 0, 0.5, 0.45, 0.5, '#5e9a56')); });
    // 네온 2개 (뒷벽 위)
    const logoNeon = ctex(256, 256, (g, W, H) => {
      g.fillStyle = '#14101c'; g.fillRect(0, 0, W, H); g.lineWidth = 7; g.strokeStyle = '#37d6ff'; g.shadowColor = '#37d6ff'; g.shadowBlur = 18; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(70, 100); g.lineTo(178, 100); g.lineTo(168, 176); g.quadraticCurveTo(124, 206, 80, 176); g.closePath(); g.stroke();
      g.beginPath(); g.arc(188, 128, 20, -1.2, 1.4); g.stroke();
      g.strokeStyle = '#ff6fb8'; g.shadowColor = '#ff3fa0'; [100, 124, 148].forEach((x, i) => { g.beginPath(); g.moveTo(x, 78); g.bezierCurveTo(x - 10, 62, x + 10, 50, x, 34 - i * 2); g.stroke(); });
      g.shadowBlur = 0; g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.7)'; g.strokeRect(14, 14, W - 28, H - 28);
    });
    const innerNeon = neonTex('CAFFEINE_DEALER', 'COFFEE', 1024, 256, 86);
    pbox(f, 2.9, 2.9, 0.12, M('#1a1622'), -6.2, 6.0, -BD + 0.55); pplane(f, 2.7, 2.7, basic(logoNeon), -6.2, 6.0, -BD + 0.63);
    pbox(f, 7.3, 2.0, 0.12, M('#1a1622'), 0.8, 6.0, -BD + 0.55); pplane(f, 7.1, 1.78, basic(innerNeon), 0.8, 6.0, -BD + 0.63);
    [[-6.2, 7.2], [-6.2, 4.8], [0.8, 7.0], [0.8, 5.0], [-2.0, 6.0], [3.6, 6.0]].forEach(q => { const w2 = f.w(q[0], -BD + 1.2); glow(w2[0], q[1], w2[1]); });
    // 메뉴판 (뒷벽 좌우)
    const M_ITEMS = (typeof DAILY !== 'undefined' && DAILY.MENU) ? DAILY.MENU : [];
    const board = (items, title) => ctex(512, 640, (g, W, H) => {
      g.fillStyle = '#26332e'; g.fillRect(0, 0, W, H); g.strokeStyle = '#e8d9a8'; g.lineWidth = 8; g.strokeRect(12, 12, W - 24, H - 24);
      g.fillStyle = '#f3d58a'; g.font = '800 44px ' + FONT; g.textAlign = 'center'; g.fillText(title, W / 2, 86);
      g.fillStyle = 'rgba(243,213,138,.5)'; g.fillRect(60, 108, W - 120, 3);
      g.textAlign = 'left'; items.forEach((it, i) => { const y = 176 + i * 104; g.fillStyle = '#fbf5e4'; g.font = '700 38px ' + FONT; g.fillText(it.e + ' ' + it.n, 44, y); g.textAlign = 'right'; g.fillStyle = '#ffd36a'; g.fillText('✨ ' + it.p, W - 44, y); g.textAlign = 'left'; g.fillStyle = 'rgba(251,245,228,.25)'; g.fillRect(44, y + 24, W - 88, 2); });
    });
    [[-11.6, M_ITEMS.slice(0, 4), '☕ COFFEE'], [12.0, M_ITEMS.slice(4), '🍓 DRINK & SWEET']].forEach(b => { pbox(f, 5.4, 6.4, 0.1, M('#3a2a20'), b[0], 5.1, -BD + 0.56); pplane(f, 5.0, 6.0, basic(board(b[1], b[2])), b[0], 5.1, -BD + 0.63); });
    // ── 좌석 (모두 앉을 수 있어요)
    const tableTop = new Inst(cyl8, M('#f4ead8')), tableLeg = new Inst(cyl8, M('#4a4352')), chairS = new Inst(unit, M('#ffffff')), chairB = new Inst(unit, M('#ffffff')), stool = new Inst(cyl8, M('#ffffff')), sofaB = new Inst(unit, M('#ffffff'));
    const seat1 = (lx, lz, dir, colr) => {                   // 의자 한 자리 (dir: 바라보는 방향 각도)
      const p = f.w(lx, lz); chairS.add(p[0], 0.46, p[1], dir, 0.46, 0.06, 0.46, colr);
      const bk = frame(p[0], p[1], dir).w(0, -0.22); chairB.add(bk[0], 0.76, bk[1], dir, 0.46, 0.5, 0.05, colr);
      city.benches.push({ x: +p[0].toFixed(2), z: +p[1].toFixed(2), ry: +dir.toFixed(3), n: 1 });
    };
    const tbl = (lx, lz, four) => {
      const p = f.w(lx, lz); tableTop.add(p[0], 0.8, p[1], 0, 0.62, 0.06, 0.62); tableLeg.add(p[0], 0.4, p[1], 0, 0.05, 0.8, 0.05); addCircle(p[0], p[1], 0.9);
      seat1(lx - 0.95, lz, ry + Math.PI / 2, '#5f8d7c'); seat1(lx + 0.95, lz, ry - Math.PI / 2, '#c4694a');
      if (four) { seat1(lx, lz - 0.95, ry, '#d9a74a'); seat1(lx, lz + 0.95, ry + Math.PI, '#7a6aa8'); }
    };
    [[-11.6, -4.2], [-6.4, -4.2], [6.4, -4.2], [11.6, -4.2]].forEach(t => tbl(t[0], t[1], false)); tbl(0, -4.8, true);
    // 창가 바 (창 앞 긴 선반 + 스툴)
    [-1, 1].forEach(sd => { const lx = sd * 9.25; wbox(lx - 4.4, lx + 4.4, 0.95, 1.05, -1.5, -0.8, M('#6e4a33')); [-1, 1].forEach(s2 => wbox(lx + s2 * 4.2 - 0.04, lx + s2 * 4.2 + 0.04, 0, 0.95, -1.3, -1.0, M('#4a4352')));
      [-2.9, 0, 2.9].forEach(o => { const p = f.w(lx + o, -2.2); stool.add(p[0], 0.5, p[1], 0, 0.22, 0.05, 0.22, '#c4694a'); stool.add(p[0], 0.26, p[1], 0, 0.04, 0.52, 0.04, '#4a4352'); city.benches.push({ x: +p[0].toFixed(2), z: +p[1].toFixed(2), ry: +ry.toFixed(3), n: 1 }); }); });
    // 카운터 스툴
    [-6, -3, 0, 3, 6].forEach(lx => { const p = f.w(lx, -8.7); stool.add(p[0], 0.62, p[1], 0, 0.24, 0.06, 0.24, '#5f8d7c'); stool.add(p[0], 0.3, p[1], 0, 0.045, 0.6, 0.045, '#4a4352'); city.benches.push({ x: +p[0].toFixed(2), z: +p[1].toFixed(2), ry: +(ry + Math.PI).toFixed(3), n: 1 }); });
    // 벽 소파 (2인용)
    [-1, 1].forEach(sd => [-5.6, -8.0].forEach(lz => { const lx = sd * 14.7, dir = ry + (sd > 0 ? -Math.PI / 2 : Math.PI / 2), p = f.w(lx, lz), fr = frame(p[0], p[1], dir);
      chairS.add(p[0], 0.5, p[1], dir, 1.0, 0.34, 2.3, '#8b5a4c'); const bk = fr.w(0, -0.46); sofaB.add(bk[0], 0.95, bk[1], dir, 0.28, 0.9, 2.3, '#8b5a4c');
      city.benches.push({ x: +p[0].toFixed(2), z: +p[1].toFixed(2), ry: +dir.toFixed(3) }); }));
    [[-12.7, -6.8], [12.7, -6.8]].forEach(q => { const p = f.w(q[0], q[1]); tableTop.add(p[0], 0.62, p[1], 0, 0.42, 0.06, 0.42); tableLeg.add(p[0], 0.31, p[1], 0, 0.04, 0.62, 0.04); addCircle(p[0], p[1], 0.7); });
    // 천장 조명
    for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) { const p = f.w(-12 + i * 6, -3 - j * 4); glowS(p[0], BH - 1.4, p[1]); poleI.add(p[0], BH - 0.7, p[1], 0, 0.02, 1.4, 0.02); }
    tableTop.build(); tableLeg.build(); chairS.build(); chairB.build(); stool.build(); sofaB.build();
    // ── 바깥 테라스 (앞쪽 마당)
    const plank = ctex(256, 256, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = 'hsl(28,' + R(34, 42) + '%,' + R(46, 54) + '%)'; g.fillRect(0, i * 32, w, 31); g.fillStyle = 'rgba(80,45,25,.35)'; g.fillRect(0, i * 32 + 31, w, 1); } });
    pbox(f, BW + 1.6, 0.14, 8.6, toonMat({ map: plank }), 0, 0.07, 4.3);
    const oTop = new Inst(cyl8, M('#f4ead8')), oLeg = new Inst(cyl8, M('#4a4352')), oChS = new Inst(unit, M('#ffffff')), oChB = new Inst(unit, M('#ffffff')), umbP = new Inst(cyl8, M('#efe6d6')), umbC = new Inst(new THREE.ConeGeometry(1, 1, 10), M('#ffffff'));
    [[-12, 3.6], [-6, 6.2], [6, 6.2], [12, 3.6]].forEach((t, ti) => {
      const p = f.w(t[0], t[1]); oTop.add(p[0], 0.8, p[1], 0, 0.58, 0.06, 0.58); oLeg.add(p[0], 0.4, p[1], 0, 0.05, 0.8, 0.05); addCircle(p[0], p[1], 0.95);
      [-1, 1].forEach((sd, ci) => { const cp = f.w(t[0] + sd * 0.95, t[1]), cr = ry + (sd > 0 ? -Math.PI / 2 : Math.PI / 2), c2 = ci ? '#c4694a' : '#5f8d7c';
        oChS.add(cp[0], 0.46, cp[1], cr, 0.46, 0.06, 0.46, c2); const bk = frame(cp[0], cp[1], cr).w(0, -0.22); oChB.add(bk[0], 0.76, bk[1], cr, 0.46, 0.5, 0.05, c2);
        city.benches.push({ x: +cp[0].toFixed(2), z: +cp[1].toFixed(2), ry: +cr.toFixed(3), n: 1 }); });
      umbP.add(p[0], 1.15, p[1], 0, 0.04, 2.3, 0.04); umbC.add(p[0], 2.5, p[1], 0, 1.7, 0.7, 1.7, ['#e8a089', '#f2e2c6', '#86b8ae', '#e8a089'][ti % 4]);
      shadow(p[0] + 0.6, p[1] + 0.5, 3.2, 3.0, 0, 0.5);
    });
    oTop.build(); oLeg.build(); oChS.build(); oChB.build(); umbP.build(); umbC.build();
    [[-17.6, 7.4], [17.6, 7.4]].forEach(q => { const w2 = f.w(q[0], q[1]); pbox(f, 2.4, 0.5, 1.0, M('#a9937e'), q[0], 0.25, q[1]); [-0.7, 0, 0.7].forEach(o => bushI.add(w2[0] + o * 0.6, 0.85, w2[1], 0, 0.5, 0.45, 0.5, '#72a05c')); });
    // 외부 조명 줄
    [[-HW, 8.2, HW, 8.2]].forEach(sg => { const n = Math.round(Math.hypot(sg[2] - sg[0], sg[3] - sg[1]) / 0.8); for (let i = 0; i <= n; i++) { const u = i / n, lx = sg[0] + (sg[2] - sg[0]) * u, lz = sg[1], w2 = f.w(lx, lz); glowS(w2[0], 3.4 - 0.35 * Math.sin(u * Math.PI), w2[1]); } });
    [[-HW, 8.2], [HW, 8.2]].forEach(q => { const w2 = f.w(q[0], q[1]); poleI.add(w2[0], 1.7, w2[1], 0, 0.06, 3.4, 0.06); });
    shadowRect(f.w(0, -BD / 2 + 0.6)[0], f.w(0, -BD / 2 + 0.6)[1], BW + 5, BD + 4.5, ry);
    // 자판기 3대 (건물 오른쪽 옆)
    [['#d94f4f', 0], ['#3f7fb3', 1], ['#e2b03c', 2]].forEach((v, i) => {
      const tex = ctex(128, 256, (g, w, h) => { g.fillStyle = '#1b1828'; g.fillRect(0, 0, w, h); const gr = g.createLinearGradient(0, 14, 0, 170); gr.addColorStop(0, '#fff7da'); gr.addColorStop(1, '#ffe2a0'); g.fillStyle = gr; g.fillRect(10, 14, 82, 170);
        for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) { g.fillStyle = ['#e85a5a', '#4d90d0', '#59b36b', '#f0b43c', '#b57ad0'][(r * 3 + c + i) % 5]; g.fillRect(16 + c * 26, 22 + r * 38, 18, 28); }
        g.fillStyle = '#0d0b16'; g.fillRect(14, 196, 74, 40); g.fillStyle = '#403a55'; g.fillRect(98, 40, 22, 40); g.fillStyle = '#ffd36a'; g.fillRect(102, 48, 14, 8); });
      const lx = HW + 1.6 + i * 1.25; pbox(f, 1.1, 2.0, 0.9, M(v[0]), lx, 1.0, -0.5); pplane(f, 1.0, 1.9, basic(tex), lx, 1.0, -0.04); glowS(f.w(lx, 0.3)[0], 1.2, f.w(lx, 0.3)[1]);
    });
    { const c2 = f.w(HW + 3.1, -0.5); addBoxCol(c2[0], c2[1], 1.95, 0.5, ry, 2.0); }
    // 컵 휴지통 2개
    ZN_BINS.forEach(q => { const w2 = f.w(q[0], q[1]); const bm = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.33, 0.95, 14), M('#4d6f66')); bm.position.set(w2[0], 0.5, w2[1]); scene.add(bm);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.08, 14), M('#2f433e')); lid.position.set(w2[0], 1.0, w2[1]); scene.add(lid);
      const hole = pplane(f, 0.34, 0.1, new THREE.MeshBasicMaterial({ color: '#111' }), q[0], 0.99, q[1] + 0.44); hole.rotation.x = 0;
      const lb = pplane(f, 0.5, 0.5, basic(ctex(64, 64, (g, w, h) => { g.fillStyle = 'rgba(0,0,0,0)'; g.font = '40px ' + FONT; g.textAlign = 'center'; g.fillText('🗑️', 32, 46); }, { alpha: true })), q[0], 0.62, q[1] + 0.42); lb.material.transparent = true; addCircle(w2[0], w2[1], 0.45); });
    // 카페 정보 (클라이언트가 점원·사장님·주문 구역·지붕 숨기기에 씀)
    const inside = (x, z) => { const dx = x - fx, dz = z - fz, c = Math.cos(ry), s = Math.sin(ry), lx = dx * c - dz * s, lz = dx * s + dz * c; return lx > -HW + 0.2 && lx < HW - 0.2 && lz > -BD + 0.2 && lz < -0.1; };
    let roofOn = true;
    city.cafe = {
      name: CAFE_NAME, f, ry, inside,
      npcs: [{ role: 'waitress', pos: f.w(-2.4, -12.5), ry }, { role: 'owner', pos: f.w(4.6, -12.7), ry }],
      bins: ZN_BINS.map(q => f.w(q[0], q[1])),
      menuSpots: [{ pos: f.w(-11.6, -BD + 1.4) }, { pos: f.w(12.0, -BD + 1.4) }],
      setRoof(v) { if (v === roofOn) return; roofOn = v; roofParts.forEach(m => { m.visible = v; }); }
    };
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
    const glass = toonMat({ color: '#b6dbe8', transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false });
    pbox(f, 6.6, 0.14, 2.4, M('#4a5a66'), 0, 2.75, -0.4); pbox(f, 6.8, 0.1, 2.6, M('#e8a089'), 0, 2.87, -0.4);
    [[-3, 0.5], [3, 0.5], [-3, -1.2], [3, -1.2]].forEach(p => { pbox(f, 0.1, 2.7, 0.1, M('#4a5a66'), p[0], 1.35, p[1]); });
    pbox(f, 6, 2.4, 0.05, glass, 0, 1.35, -1.2); pbox(f, 0.05, 2.4, 1.6, glass, -3, 1.35, -0.4); pbox(f, 0.05, 2.4, 1.6, glass, 3, 1.35, -0.4);
    const bus = ctex(256, 128, (g, w, h) => { g.fillStyle = '#16213a'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffb347'; g.font = '700 30px ' + FONT; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('마을버스 7', 18, 34); g.fillText('곧 도착', 18, 78); g.fillStyle = '#9fe0a8'; g.font = '700 24px ' + FONT; g.fillText('3분', 168, 78); g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(10, 52, w - 20, 2); });
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
      g.fillText('붕어빵 · 호떡', 276, 48); g.fillText('떡볶이 · 어묵', 276, 84); g.fillStyle = '#c4553c'; g.fillText('오늘도 푹 쉬어가요', 276, 116);
      g.fillStyle = '#7a5242'; g.fillRect(0, h - 22, w, 22);
    });
    pplane(f, 3.9, 1.5, basic(win), 1.1, 2.0, 0.01); pbox(f, 4.1, 0.1, 0.55, M('#8b6a52'), 1.1, 1.2, 0.28);
    const stripe = ctex(256, 32, (g, w, h) => { for (let i = 0; i < 10; i++) { g.fillStyle = i % 2 ? '#f6ebd6' : '#3f8f8a'; g.fillRect(i * w / 10, 0, w / 10 + 1, h); } });
    const awn = toonMat({ map: stripe });
    pbox(f, 4.5, 0.1, 1.5, awn, 1.1, 2.95, 0.65, 0.24); pbox(f, 4.5, 0.32, 0.07, awn, 1.1, 2.55, 1.28);
    const sg = textBoard(512, 110, '#3f8f8a', '#fff3d0', '달콤 간식 트럭', 56, (g, W, H) => { g.strokeStyle = '#fff3d0'; g.lineWidth = 4; g.strokeRect(8, 8, W - 16, H - 16); });
    pbox(f, 3.4, 0.74, 0.14, M('#2b6b67'), 0.9, 3.75, -0.5); pplane(f, 3.2, 0.66, basic(sg), 0.9, 3.75, -0.42); glow(f.w(0.9, 0.3)[0], 3.9, f.w(0.9, 0.3)[1]);
    for (let i = 0; i <= 9; i++) { const u = i / 9, lx = -1.1 + u * 4.6, wp = f.w(lx, 1.25); glowS(wp[0], 2.55 - 0.18 * Math.sin(u * Math.PI), wp[1]); }
    const ab = f.w(-2.2, 2.0); const abm = mesh(unit, M('#f4ead8'), ab[0], 0.55, ab[1], ry); abm.scale.set(0.7, 1.1, 0.12); addCircle(ab[0], ab[1], 0.5);
    const tc = f.w(0.6, -1.35); addBoxCol(tc[0], tc[1], 3.25, 1.35, ry, 3.3); const cb = f.w(-3.6, -1.35); addBoxCol(cb[0], cb[1], 0.95, 1.25, ry, 2.6);
    shadowRect(f.w(-0.4, -1.3)[0], f.w(-0.4, -1.3)[1], 10.2, 6.0, ry);
    city.spots.truck = { x: fx, z: fz, ry };
  }

  /* ═════════ 순환도로 자동차 ═════════ */
  const NCAR = CARS.N;
  const wheelGeo = new THREE.CylinderGeometry(1, 1, 1, 14); wheelGeo.rotateZ(Math.PI / 2);
  /* 차량 모델 (Quaternius Cars/Vehicles · CC0): 번호 i번 차가 VEH[i] 모델 */
  const VEH = [
    { n: 'Taxi', body: ['Yellow'] }, { n: 'SportsCar', body: ['Orange', 'DarkOrange'] }, { n: 'SportsCar2', body: ['White'] }, { n: 'NormalCar1', body: ['Blue'] },
    { n: 'NormalCar2', body: ['LightBlue', 'Material.007'] }, { n: 'SUV', body: ['White'] }, { n: 'Cop', body: ['White'] },
    { n: 'Bus', body: ['Bottom', 'Top'], len: 6.8, turn: 1, skip: ['Details'], cols: { Material: '#2b2b33', Windows: '#9fe0f4', Details: '#2a2f45', Bumper: '#3a3a44', Lights: '#ffe9a0' } },
    { n: 'SchoolBus', body: ['Yellow'], len: 6.8, turn: 1, skip: ['Details'], cols: { Wheel: '#2b2b33', Windows: '#9fe0f4', Details: '#1e1e26', Bumper: '#3a3a44', Lights: '#ffe9a0' } },
    { n: 'Ambulance', body: ['White'], len: 5.2, flip: 1, cols: { Red: '#e0443a', Grey: '#8a8f99', Windows: '#4a8fe0', Bumper: '#555', Lights: '#ffd58a', Material: '#2b2b33' } },
    { n: 'M4W', body: ['Body'], len: 4.8, cols: { Windows: '#2a3340' } }, { n: 'M4GT3', body: ['Body'], len: 4.9, cols: { Windows: '#2a3340' } }, { n: 'S1000RR', body: ['Body'], len: 2.1, cols: { Windows: '#9fd8ee', Lights: '#fff1b0' } },
    { n: 'F40', body: ['Body'], len: 4.4, cols: { Windows: '#2a3340' } }, { n: 'Countach', body: ['Body'], len: 4.5, cols: { Windows: '#2a3340' } },
    { n: 'Centenario', body: ['Body'], len: 4.7, cols: { Windows: '#2a3340' } }, { n: 'LaFerrari', body: ['Body'], len: 4.7, cols: { Windows: '#2a3340' } },
    { n: 'dragon', dragon: 1, body: [] },
    { n: 'S1000RR', body: ['Body'], len: 2.1, cols: { Cc9a23a: '#d9a090', Windows: '#9fd8ee', Lights: '#fff1b0' } },
    { n: 'M4W', body: ['Body'], len: 4.8, cols: { Windows: '#2a3340' } }
  ];
  const carParts = [], pal = CARS.COLORS, tc = new THREE.Color(), carState = [], lastCol = [];   // carParts[i] = [{m, body}]
  function parseVeh(obj, mtl) {
    const kd = {}; let cur = null;
    mtl.split('\n').forEach(l => { const s = l.trim().split(/\s+/); if (s[0] === 'newmtl') cur = s[1]; else if (s[0] === 'Kd' && cur) kd[cur] = [+s[1], +s[2], +s[3]]; });
    const v = [], vn = [], grp = {}; let g = null;
    obj.split('\n').forEach(l => {
      const s = l.trim().split(/\s+/), k = s[0];
      if (k === 'v') v.push([+s[1], +s[2], +s[3]]); else if (k === 'vn') vn.push([+s[1], +s[2], +s[3]]);
      else if (k === 'usemtl') { g = grp[s[1]] || (grp[s[1]] = { pos: [], nor: [] }); }
      else if (k === 'f' && g) {
        const c = s.slice(1).map(q => q.split('/'));
        for (let i = 1; i < c.length - 1; i++) [c[0], c[i], c[i + 1]].forEach(q => { g.pos.push.apply(g.pos, v[+q[0] - 1]); if (q[2]) g.nor.push.apply(g.nor, vn[+q[2] - 1]); else g.nor.push(0, 1, 0); });
      }
    });
    return { kd, grp };
  }
  const vehLoad = VEH.map((vd, i) => vd.dragon ? Promise.resolve([]) : Promise.all([fetch('/models/veh/' + vd.n + '.obj').then(r => r.text()), fetch('/models/veh/' + vd.n + '.mtl').then(r => r.text())]).then(([o, m]) => {
    const { kd, grp } = parseVeh(o, m), names = Object.keys(grp);
    // 크기·방향 맞추기: 중심을 원점, 바닥을 0, 길이를 목표치로, 앞이 +z
    let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    names.forEach(k => { const p = grp[k].pos; for (let j = 0; j < p.length; j += 3) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], p[j + a]); mx[a] = Math.max(mx[a], p[j + a]); } });
    const cx = (mn[0] + mx[0]) / 2, cz = (mn[2] + mx[2]) / 2, turn = vd.turn ? -Math.PI / 2 : vd.flip ? Math.PI : 0, cs = Math.cos(turn), sn = Math.sin(turn);
    const len = vd.turn ? mx[0] - mn[0] : mx[2] - mn[2], sc = (vd.len || 4.2) / len, list = [];
    names.forEach(k => {
      if (vd.skip && vd.skip.indexOf(k) >= 0) return;
      const gg = grp[k], p = gg.pos, nr = gg.nor.slice();
      for (let j = 0; j < p.length; j += 3) {
        const x = p[j] - cx, z = p[j + 2] - cz; p[j] = (x * cs + z * sn) * sc; p[j + 2] = (-x * sn + z * cs) * sc; p[j + 1] = (p[j + 1] - mn[1]) * sc;
        const nx = nr[j], nz = nr[j + 2]; nr[j] = nx * cs + nz * sn; nr[j + 2] = -nx * sn + nz * cs;
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nr, 3));
      const isBody = vd.body.indexOf(k) >= 0, glass = k === 'Windows', lamp = /Headlight|TailLight|WhiteLight|BlueLight|^Lights$/.test(k);
      let col = (vd.cols && vd.cols[k]) || null; if (!col) { const q = kd[k] || [0.6, 0.6, 0.6]; col = '#' + new THREE.Color(Math.pow(q[0], 0.45), Math.pow(q[1], 0.45), Math.pow(q[2], 0.45)).getHexString(); }
      list.push({ geo, col, isBody, glass, lamp });
    });
    return list;
  }).catch(() => []));
  const vehMade = [];
  /* 문(슈퍼카): 열릴 때만 보이는 차체색 판 */
  const doors = [];
  for (let i = 0; i < NCAR; i++) { const vi = CARS.vinfo(i); if (!vi.fx) continue;
    const root = new THREE.Group(), piv = new THREE.Group(), q = vi.d[0], sd = q ? Math.sign(q) : 1;
    const mat = toonMat('#ffffff'), m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.52, 1.3), mat); m.position.set(0, 0, -0.65); piv.add(m); piv.position.set(sd * 0.98, 0.62, 0.72); root.add(piv); root.visible = false; scene.add(root);
    doors[i] = { root, piv, sd, mat }; }
  const dragonId = VEH.findIndex(v => v.dragon), dragon = window.DRG ? DRG.make(scene) : null;
  city.dragonObj = dragon;
  function buildVeh(i, list) {
    carParts[i] = list.map(pt => {
      const mat = pt.glass ? new THREE.MeshBasicMaterial({ color: pt.col, transparent: true, opacity: 0.4, depthWrite: false }) : pt.lamp ? new THREE.MeshBasicMaterial({ color: pt.col }) : toonMat(pt.isBody ? '#ffffff' : pt.col);
      const m = new THREE.InstancedMesh(pt.geo, mat, 1); m.frustumCulled = false; m.castShadow = !pt.glass && !pt.lamp; m.receiveShadow = !pt.glass && !pt.lamp; m.setMatrixAt(0, new THREE.Matrix4()); scene.add(m);
      if (pt.isBody) { tc.set(pal[(carState[i] ? carState[i].color : i) % pal.length]); m.setColorAt(0, tc); addOutlineTo(m, 0.025); }
      return { m, body: pt.isBody };
    });
  }
  vehLoad.forEach((pr, i) => pr.then(list => { if (list.length) buildVeh(i, list); }));

  /* ═════════ 낙엽 ═════════ */
  const NLEAF = 150, leafPos = new Float32Array(NLEAF * 3), leafD = [];
  for (let i = 0; i < NLEAF; i++) { const a = R(0, TAU), r = Math.sqrt(rnd()) * 54; leafPos[i * 3] = Math.cos(a) * r; leafPos[i * 3 + 1] = R(0.2, 10); leafPos[i * 3 + 2] = Math.sin(a) * r; leafD.push({ vy: R(0.35, 0.9), ph: R(0, TAU), sw: R(0.4, 1.2) }); }
  const leafGeo = new THREE.BufferGeometry(); leafGeo.setAttribute('position', new THREE.BufferAttribute(leafPos, 3));
  const leaves = new THREE.Points(leafGeo, new THREE.PointsMaterial({ size: 0.3, map: glowTex, color: '#f0bf45', transparent: true, depthWrite: false })); leaves.frustumCulled = false; scene.add(leaves);

  /* ═════════ 인스턴스 / 글로우 / 그림자 확정 ═════════ */
  /* 잔디 띠 (대로·구조물 앞은 비움) */
  const lawnArcs = [];
  for (let i = 0; i < 4; i++) { const A = 45 + 90 * i, S = 90 + 90 * i; lawnArcs.push([A + 6, S - 17], [S + 17, A + 84]); }
  const lawnMat = M('#7dbd5e', { map: groundTexR(10), polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  lawnArcs.forEach(a => { const g = new THREE.RingGeometry(53.6, 59.8, 24, 1, -a[1] * D2R, (a[1] - a[0]) * D2R); const m = new THREE.Mesh(g, lawnMat); m.rotation.x = -Math.PI / 2; m.position.y = 0.05; scene.add(m); });
  const tufts = [], flowers = [];
  function onLawn(rMin, rMax, n, cb) { for (let k = 0; k < n; k++) { const a = lawnArcs[Math.floor(rnd() * lawnArcs.length)]; const deg = R(a[0] + 0.8, a[1] - 0.8), r = R(rMin, rMax); const [x, z] = P(deg, r); if (city.trees.some(t => Math.hypot(x - t[0], z - t[1]) < 1.1)) continue; cb(x, z); } }
  onLawn(54.2, 59.4, 520, (x, z) => { const w = R(0.9, 1.7); tufts.push({ x, y: w * 0.42, z, w, h: w * 0.85, c: cardJit() }); });
  onLawn(54.4, 59.2, 150, (x, z) => { const w = R(0.5, 0.8); flowers.push({ x, y: w * 0.9, z, w, h: w * 1.8, c: new THREE.Color(['#ffffff', '#ffd9e6', '#fff1b8', '#d8e6ff'][Math.floor(rnd() * 4)]) }); });
  cardSet(tuftTex(41), tufts, { sway: 0.06 }); cardSet(tuftTex(42), treeTufts, { sway: 0.07 }); cardSet(flowerTex(51), flowers, { sway: 0.07 });
  leafI.forEach(i => i.build()); branchI.build();
  [trunkI, planterI, bushI, flowerI, bolI, bolCap, benchSeat, benchBack, benchLeg, poleI, lampBase, headI].forEach(i => i.build());
  { const pg = new THREE.PlaneGeometry(1, 1); pg.rotateX(-Math.PI / 2);
    const bm = new THREE.InstancedMesh(pg, new THREE.MeshBasicMaterial({ map: blobTex, color: '#241838', transparent: true, opacity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), shadowBlobs.length);
    shadowBlobs.forEach((s, i) => { tmp.position.set(s[0], 0.075, s[1]); tmp.rotation.set(0, s[4], 0); tmp.scale.set(s[2], 1, s[3]); tmp.updateMatrix(); bm.setMatrixAt(i, tmp.matrix); }); bm.frustumCulled = false; bm.renderOrder = 1; scene.add(bm);
    if (shadowRects.length) { const rm = new THREE.InstancedMesh(pg, new THREE.MeshBasicMaterial({ alphaMap: rectTex, color: '#241838', transparent: true, opacity: 0.36, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), shadowRects.length);
      shadowRects.forEach((s, i) => { tmp.position.set(s[0], 0.072, s[1]); tmp.rotation.set(0, s[4], 0); tmp.scale.set(s[2], 1, s[3]); tmp.updateMatrix(); rm.setMatrixAt(i, tmp.matrix); }); rm.frustumCulled = false; rm.renderOrder = 1; scene.add(rm); } }
  const glowMats = [];
  function glowPoints(arr, size, color, op) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    const mt = new THREE.PointsMaterial({ size, map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: op }); glowMats.push([mt, op, size]); const p = new THREE.Points(g, mt); p.frustumCulled = false; scene.add(p);
  }
  glowPoints(glowPts, 4.0, '#ffd9a0', 0.35); glowPoints(glowSmall, 0.8, '#ffe2a8', 0.55);

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
  /* 헤드라이트 빛줄기 · 먼지 · 쓰레기통 */
  let curNight = 0.1;
  const POLLEN = new THREE.Color('#fff2c8'), FIRE = new THREE.Color('#ffd86a');
  const beams = [];
  for (let i = 0; i < NCAR; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 8), new THREE.MeshBasicMaterial({ map: glowTex, color: '#fff2c0', transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending })); m.rotation.x = -Math.PI / 2; m.visible = false; m.frustumCulled = false; m.renderOrder = 3; scene.add(m); beams.push(m); }
  function placeBeam(m, x, z, ry) { m.position.set(x + Math.sin(ry) * 6.4, 0.09, z + Math.cos(ry) * 6.4); m.rotation.order = 'YXZ'; m.rotation.set(-Math.PI / 2, ry, 0); }
  const puffs = []; for (let i = 0; i < 28; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#efe8dc', transparent: true, depthWrite: false, opacity: 0 })); sp.visible = false; scene.add(sp); puffs.push({ s: sp, life: 0, max: 1 }); }
  let puffI = 0;
  city.puff = function (x, y, z) { const q = puffs[puffI++ % puffs.length]; q.life = q.max = 0.8; q.s.position.set(x, y + 0.2, z); };
  CARS.SPAWNS.forEach((c, i) => { carState[i] = { rx: c.x, rz: c.z, rry: c.ry, color: c.color, lights: 0 }; });
  city.setCars = function (list) { for (let i = 0; i < NCAR; i++) carState[i] = list[i]; };
  CARS.BINS.forEach(b => {
    const bn = mesh(cyl8, M('#4d8a72'), b[0], 0.52, b[1]); bn.scale.set(0.42, 1.04, 0.42);
    const lid = mesh(cyl8, M('#3c6b58'), b[0], 1.08, b[1]); lid.scale.set(0.5, 0.1, 0.5);
    const knob = mesh(new THREE.SphereGeometry(1, 8, 6), M('#e9d9b8'), b[0], 1.18, b[1]); knob.scale.set(0.1, 0.07, 0.1);
    const band = mesh(cyl8, M('#f1e6c8'), b[0], 0.7, b[1]); band.scale.set(0.435, 0.16, 0.435);
    addCircle(b[0], b[1], 0.5);
  });
  /* 공중에 떠다니는 빛가루 (밤에는 반딧불) */
  const NMOTE = 170, motePos = new Float32Array(NMOTE * 3), moteD = [];
  for (let i = 0; i < NMOTE; i++) { const a = R(0, TAU), r = Math.sqrt(rnd()) * 56; moteD.push({ a, r, y: R(0.6, 9), ph: R(0, TAU), sp: R(0.1, 0.4), bob: R(0.3, 1.0) }); }
  const moteGeo = new THREE.BufferGeometry(); moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const moteMat = new THREE.PointsMaterial({ size: 0.26, map: glowTex, color: '#fff2c8', transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });
  const motes = new THREE.Points(moteGeo, moteMat); motes.frustumCulled = false; scene.add(motes);

  /* 하늘을 도는 새떼 */
  const birdTex = pntTex(64, 64, (x) => {
    x.strokeStyle = '#2f2a3a'; x.lineWidth = 7; x.lineCap = 'round'; x.lineJoin = 'round';
    x.beginPath(); x.moveTo(8, 36); x.quadraticCurveTo(22, 18, 32, 34); x.quadraticCurveTo(42, 18, 56, 36); x.stroke();
  }, 3);
  const birds = [];
  for (let i = 0; i < 9; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: birdTex, transparent: true, depthWrite: false, fog: false, opacity: 0.55 }));
    const g = Math.floor(i / 3); sp.scale.setScalar(R(5, 8)); sp.frustumCulled = false; scene.add(sp);
    birds.push({ s: sp, g, a: R(0, TAU), r: R(120, 230), y: R(55, 105), v: R(0.012, 0.025), ph: R(0, TAU) });
  }

  /* ═════════ 동네 집들 (Quaternius 건물 팩 · CC0) — 잔디밭 빈 곳에만 놓아요 ═════════ */
  {
    const TOWN = [['House', 7, 'HouseTexture1'], ['House2', 7.5, 'HouseTexture2'], ['House3', 6.5, 'HouseTexture3'], ['House4', 6.5, 'HouseTexture4'], ['House5', 6.5, 'HouseTexture1'],
                  ['Flat', 4.6, 'Hotel'], ['Flat2', 4.6, 'Shop'], ['Shop', 5, 'Shop'], ['Hospital', 3.4, 'Hotel'], ['Bank', 3.2, null]];
    [['1Story', 0], ['1Story_GableRoof', 0], ['1Story_RoundRoof', 0], ['1Story_Sign', 0], ['2Story', 0], ['2Story_2', 0], ['2Story_Balcony', 0], ['2Story_GableRoof', 0],
     ['2Story_Slim', 0], ['2Story_Wide', 0], ['3Story_Small', 0], ['3Story_Balcony', 0], ['4Story', 0], ['6Story_Stack', 0]].forEach((q, i) => TOWN.push(['b2/' + q[0], q[0] === '2Story_Slim' ? 5.2 : 4.5, 'b2/Texture_' + ['Red', 'Yellow', 'Light', 'Blue', 'Grey'][i % 5]]));
    function parseOBJ(txt) {
      const v = [], vt = [], vn = [], pos = [], uv = [], nor = [];
      txt.split('\n').forEach(l => {
        const s = l.trim().split(/\s+/); const k = s[0];
        if (k === 'v') v.push([+s[1], +s[2], +s[3]]); else if (k === 'vt') vt.push([+s[1], +s[2]]); else if (k === 'vn') vn.push([+s[1], +s[2], +s[3]]);
        else if (k === 'f') {
          const c = s.slice(1).map(q => { const a = q.split('/'); return [+a[0] - 1, a[1] ? +a[1] - 1 : -1, a[2] ? +a[2] - 1 : -1]; });
          for (let i = 1; i < c.length - 1; i++) [c[0], c[i], c[i + 1]].forEach(q => { pos.push.apply(pos, v[q[0]]); if (q[1] >= 0) uv.push(vt[q[1]][0], vt[q[1]][1]); else uv.push(0.5, 0.5); if (q[2] >= 0) nor.push.apply(nor, vn[q[2]]); else nor.push(0, 1, 0); });
        }
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.computeBoundingBox(); return g;
    }
    // 놓을 자리: 고리 모양으로 훑으면서, 고층 빌딩·대로·보도와 겹치지 않는 곳만
    const spots = [];
    [[92.5, 1.9], [100.5, 1.7], [108.5, 1.5]].forEach(rr => {
      for (let deg = 0; deg < 360; deg += rr[1]) {
        const dd = deg + R(-0.4, 0.4), r = rr[0] + R(-1.2, 1.2), [x, z] = P(dd, r);
        if (avDist(dd) < 8.5 || BILL_ANG.some(a => angDiff(dd, a) < 12)) continue;
        if (towerRegs.some(q => Math.hypot(q[0] - x, q[1] - z) < q[2] * 0.75 + 5)) continue;
        if (spots.some(q => Math.hypot(q[0] - x, q[1] - z) < 10.5)) continue;
        spots.push([x, z, dd]);
      }
    });
    spots.sort((p, q) => Math.hypot(p[0], p[1]) - Math.hypot(q[0], q[1])); spots.length = Math.min(spots.length, 72);   // 폰이 느려지지 않게 개수 제한
    city.townSpots = spots;
    const cap = { Bank: 2, Hospital: 3, 'b2/6Story_Stack': 2, 'b2/4Story': 3 }, used = {};
    const pick = spots.map(() => { for (let k = 0; k < 8; k++) { const ti = Math.floor(rnd() * TOWN.length), nm = TOWN[ti][0]; if (cap[nm] != null && (used[nm] = (used[nm] || 0) + 1) > cap[nm]) continue; return ti; } return 0; });
    const loader = new THREE.TextureLoader(), texC = {};
    const getTex = n => texC[n] || (texC[n] = loader.load('/models/' + n + '.png', t => { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; }));
    TOWN.forEach((tw, ti) => {
      const mine = spots.map((s, i) => pick[i] === ti ? s : null).filter(Boolean); if (!mine.length) return;
      fetch('/models/' + tw[0] + '.obj').then(r => r.text()).then(txt => {
        const geo = parseOBJ(txt), bb = geo.boundingBox, hw = Math.max(bb.max.x, -bb.min.x), hd = Math.max(bb.max.z, -bb.min.z);
        const mat = tw[2] ? toonMat({ map: getTex(tw[2]) }) : toonMat('#d9cfc0');
        const im = new THREE.InstancedMesh(geo, mat, mine.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(tw[1], tw[1], tw[1]), up = new THREE.Vector3(0, 1, 0);
        mine.forEach((s, i) => {
          const ry = faceCenter(s[0], s[1]) + R(-0.06, 0.06); q.setFromAxisAngle(up, ry); m4.compose(new THREE.Vector3(s[0], 0.02, s[1]), q, sc); im.setMatrixAt(i, m4);
          addCircle(s[0], s[1], Math.max(hw, hd) * tw[1] * 0.8); shadow(s[0], s[1], hw * 2 * tw[1] * 1.15, hd * 2 * tw[1] * 1.15, ry, 0.5);
        });
        im.frustumCulled = false; im.castShadow = false; im.receiveShadow = false; scene.add(im);
      }).catch(() => {});
    });
  }
  /* ═════════ 자연 모델 (Quaternius Stylized Nature MegaKit · CC0) — 나무·덤불·꽃·바위 ═════════ */
  {
    const GL = THREE.GLTFLoader ? new THREE.GLTFLoader() : null, cache = {};
    function loadNat(name) {                                  // → Promise<[ [geometry, material], ... ]>
      if (!GL) return Promise.reject();
      return cache[name] || (cache[name] = new Promise((res, rej) => GL.load('/models/nature/' + name + '.gltf', g => {
        const parts = []; g.scene.updateMatrixWorld(true);
        g.scene.traverse(o => {
          if (!o.isMesh) return;
          const geo = o.geometry.clone(); geo.applyMatrix4(o.matrixWorld); const src = o.material, cut = src.alphaTest > 0;
          const mat = toonMat({ map: src.map || null, color: '#ffffff', side: THREE.DoubleSide, alphaTest: cut ? 0.5 : 0 }); mat.userData.noOutline = true;
          parts.push([geo, mat]);
        });
        res(parts);
      }, undefined, rej)));
    }
    const TINT = ['#ffffff', '#f2ffe0', '#ffffff', '#e6ffd2', '#ffe9bd'];
    function place(name, list) {                              // list: [x, y, z, ry, scale]
      if (!list.length) return Promise.resolve();
      return loadNat(name).then(parts => parts.forEach(pt => {
        const im = new THREE.InstancedMesh(pt[0], pt[1], list.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
        list.forEach((s, i) => { q.setFromAxisAngle(up, s[3]); m4.compose(new THREE.Vector3(s[0], s[1], s[2]), q, new THREE.Vector3(s[4], s[4], s[4])); im.setMatrixAt(i, m4); c.set(TINT[Math.floor(rnd() * TINT.length)]); im.setColorAt(i, c); });
        im.frustumCulled = false; im.castShadow = false; im.receiveShadow = false; scene.add(im);
      })).catch(() => {});
    }
    // ① 광장 나무: 같은 자리에 새 나무 모델을 세우고, 예전 둥근 나무는 숨겨요
    const oldTrees = city.trees.map(t => [t[0], t[1], t[2]]);
    const names = ['CommonTree_1', 'CommonTree_2', 'CommonTree_3'], byName = {};
    oldTrees.forEach(t => { const n = names[Math.floor(rnd() * names.length)]; (byName[n] = byName[n] || []).push([t[0], 0, t[1], R(0, 6.28), 1.3 * t[2]]); });
    Promise.all(names.map(n => place(n, byName[n] || []))).then(() => {
      if (!(GL && Object.keys(cache).length)) return;
      Promise.all(Object.values(cache)).then(() => { [trunkI, branchI].concat(leafI).forEach(i => { if (i.mesh) i.mesh.visible = false; if (i.olm) i.olm.visible = false; }); }).catch(() => {});
    });
    // ② 잔디띠: 꽃 덤불 · 꽃무더기 · 풀 · 작은 바위
    const L = { 'Bush_Common_Flowers': [], 'Bush_Common': [], 'Flower_3_Group': [], 'Flower_4_Group': [], 'Grass_Common_Tall': [], 'Grass_Wispy_Tall': [], 'Rock_Medium_1': [], 'Rock_Medium_2': [], 'Fern_1': [] };
    const lp = (key, rMin, rMax, n, sMin, sMax) => onLawn(rMin, rMax, n, (x, z) => L[key].push([x, 0.05, z, R(0, 6.28), R(sMin, sMax)]));
    lp('Bush_Common_Flowers', 55.2, 58.8, 14, 0.8, 1.15); lp('Bush_Common', 55.2, 58.8, 8, 0.7, 1.0);
    lp('Flower_3_Group', 54.4, 59.2, 14, 0.9, 1.4); lp('Flower_4_Group', 54.4, 59.2, 14, 0.9, 1.4);
    lp('Grass_Common_Tall', 54.2, 59.4, 18, 0.8, 1.3); lp('Grass_Wispy_Tall', 54.2, 59.4, 12, 0.8, 1.3);
    lp('Rock_Medium_1', 55.5, 58.5, 4, 0.5, 0.8); lp('Rock_Medium_2', 55.5, 58.5, 4, 0.5, 0.8);
    // ③ 동네 집 앞마당: 집 앞에 덤불·꽃 (집 놓는 코드가 spots를 채운 뒤 사용)
    {
      const spots = city.townSpots || [], bs = [], fl = [];
      spots.forEach((s, i) => { if (i % 2) return; const a = Math.atan2(s[1], s[0]), ox = -Math.cos(a) * 5.2 + Math.sin(a) * R(-3, 3), oz = -Math.sin(a) * 5.2 - Math.cos(a) * R(-3, 3); (rnd() < 0.5 ? bs : fl).push([s[0] + ox, 0.03, s[1] + oz, R(0, 6.28), R(0.8, 1.2)]); });
      place('Bush_Common_Flowers', bs); place('Flower_4_Group', fl);
    }
    Object.keys(L).forEach(k => place(k, L[k]));
  }
  /* ═════════ 큰 별 기념물 (별 받는 곳) ═════════ */
  {
    const [sx, sz] = P(50, 13.5), g = new THREE.Group(); g.position.set(sx, 0, sz); scene.add(g);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.0, 0.9, 16), M('#7a6a8a')); ped.position.y = 0.45; g.add(ped);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.12, 16), M('#e8d9a8')); top.position.y = 0.96; g.add(top);
    const sh = new THREE.Shape(), R1 = 1.35, R2 = 0.56;
    for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? R2 : R1, x = Math.cos(a) * r, y = Math.sin(a) * r; i ? sh.lineTo(x, y) : sh.moveTo(x, y); }
    sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.38, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2 }); geo.translate(0, 0, -0.19);
    const starM = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ffcf3a' })); starM.position.y = 2.75; g.add(starM);
    const rim = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#8a5a00', side: THREE.BackSide })); rim.scale.setScalar(1.06); starM.add(rim);
    glow(sx, 2.75, sz); glow(sx, 2.2, sz); glow(sx, 3.3, sz);
    addCircle(sx, sz, 1.0); shadow(sx, sz, 3.2, 3.2, 0, 0.45);
    city.star = { x: sx, z: sz, mesh: starM };
  }
  city.update = function (dt, T, camPos, carT) {
    if (city.star) { city.star.mesh.rotation.y += dt * 0.9; city.star.mesh.position.y = 2.75 + Math.sin(T * 1.6) * 0.12; }
    windU.value = T; sky.position.copy(camPos); clouds.position.set(camPos.x, 0, camPos.z); clouds.rotation.y += dt * 0.0022; const cx = city.cx, cz = city.cz;
    waterMat.uniforms.uT.value = T; sheetMat.uniforms.uT.value = T;
    for (let i = 0; i < NDROP; i++) {
      const d = dropData[i], t = ((T * 0.62 + d.ph) % 1) * 1.9, y = 4.7 + d.v0 * t - 4.9 * t * t;
      if (y < 1.0) { dropPos[i * 3 + 1] = -50; continue; }
      dropPos[i * 3] = Math.cos(d.a) * d.vh * t; dropPos[i * 3 + 1] = y; dropPos[i * 3 + 2] = Math.sin(d.a) * d.vh * t;
    }
    dropGeo.attributes.position.needsUpdate = true;
    for (let i = 0; i < NMOTE; i++) {
      const d = moteD[i]; d.a += d.sp * 0.02 * dt;
      motePos[i * 3] = cx + Math.cos(d.a + Math.sin(T * 0.12 + d.ph) * 0.05) * d.r;
      motePos[i * 3 + 1] = d.y + Math.sin(T * d.bob + d.ph) * 0.5;
      motePos[i * 3 + 2] = cz + Math.sin(d.a + Math.sin(T * 0.12 + d.ph) * 0.05) * d.r;
    }
    moteGeo.attributes.position.needsUpdate = true;
    moteMat.color.copy(curNight > 0.5 ? FIRE : POLLEN); moteMat.opacity = 0.28 + 0.52 * curNight; moteMat.size = 0.22 + 0.16 * curNight;
    for (const b of birds) {
      b.a += b.v * dt; const wob = Math.sin(T * 0.5 + b.ph) * 6;
      b.s.position.set(cx + Math.cos(b.a) * b.r, b.y + wob, cz + Math.sin(b.a) * b.r);
      b.s.material.opacity = 0.5 * (1 - curNight * 0.85);
      b.s.visible = curNight < 0.85;
    }
    let colDirty = false;
    for (let i = 0; i < NCAR; i++) {
      const c = carState[i]; if (!c) continue;
      const x = c.rx, z = c.rz, ry = c.rry;
      const cp = carParts[i];
      if (cp) { tmp.position.set(x, c.y || 0, z); tmp.rotation.set(0, ry, 0, 'YXZ'); tmp.scale.set(1, 1, 1); tmp.updateMatrix(); cp.forEach(o => { o.m.setMatrixAt(0, tmp.matrix); o.m.instanceMatrix.needsUpdate = true; });
        if (lastCol[i] !== c.color) { lastCol[i] = c.color; tc.set(pal[c.color % pal.length]); cp.forEach(o => { if (o.body) { o.m.setColorAt(0, tc); o.m.instanceColor.needsUpdate = true; } }); } }
      const dr = doors[i]; if (dr) { const open = c.door || 0; dr.root.visible = open > 0.03; if (dr.root.visible) { dr.root.position.set(x, c.y || 0, z); dr.root.rotation.set(0, ry, 0, 'YXZ'); dr.piv.rotation.y = -dr.sd * open * 1.05; tc.set(pal[c.color % pal.length]); dr.mat.color.copy(tc); } }
      if (i === dragonId && dragon) { const fl = (c.y || 0) > 0.6; dragon.update(x, c.y || 0, z, ry, c.pt || 0, fl, c.fire, dt, true, Math.abs(c.rsp || 0)); }
      const bm = beams[i], on = c.lights ? 1 : 0, nightK = 0.25 + 0.75 * (curNight || 0);
      bm.visible = !!on; if (on) { const f = placeBeam(bm, x, z, ry); bm.material.opacity = 0.42 * nightK; }
    }
    for (const q of puffs) { if (q.life <= 0) { q.s.visible = false; continue; } q.life -= dt; q.s.visible = true; const k = 1 - q.life / q.max; q.s.position.y += dt * 0.5; q.s.scale.setScalar(0.8 + k * 2.4); q.s.material.opacity = 0.5 * (1 - k); }
    for (let i = 0; i < NLEAF; i++) {
      const d = leafD[i]; let y = leafPos[i * 3 + 1] - d.vy * dt;
      leafPos[i * 3] += (Math.sin(T * 0.6 + d.ph) * d.sw + 0.35) * dt; leafPos[i * 3 + 2] += Math.cos(T * 0.5 + d.ph) * d.sw * 0.6 * dt;
      if (y < 0.1) { y = R(7, 12); const a = R(0, TAU), r = Math.sqrt(rnd()) * 54; leafPos[i * 3] = Math.cos(a) * r; leafPos[i * 3 + 2] = Math.sin(a) * r; }
      leafPos[i * 3 + 1] = y;
    }
    leafGeo.attributes.position.needsUpdate = true;
  };
  city.sunDir = sunDir;
  const outMat = new THREE.MeshBasicMaterial({ color: '#3b2a3e', side: THREE.BackSide });
  outMat.onBeforeCompile = function (sh) { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed=position+normalize(normal)*0.022;'); };
  city.outline = function (m) { const o = new THREE.Mesh(m.geometry, outMat); o.castShadow = false; o.receiveShadow = false; m.add(o); return o; };
  city.toon = toonMat; city.groundTexR = groundTexR;
  city.setPlayer = function (x, y, z) {
    playerU.value.set(x, y, z, 0.8);
    sunL.target.position.set(Math.round(x / 2) * 2, 0, Math.round(z / 2) * 2); sunL.target.updateMatrixWorld();
    sunL.position.copy(sunL.target.position).addScaledVector(sunDir, 120);
  };

  /* 후처리: 부드러운 번짐 + 블룸 + 색보정 + 종이결 + 햇살 */
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), postScene = new THREE.Scene();
  const postMat = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: { tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uBloom: { value: 0.24 }, uSunUV: { value: new THREE.Vector2(0.5, 0.5) }, uSunAmt: { value: 0 } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader: [
      'uniform sampler2D tDiffuse;uniform vec2 uRes;uniform float uBloom;uniform vec2 uSunUV;uniform float uSunAmt;varying vec2 vUv;',
      'float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}',
      'float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(h21(i),h21(i+vec2(1.0,0.0)),f.x),mix(h21(i+vec2(0.0,1.0)),h21(i+vec2(1.0,1.0)),f.x),f.y);}',
      'vec3 bright(vec2 uv){vec3 c=texture2D(tDiffuse,uv).rgb;float l=dot(c,vec3(0.299,0.587,0.114));return c*smoothstep(0.78,1.1,l);}',
      'void main(){',
      ' vec2 px=1.0/uRes;float s=max(uRes.y/700.0,0.8);vec2 uv=vUv;',
      ' vec3 c=texture2D(tDiffuse,uv).rgb*0.76;',
      ' c+=texture2D(tDiffuse,uv+vec2(px.x,0.0)*0.7).rgb*0.06;c+=texture2D(tDiffuse,uv-vec2(px.x,0.0)*0.7).rgb*0.06;',
      ' c+=texture2D(tDiffuse,uv+vec2(0.0,px.y)*0.7).rgb*0.06;c+=texture2D(tDiffuse,uv-vec2(0.0,px.y)*0.7).rgb*0.06;',
      ' vec3 b=vec3(0.0);',
      ' float rot=h21(vUv*uRes+1.7)*6.2832;',
      ' for(int i=0;i<8;i++){float a=float(i)*0.7854+rot;vec2 d=vec2(cos(a),sin(a));b+=bright(vUv+d*px*5.0*s);b+=bright(vUv+d*px*13.0*s)*0.7;}',   /* 방향을 화소마다 흔들어서 겹쳐 보이는 잔상(고스트)을 없앰 */
      ' b/=11.0; c+=b*uBloom*vec3(1.0,0.95,0.85);',
      ' if(uSunAmt>0.001){',
      '  vec2 stp=(uSunUV-vUv)/16.0;vec2 q=vUv;vec3 acc=vec3(0.0);float wg=1.0;float asp=uRes.x/uRes.y;',
      '  for(int i=0;i<16;i++){q+=stp;vec3 sm=texture2D(tDiffuse,q).rgb;float ll=dot(sm,vec3(0.299,0.587,0.114));',
      '   float nr=1.0-smoothstep(0.0,0.6,length((q-uSunUV)*vec2(asp,1.0)));acc+=sm*smoothstep(0.84,1.0,ll)*nr*wg;wg*=0.95;}',
      '  c+=acc/16.0*uSunAmt*vec3(1.0,0.86,0.6)*1.25;',
      ' }',
      ' float l=dot(c,vec3(0.299,0.587,0.114));',
      ' c=mix(vec3(l),c,1.24); c=mix(c,c*c*(3.0-2.0*c),0.20);',
      ' c*=mix(vec3(0.88,0.95,1.12),vec3(1.08,1.04,0.93),smoothstep(0.10,0.72,l));',
      ' c+=(1.0-smoothstep(0.0,0.45,l))*vec3(0.012,0.016,0.03);',
      ' float paper=vn(vUv*uRes*0.5)*0.5+vn(vUv*uRes*0.13)*0.5; c*=1.0-0.026*(1.0-paper);',
      ' vec2 vq=vUv-0.5; c*=1.0-0.30*smoothstep(0.35,0.95,length(vq*vec2(1.0,0.9)));',
      ' gl_FragColor=vec4(c,1.0);',
      '}'].join('\n')
  });
  postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat));
  clouds.children.forEach(c => { c.userData.op = c.material.opacity; });
  let qScale = 1, rt = null, ms = (renderer.capabilities.isWebGL2 && THREE.WebGLMultisampleRenderTarget);
  function resizePost() {
    const v = new THREE.Vector2(); renderer.getDrawingBufferSize(v);
    const q = qScale;
    const w = Math.max(2, Math.floor(v.x * q)), h = Math.max(2, Math.floor(v.y * q));
    if (rt) rt.dispose();
    const o = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat };
    if (ms) { rt = new THREE.WebGLMultisampleRenderTarget(w, h, o); rt.samples = (OPT && OPT.touch) ? 2 : 4; } else rt = new THREE.WebGLRenderTarget(w, h, o);
    postMat.uniforms.uRes.value.set(w, h);
  }
  resizePost();
  const sunV = new THREE.Vector3();

  /* ═════════ 시간대 (낮 → 노을 → 밤) ═════════ */
  const KFsrc = [
    { h: 0,    top: '#0b1230', mid: '#17224a', hor: '#26305a', hS: '#6a82c8', hG: '#2c3256', hI: 0.55, sC: '#b4c4ff', sI: 0.40, cl: '#6f7caa', tint: [0.50, 0.58, 0.86], night: 1.0, rim: '#8aa0e0', bloom: 0.46 },
    { h: 5.0,  top: '#27366e', mid: '#8a7aa8', hor: '#f0a98a', hS: '#a9b4dc', hG: '#6a6a78', hI: 0.46, sC: '#ffb48a', sI: 0.40, cl: '#f0b8b4', tint: [0.88, 0.84, 0.92], night: 0.55, rim: '#ffc0a0', bloom: 0.32 },
    { h: 7.5,  top: '#4a8ae0', mid: '#a6d2f2', hor: '#f4e2c6', hS: '#d8ecff', hG: '#a8b47c', hI: 0.52, sC: '#ffe6b4', sI: 0.52, cl: '#fff4e4', tint: [1.0, 0.98, 0.94], night: 0.12, rim: '#ffe2b8', bloom: 0.24 },
    { h: 12.5, top: '#2f7de4', mid: '#8ec6f4', hor: '#e6eeee', hS: '#dbeeff', hG: '#a4bb80', hI: 0.60, sC: '#fffaf0', sI: 0.66, cl: '#ffffff', tint: [1.03, 1.03, 1.0], night: 0.08, rim: '#fff0d0', bloom: 0.22 },
    { h: 16.5, top: '#3d80e0', mid: '#99c9f2', hor: '#efe0c8', hS: '#d8ecff', hG: '#a8b47c', hI: 0.56, sC: '#fff0cf', sI: 0.62, cl: '#fff7ea', tint: [1.0, 0.98, 0.93], night: 0.12, rim: '#ffe2b8', bloom: 0.24 },
    { h: 18.3, top: '#3f4f93', mid: '#ee9494', hor: '#ffb87a', hS: '#f0c8c4', hG: '#8a7090', hI: 0.52, sC: '#ffa862', sI: 0.62, cl: '#ffb9a2', tint: [1.0, 0.84, 0.80], night: 0.38, rim: '#ffc08a', bloom: 0.30 },
    { h: 19.8, top: '#222a68', mid: '#7a5a8c', hor: '#d88a78', hS: '#8a90c8', hG: '#4a4468', hI: 0.50, sC: '#ff9a78', sI: 0.40, cl: '#b88ca8', tint: [0.8, 0.74, 0.88], night: 0.78, rim: '#e8a0a0', bloom: 0.38 },
    { h: 21.5, top: '#0b1230', mid: '#17224a', hor: '#26305a', hS: '#6a82c8', hG: '#2c3256', hI: 0.55, sC: '#b4c4ff', sI: 0.40, cl: '#6f7caa', tint: [0.50, 0.58, 0.86], night: 1.0, rim: '#8aa0e0', bloom: 0.46 }
  ];
  const KFc = ['top', 'mid', 'hor', 'hS', 'hG', 'sC', 'cl', 'rim'];
  const KF = KFsrc.map(k => { const o = { h: k.h, hI: k.hI, sI: k.sI, tint: k.tint, night: k.night, bloom: k.bloom }; KFc.forEach(n => { o[n] = new THREE.Color(k[n]); }); return o; });
  { const f = KF[0], l = KF[KF.length - 1]; KF.push(Object.assign({}, f, { h: 24 })); }
  const CUR = { tint: [1, 1, 1] }; KFc.forEach(n => { CUR[n] = new THREE.Color(); });
  const moonDir = new THREE.Vector3(-0.45, 0.6, 0.35).normalize(), dayDir = new THREE.Vector3();
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  let curHour = 16.5;
  city.hour = () => curHour;
  city.setTime = function (hh) {
    const h = ((hh % 24) + 24) % 24; curHour = h;
    let i = 0; while (i < KF.length - 2 && h >= KF[i + 1].h) i++;
    const a = KF[i], b = KF[i + 1], t = ss(0, 1, (h - a.h) / (b.h - a.h));
    KFc.forEach(n => CUR[n].copy(a[n]).lerp(b[n], t));
    const L = (x, y) => x + (y - x) * t;
    const hI = L(a.hI, b.hI), sI = L(a.sI, b.sI), night = L(a.night, b.night), bloom = L(a.bloom, b.bloom);
    for (let k = 0; k < 3; k++) CUR.tint[k] = L(a.tint[k], b.tint[k]);
    // 태양/달 방향
    const dayW = ss(5.0, 6.2, h) * (1 - ss(19.2, 20.6, h));
    const u = Math.min(1, Math.max(0, (h - 5.5) / 14)), el = Math.pow(Math.sin(u * Math.PI), 0.9) * 0.55 + 0.05, az = (330 - 150 * u) * D2R, ce = Math.sqrt(1 - el * el);
    dayDir.set(Math.cos(az) * ce, el, Math.sin(az) * ce);
    sunDir.copy(moonDir).lerp(dayDir, dayW).normalize();
    sunL.position.copy(sunL.target.position).addScaledVector(sunDir, 120); sunL.color.copy(CUR.sC); sunL.intensity = sI;
    hemiL.color.copy(CUR.hS); hemiL.groundColor.copy(CUR.hG); hemiL.intensity = hI;
    scene.fog.color.copy(CUR.hor).lerp(CUR.mid, 0.12 * (1 - night)); scene.background.copy(scene.fog.color);
    const su = skyMat.uniforms; su.uTop.value.copy(CUR.top); su.uMid.value.copy(CUR.mid); su.uHor.value.copy(scene.fog.color); su.uSunCol.value.copy(CUR.sC); su.uNight.value = night;
    const bu = bMat.uniforms; bu.uFog.value.copy(scene.fog.color); bu.uNight.value = night * 0.95 + 0.05;
    bu.uAmbTop.value.copy(CUR.hS).multiplyScalar(hI * 1.7); bu.uAmbBot.value.copy(CUR.hG).lerp(CUR.hS, 0.35).multiplyScalar(hI * 1.5); bu.uSunCol.value.copy(CUR.sC).multiplyScalar(sI * 0.95);
    cardTint.value.setRGB(CUR.tint[0], CUR.tint[1], CUR.tint[2]); rimU.value.copy(CUR.rim); rimK.value = 0.34 - 0.12 * night;
    clouds.children.forEach(c => { c.material.color.copy(CUR.cl); c.material.opacity = (c.userData.op || 0.9) * (1 - 0.45 * night); });
    glowMats.forEach(g => { g[0].opacity = g[1] * (0.1 + 2.3 * night * night); g[0].size = g[2] * (0.75 + 0.6 * night); });
    postMat.uniforms.uBloom.value = bloom; city.sunAmt = (1 - night) * dayW; curNight = night;
  };
  city.setTime(16.5);
  city.resize = resizePost;
  city.setScale = function (v) { qScale = v; resizePost(); };
  let usePost = !/nopost/.test(location.search); city.setPost = function (v) { usePost = v; };
  let shFrame = 0;
  city.render = function (cam) {
    renderer.shadowMap.needsUpdate = (shFrame++ % 2) === 0;
    if (!usePost) { renderer.render(scene, cam); return; }
    sunV.copy(sunDir).multiplyScalar(300).add(cam.position).project(cam);
    const vis = sunV.z < 1 ? 1 : 0, ex = Math.max(Math.abs(sunV.x), Math.abs(sunV.y));
    postMat.uniforms.uSunUV.value.set(sunV.x * 0.5 + 0.5, sunV.y * 0.5 + 0.5);
    postMat.uniforms.uSunAmt.value = vis * (1 - Math.min(1, Math.max(0, (ex - 1.0) / 0.8))) * 0.3 * (city.sunAmt == null ? 1 : city.sunAmt);
    renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.setRenderTarget(null);
    postMat.uniforms.tDiffuse.value = rt.texture; renderer.render(postScene, postCam);
  };
  city.persist = new Set([sky, clouds, motes, ...birds.map(b => b.s)]);
  return city;
}
global.buildCity = buildCity;
})(window);
