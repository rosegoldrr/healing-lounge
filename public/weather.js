/* 날씨: 비·눈 (모두 같은 시간에 같은 날씨를 봐요). 주소 끝에 ?weather=rain / snow / clear 로 고정할 수 있어요. */
window.WEATHER = (function () {
  let THREE, scene, now, touch, rain, snow, rainPos, snowPos, rainSeed = [], snowSeed = [], el;
  const W = { rain: 0, snow: 0, kind: 'clear', tRain: 0, tSnow: 0 };
  const forced = (new URLSearchParams(location.search).get('weather') || '').toLowerCase();
  const BLOCK = 12 * 60 * 1000;                      // 12분마다 날씨가 바뀔 수 있어요
  function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); n = n ^ (n >>> 15); return (n >>> 0) / 4294967296; }
  function pick() {
    if (forced === 'rain' || forced === 'snow' || forced === 'clear') return forced;
    const m = new Date().getMonth(), b = Math.floor(now() / BLOCK), r = hash(b * 2654435761 | 0);
    const winter = m >= 10 || m <= 2;                // 11월~3월에만 눈
    if (r < 0.2) return 'rain';
    if (r < 0.34 && winter) return 'snow';
    return 'clear';
  }
  function init(T, sc, nowFn, isTouch) {
    THREE = T; scene = sc; now = nowFn; touch = !!isTouch;
    const NR = touch ? 320 : 900, NS = touch ? 420 : 1100;
    rainPos = new Float32Array(NR * 6); for (let i = 0; i < NR; i++) rainSeed.push([Math.random(), Math.random(), Math.random()]);
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: '#cfe3ff', transparent: true, opacity: 0.0, depthWrite: false }));
    rain.frustumCulled = false; rain.visible = false; scene.add(rain);
    snowPos = new Float32Array(NS * 3); for (let i = 0; i < NS; i++) snowSeed.push([Math.random(), Math.random(), Math.random(), Math.random() * 6.28]);
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
    const cv = document.createElement('canvas'); cv.width = cv.height = 32; const cx = cv.getContext('2d'), gr = cx.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); cx.fillStyle = gr; cx.fillRect(0, 0, 32, 32);
    snow = new THREE.Points(sg, new THREE.PointsMaterial({ map: new THREE.CanvasTexture(cv), color: '#ffffff', size: touch ? 0.3 : 0.26, transparent: true, opacity: 0.0, depthWrite: false, sizeAttenuation: true }));
    snow.frustumCulled = false; snow.visible = false; scene.add(snow);
    el = document.createElement('div'); el.id = 'wx'; el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:1;opacity:0;transition:none;background:linear-gradient(180deg,rgba(36,54,88,.42),rgba(60,80,110,.2))';
    document.body.appendChild(el);
  }
  const BX = 30, BY = 20, BZ = 30;
  function wrap(v, c, s) { return ((v - c + s / 2) % s + s) % s - s / 2 + c; }
  let t = 0;
  function update(dt, cam, outdoors) {
    if (!rain) return;
    t += dt;
    const k = pick(); W.kind = k;
    const tr = k === 'rain' ? 1 : 0, ts = k === 'snow' ? 1 : 0;
    W.rain += (tr - W.rain) * Math.min(1, dt * 0.35); W.snow += (ts - W.snow) * Math.min(1, dt * 0.35);
    const on = !!outdoors;
    rain.visible = on && W.rain > 0.02; snow.visible = on && W.snow > 0.02;
    el.style.opacity = on ? String(Math.min(1, W.rain * 0.9 + W.snow * 0.25)) : '0';
    el.style.background = W.rain >= W.snow ? 'linear-gradient(180deg,rgba(36,54,88,.42),rgba(60,80,110,.2))' : 'linear-gradient(180deg,rgba(210,225,245,.22),rgba(235,242,255,.08))';
    if (rain.visible) {
      rain.material.opacity = 0.7 * W.rain;
      const N = rainSeed.length, sp = 30, wind = 3.2;
      for (let i = 0; i < N; i++) {
        const s = rainSeed[i];
        s[1] -= sp * dt / BY; if (s[1] < 0) { s[1] += 1; s[0] = Math.random(); s[2] = Math.random(); }
        const x = wrap(s[0] * BX + cam.x - BX / 2 + wind * t * 0, cam.x, BX), z = wrap(s[2] * BZ + cam.z - BZ / 2, cam.z, BZ), y = cam.y - 6 + s[1] * BY;
        const o = i * 6; rainPos[o] = x; rainPos[o + 1] = y; rainPos[o + 2] = z; rainPos[o + 3] = x + wind * 0.03; rainPos[o + 4] = y + 1.5; rainPos[o + 5] = z;
      }
      rain.geometry.attributes.position.needsUpdate = true;
    }
    if (snow.visible) {
      snow.material.opacity = 0.9 * W.snow;
      const N = snowSeed.length;
      for (let i = 0; i < N; i++) {
        const s = snowSeed[i];
        s[1] -= (1.1 + s[0] * 0.7) * dt / BY; if (s[1] < 0) { s[1] += 1; s[0] = Math.random(); s[2] = Math.random(); }
        const x = wrap(s[0] * BX + cam.x - BX / 2, cam.x, BX) + Math.sin(t * 0.8 + s[3]) * 0.6, z = wrap(s[2] * BZ + cam.z - BZ / 2, cam.z, BZ) + Math.cos(t * 0.6 + s[3]) * 0.5, y = cam.y - 6 + s[1] * BY;
        const o = i * 3; snowPos[o] = x; snowPos[o + 1] = y; snowPos[o + 2] = z;
      }
      snow.geometry.attributes.position.needsUpdate = true;
    }
  }
  return { init, update, state: W };
})();
