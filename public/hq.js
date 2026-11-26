/* PC 전용 고화질: 둥근 물체(나무·가로등·벤치·분수·캐릭터 등)의 면 수를 늘려 각진 느낌을 없애요.
   폰(터치 기기)에서는 켜지지 않아요. 주소 끝에 ?lq 를 붙이면 PC에서도 끌 수 있어요. */
(function () {
  try {
    var touch = (window.matchMedia && matchMedia('(pointer:coarse)').matches) || ('ontouchstart' in window);
    var force = /[?&]hq\b/.test(location.search);
    if (!window.THREE || /[?&]lq\b/.test(location.search) || (!force && (touch || (navigator.hardwareConcurrency || 8) < 4))) return;
    var T = window.THREE, up = function (v, k, cap, skipAt) { return (v === undefined || v >= (skipAt || 1e9)) ? v : Math.min(cap, Math.round(v * k)); };
    function wrap(name, fix) {
      var O = T[name]; if (!O) return;
      T[name] = class extends O { constructor() { var a = Array.prototype.slice.call(arguments); try { a = fix(a) || a; } catch (e) { } super(...a); } };
      try { Object.defineProperty(T[name], 'name', { value: name }); } catch (e) { }
    }
    wrap('SphereGeometry', function (a) { a[1] = up(a[1], 2, 64, 40); a[2] = up(a[2], 2, 48, 30); return a; });
    wrap('CylinderGeometry', function (a) { a[3] = up(a[3] === undefined ? 8 : a[3], 2.5, 40, 24); return a; });
    wrap('ConeGeometry', function (a) { a[2] = up(a[2] === undefined ? 8 : a[2], 2.5, 40, 24); return a; });
    wrap('CircleGeometry', function (a) { a[1] = up(a[1] === undefined ? 8 : a[1], 1.6, 128, 64); return a; });
    wrap('TorusGeometry', function (a) { a[2] = up(a[2], 2, 32, 20); a[3] = up(a[3], 2, 96, 64); return a; });
    wrap('LatheGeometry', function (a) { a[1] = (a[1] === undefined || a[1] <= 24) ? 56 : a[1]; return a; });
    wrap('IcosahedronGeometry', function (a) { a[1] = (a[1] === undefined ? 0 : a[1]) + 1; if (a[1] > 2) a[1] = 2; return a; });
    window.HQ_GEOM = 1;
  } catch (e) { console.warn('hq off', e); }
})();
