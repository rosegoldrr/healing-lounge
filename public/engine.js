/* 엔진 소리 합성 (WebAudio) — 차종마다 실린더 수·회전수·변속·터보·하이브리드가 달라요.
   실제 녹음 파일이 아니라 엔진 구조를 흉내 낸 합성음이에요. */
window.ENG = (function () {
  const T = {
    i4:     { cyl: 4,  idle: 850,  red: 6500,  gears: 5, vmax: 27, cut: 2400, hq: 1.5, sub: 0.0,  gain: 0.5,  noise: 0.20, drive: 1.6 },
    v6:     { cyl: 6,  idle: 800,  red: 6800,  gears: 5, vmax: 27, cut: 2800, hq: 1.3, sub: 0.1,  gain: 0.5,  noise: 0.20, drive: 1.8 },
    v8:     { cyl: 8,  idle: 750,  red: 7000,  gears: 5, vmax: 27, cut: 2600, hq: 1.2, sub: 0.45, gain: 0.55, noise: 0.22, drive: 2.0 },
    diesel: { cyl: 4,  idle: 650,  red: 3600,  gears: 5, vmax: 24, cut: 1500, hq: 1.8, sub: 0.0,  gain: 0.55, noise: 0.30, drive: 1.2, clatter: 1 },
    i6:     { cyl: 6,  idle: 800,  red: 7200,  gears: 8, vmax: 30, cut: 3800, hq: 1.0,  sub: 0.15, gain: 0.6,  noise: 0.24, drive: 2.6, pops: 1, turbo: 1 },   // M4: 직렬6 트윈터보 — 매끈한 굵은 소리 + 터보 휘파람 + 팝
    i6r:    { cyl: 6,  idle: 950,  red: 8200,  gears: 6, vmax: 33, cut: 5600, hq: 0.8, sub: 0.0, gain: 0.64, noise: 0.3, drive: 3.4, pops: 1, whine: 1 },   // M4 GT3: 레이싱 직렬6 — 날카롭고 거친 소리 + 기어 휘파람
    v8t:    { cyl: 8,  idle: 1000, red: 7800,  gears: 5, vmax: 34, cut: 3400, hq: 1.05, sub: 0.6,  gain: 0.64, noise: 0.28, drive: 3.0, turbo: 1, pops: 1 },   // F40: 트윈터보 V8 — 투박하게 으르렁 + 터보 휘파람
    v12:    { cyl: 12, idle: 900,  red: 8200,  gears: 5, vmax: 34, cut: 5400, hq: 0.78, sub: 0.0, gain: 0.62, noise: 0.22, drive: 2.8 },   // 쿤타치: 자연흡기 V12 — 높고 거친 고음 비명
    v12b:   { cyl: 12, idle: 900,  red: 8600,  gears: 7, vmax: 35, cut: 6800, hq: 0.68, sub: 0.0, gain: 0.66, noise: 0.28, drive: 3.4, pops: 1 },   // 센테나리오: 날카로운 V12 + 변속 때 폭발음
    v12h:   { cyl: 12, idle: 950,  red: 9500,  gears: 7, vmax: 36, cut: 7600, hq: 0.62, sub: 0.0, gain: 0.64, noise: 0.2,  drive: 2.6, hybrid: 1, pops: 1 },   // 라페라리: 9500rpm 고음 V12 + 하이브리드 전동 소리
    i4b:    { cyl: 4,  idle: 1400, red: 12500, gears: 6, vmax: 34, cut: 9000, hq: 0.62, sub: 0.0, gain: 0.5,  noise: 0.34, drive: 3.0, thin: 1, pops: 1, rasp: 1 },   // 직렬4기통 슈퍼바이크: 고회전 비명 + 흡기 으르렁 + 변속 팝
    dragon: { dragon: 1 }
  };
  const lerp = (a, b, k) => a + (b - a) * k, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  let noiseBuf = null;
  function noise(c) { if (noiseBuf && noiseBuf.sampleRate === c.sampleRate) return noiseBuf; const n = c.sampleRate * 2, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; return (noiseBuf = b); }
  const waveCache = {};
  function wave(c, hq, thin) {
    const k = hq + '|' + thin; if (waveCache[k]) return waveCache[k];
    const N = 40, re = new Float32Array(N), im = new Float32Array(N);
    for (let n = 1; n < N; n++) { im[n] = (1 / Math.pow(n, hq)) * (thin ? (n % 2 ? 1 : 0.55) : (n % 2 ? 1 : 0.8)); }
    return (waveCache[k] = c.createPeriodicWave(re, im));
  }
  function curve(k) { const n = 256, a = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; a[i] = Math.tanh(x * k) / Math.tanh(k); } return a; }

  function create(c, dest, type) {
    const P = T[type] || T.i4, E = { type, P, on: 0, rpm: 0, gear: 1, shiftT: 0, st: 0, t: 0, thr: 0, lastThr: 0, vol: 0, boost: 0, pop: 0 };
    const out = c.createGain(); out.gain.value = 0; out.connect(dest); E.out = out;
    if (P.dragon) {
      /* 드래곤: 날갯짓 바람소리 + 낮은 울음 */
      const nz = c.createBufferSource(); nz.buffer = noise(c); nz.loop = true;
      const bp = c.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.value = 500; const wg = c.createGain(); wg.gain.value = 0.0001;
      nz.connect(bp); bp.connect(wg); wg.connect(out); nz.start();
      const g1 = c.createOscillator(); g1.type = 'sawtooth'; g1.frequency.value = 52; const g2 = c.createOscillator(); g2.type = 'sawtooth'; g2.frequency.value = 55.5;
      const gl = c.createBiquadFilter(); gl.type = 'lowpass'; gl.frequency.value = 220; const gg = c.createGain(); gg.gain.value = 0.0001;
      g1.connect(gl); g2.connect(gl); gl.connect(gg); gg.connect(out); g1.start(); g2.start();
      const rz = c.createBufferSource(); rz.buffer = noise(c); rz.loop = true; const rb = c.createBiquadFilter(); rb.type = 'bandpass'; rb.frequency.value = 700; rb.Q.value = 0.7; const rg = c.createGain(); rg.gain.value = 0.0001;
      rz.connect(rb); rb.connect(rg); rg.connect(out); rz.start();
      E.nodes = { nz, bp, wg, g1, g2, gl, gg, rz, rb, rg };
      return E;
    }
    const o1 = c.createOscillator(), o2 = c.createOscillator(), o3 = c.createOscillator();
    const w = wave(c, P.hq, P.thin); o1.setPeriodicWave(w); o2.setPeriodicWave(w); o3.type = 'triangle';
    const mix = c.createGain(), subg = c.createGain(); subg.gain.value = P.sub * 0.7;
    o1.connect(mix); o2.connect(mix); o3.connect(subg); subg.connect(mix);
    const sh = c.createWaveShaper(); sh.curve = curve(P.drive); sh.oversample = '2x';
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.4;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = P.thin ? 120 : 45;
    const body = c.createGain();
    mix.connect(sh); sh.connect(lp); lp.connect(hp); hp.connect(body); body.connect(out);
    const nz = c.createBufferSource(); nz.buffer = noise(c); nz.loop = true;
    const nb = c.createBiquadFilter(); nb.type = 'bandpass'; nb.Q.value = 0.8; nb.frequency.value = 1400; const ng = c.createGain(); ng.gain.value = 0.0001;
    nz.connect(nb); nb.connect(ng); ng.connect(out);
    o1.start(); o2.start(); o3.start(); nz.start();
    E.nodes = { o1, o2, o3, mix, subg, sh, lp, hp, body, nz, nb, ng };
    if (P.turbo || P.hybrid || P.whine) {
      const wo = c.createOscillator(); wo.type = P.hybrid ? 'sine' : 'sine'; wo.frequency.value = 2000; const wg = c.createGain(); wg.gain.value = 0.0001; wo.connect(wg); wg.connect(out); wo.start(); E.nodes.wo = wo; E.nodes.wg = wg;
    }
    return E;
  }

  /* 속도 → 기어·RPM */
  function rpmFor(E, v, thr, dt) {
    const P = E.P, G = P.gears, vm = P.vmax, vg = g => vm * g / G;
    let g = E.gear;
    if (E.shiftT > 0) E.shiftT -= dt;
    if (E.shiftT <= 0) {
      if (g < G && v > vg(g) * 0.97 && thr > 0.3) { E.gear = ++g; E.shiftT = 0.16; E.pop = 1; }
      else if (g > 1 && v < vg(g - 1) * 0.62) { E.gear = --g; E.shiftT = 0.1; E.pop = 0.5; }
    }
    const lo = vg(g - 1) * 0.55, span = Math.max(1, vg(g) - lo);
    const gr = P.idle + (P.red - P.idle) * clamp((v - lo) / span, 0, 1);
    const launch = P.idle + thr * (P.red * 0.55 - P.idle);
    let tgt = v < 3 ? Math.max(gr * clamp(v / 3, 0, 1), launch * (1 - clamp(v / 3, 0, 1)) + gr * clamp(v / 3, 0, 1)) : gr;
    if (E.shiftT > 0) tgt = lerp(tgt, P.idle + (P.red - P.idle) * 0.35, 0.8);
    return Math.max(P.idle * (0.97), tgt);
  }

  /* 매 프레임: v=속도(m/s), thr=가속(0~1), vol=거리 감쇠(0~1), on=시동 */
  function update(E, c, dt, v, thr, vol, on, fireNow) {
    const t = c.currentTime, P = E.P, N = E.nodes;
    if (P.dragon) {
      const sp = Math.abs(v), k = on ? 1 : 0;
      N.wg.gain.setTargetAtTime(k * (0.05 + Math.min(0.35, sp * 0.012)) * vol, t, 0.1);
      N.bp.frequency.setTargetAtTime(350 + sp * 40, t, 0.1);
      N.gg.gain.setTargetAtTime(k * (0.10 + thr * 0.12) * vol, t, 0.2);
      N.g1.frequency.setTargetAtTime(48 + thr * 18, t, 0.2); N.g2.frequency.setTargetAtTime(51 + thr * 18, t, 0.2);
      N.gl.frequency.setTargetAtTime(200 + thr * 160, t, 0.2);
      N.rg.gain.setTargetAtTime(fireNow ? 0.55 * vol : 0.0001, t, fireNow ? 0.03 : 0.25);
      N.rb.frequency.setTargetAtTime(fireNow ? 900 : 500, t, 0.3);
      E.out.gain.setTargetAtTime(k ? 0.9 : 0.0001, t, 0.1);
      return;
    }
    if (on && !E.on) { E.on = 1; E.st = 0; E.t = 0; }                  // 시동 걸기 시작
    if (!on && E.on) { E.on = 0; E.st = 3; E.t = 0; }                  // 시동 끄기
    E.t += dt;
    let rpm = E.rpm, volMul = 1, thrEff = thr;
    if (E.st === 0) {                                                  // 스타터 크랭킹 → 점화
      rpm = lerp(0, 260 + 40 * Math.sin(E.t * 30), clamp(E.t / 0.35, 0, 1)); volMul = 0.55; thrEff = 0;
      if (E.t > 1.05) { E.st = 1; E.t = 0; rpm = P.idle * 1.9; }       // 점화! 살짝 부앙
    } else if (E.st === 1) {
      rpm = lerp(P.idle * 1.9, P.idle * 1.05, clamp(E.t / 0.7, 0, 1)); if (E.t > 0.7) E.st = 2;
    } else if (E.st === 2) {
      const tgt = rpmFor(E, v, thr, dt); rpm = lerp(E.rpm, tgt, 1 - Math.exp(-(tgt > E.rpm ? 9 : 5) * dt));
      rpm *= 1 + (v < 1.5 && thr < 0.1 ? 0.025 * Math.sin(E.t * 9.5) + 0.012 * Math.sin(E.t * 23) : 0);   // 공회전 떨림
    } else {                                                           // 꺼지는 중
      rpm = Math.max(0, lerp(E.rpm, 0, 1 - Math.exp(-5 * dt))); volMul = clamp(1 - E.t / 0.8, 0, 1); thrEff = 0; if (E.t > 1.0) { E.st = 4; }
    }
    E.rpm = rpm;
    const idleOn = E.st === 4 ? 0 : 1;
    const f0 = Math.max(8, rpm / 60 * (P.cyl / 2));                    // 점화 주파수
    const th = E.st === 2 ? (E.shiftT > 0 ? 0.05 : thrEff) : thrEff;
    const load = clamp(rpm / P.red, 0, 1);
    N.o1.frequency.setTargetAtTime(f0, t, 0.02); N.o2.frequency.setTargetAtTime(f0 * (1.004 + (P.cyl > 6 ? 0.002 : 0.004)), t, 0.02); N.o3.frequency.setTargetAtTime(f0 * 0.5, t, 0.02);
    N.lp.frequency.setTargetAtTime(P.cut * (0.18 + 0.55 * th + 0.5 * load), t, 0.04);
    const amp = (0.22 + 0.78 * (0.25 + 0.75 * th) * (0.45 + 0.55 * load)) * P.gain * vol * volMul * idleOn;
    N.body.gain.setTargetAtTime(amp, t, 0.03);
    // 흡기·배기 바람소리 + 디젤 덜덜
    let ngv = (P.noise * (0.2 + 0.8 * th) * (0.3 + load)) * vol * volMul * idleOn;
    if (P.clatter) ngv *= 1.4 + 0.5 * Math.sin(E.t * (rpm / 60 * 2));
    N.nb.frequency.setTargetAtTime(P.rasp ? 1800 + rpm * 0.6 : 900 + rpm * 0.35, t, 0.05); N.ng.gain.setTargetAtTime(Math.max(0.0001, ngv * 0.5), t, 0.04);
    // 변속 · 가속 뗄 때 배기 팝
    if (P.pops && E.pop > 0 && E.st === 2) { N.ng.gain.setValueAtTime(0.5 * vol, t); N.ng.gain.setTargetAtTime(0.0001, t + 0.01, 0.06); N.lp.frequency.setValueAtTime(P.cut * 1.2, t); E.pop = 0; }
    else E.pop = 0;
    // 터보 · 하이브리드 · 기어 휘파람
    if (N.wo) {
      if (P.turbo) { E.boost = lerp(E.boost, th * load, 1 - Math.exp(-2.2 * dt)); N.wo.frequency.setTargetAtTime(1500 + E.boost * 4500, t, 0.05); N.wg.gain.setTargetAtTime(0.03 * E.boost * vol * idleOn, t, 0.05); }
      else if (P.hybrid) { N.wo.frequency.setTargetAtTime(500 + Math.abs(v) * 70 + rpm * 0.05, t, 0.05); N.wg.gain.setTargetAtTime(0.018 * (0.4 + th) * vol * idleOn, t, 0.05); }
      else { N.wo.frequency.setTargetAtTime(700 + Math.abs(v) * 90, t, 0.05); N.wg.gain.setTargetAtTime(0.01 * Math.min(1, Math.abs(v) / 8) * vol * idleOn, t, 0.05); }
    }
    E.out.gain.setTargetAtTime(E.st === 4 ? 0.0001 : 1, t, 0.03);
  }
  function destroy(E) {
    try { E.out.gain.setValueAtTime(0, 0); } catch (_) { }
    const N = E.nodes; for (const k in N) { try { if (N[k].stop) N[k].stop(); } catch (_) { } }
    try { E.out.disconnect(); } catch (_) { }
  }
  /* 드래곤 울부짖음 */
  function roar(c, dest, vol) {
    const t = c.currentTime, o = [c.createOscillator(), c.createOscillator()], g = c.createGain(), lp = c.createBiquadFilter(), lfo = c.createOscillator(), lg = c.createGain();
    o[0].type = 'sawtooth'; o[1].type = 'square';
    o[0].frequency.setValueAtTime(95, t); o[0].frequency.exponentialRampToValueAtTime(190, t + 0.35); o[0].frequency.exponentialRampToValueAtTime(55, t + 1.8);
    o[1].frequency.setValueAtTime(48, t); o[1].frequency.exponentialRampToValueAtTime(95, t + 0.35); o[1].frequency.exponentialRampToValueAtTime(28, t + 1.8);
    lfo.frequency.value = 17; lg.gain.value = 9; lfo.connect(lg); lg.connect(o[0].frequency);
    lp.type = 'lowpass'; lp.Q.value = 3; lp.frequency.setValueAtTime(500, t); lp.frequency.exponentialRampToValueAtTime(1700, t + 0.4); lp.frequency.exponentialRampToValueAtTime(260, t + 1.8);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.7 * vol, t + 0.12); g.gain.setValueAtTime(0.7 * vol, t + 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
    const nz = c.createBufferSource(); nz.buffer = noise(c); nz.loop = true; const nb = c.createBiquadFilter(); nb.type = 'bandpass'; nb.frequency.setValueAtTime(700, t); nb.frequency.exponentialRampToValueAtTime(300, t + 1.8); nb.Q.value = 0.9;
    const ng = c.createGain(); ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(0.35 * vol, t + 0.15); ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    o.forEach(x => { x.connect(lp); x.start(t); x.stop(t + 2); }); lfo.start(t); lfo.stop(t + 2);
    lp.connect(g); g.connect(dest); nz.connect(nb); nb.connect(ng); ng.connect(dest); nz.start(t); nz.stop(t + 2);
  }
  return { create, update, destroy, roar, types: T };
})();
