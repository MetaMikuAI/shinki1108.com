/* =========================================================
   夜穹星星（旧版各页）
   - 紧跟在 #bgStars 之后同步执行：首帧就有星星，不会等页面显示后才冒出来
   - 位置用固定种子生成：数量规则与原来一致，同一设备上每页的星星都在同一位置
   - 闪烁相位按绝对时间对齐：换页时每颗星接着上一页的节奏闪，不会整片重来
     （先用负延迟粗对齐；动画真正开始时（animationstart）再用 Web Animations 精确对齐。
       动画起点是首次计算样式的时刻，比脚本执行晚，且每页晚得不一样，
       偶尔还会被重新创建，所以每次开始都对齐一次）
   ========================================================= */
(function () {
  'use strict';

  var box = document.getElementById('bgStars');
  if (!box || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var isMobile = window.matchMedia('(max-width: 760px), (pointer: coarse)').matches;
  var count = Math.min(isMobile ? 55 : 90, Math.max(isMobile ? 28 : 40, Math.round(window.innerWidth / (isMobile ? 26 : 16))));

  // mulberry32：固定种子的伪随机数，各浏览器结果一致
  var seed = 1108;
  function rnd() {
    seed = (seed + 0x6D2B79F5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  var now = Date.now() / 1000;
  var frag = document.createDocumentFragment();
  for (var i = 0; i < count; i++) {
    var s = document.createElement('span');
    var x = rnd() * 100, y = rnd() * 72, w = 1.2 + rnd() * 1.8;
    var dur = +(2.4 + rnd() * 4).toFixed(2);           // 与 CSS 里的周期取同一个值，相位才对得上
    var phase = rnd();
    s.className = 'star';
    s.style.setProperty('--x', x.toFixed(2) + '%');
    s.style.setProperty('--y', y.toFixed(2) + '%');
    s.style.setProperty('--w', w.toFixed(1) + 'px');
    s.style.setProperty('--dur', dur + 's');
    var delay = -((now + phase * dur) % dur);
    s.style.setProperty('--delay', delay.toFixed(3) + 's');
    s._twinkle = { dur: dur, phase: phase, delay: +delay.toFixed(3) };
    frag.appendChild(s);
  }

  // 当前帧对应的绝对时间：设置进度参照的是这一帧的时间线，所以用时间线时间而不是 Date.now()
  function frameNow() {
    var tl = document.timeline && document.timeline.currentTime;
    if (tl == null) tl = performance.now();
    return ((performance.timeOrigin || (Date.now() - performance.now())) + tl) / 1000;
  }
  box.addEventListener('animationstart', function (e) {
    var it = e.target._twinkle;
    var a = it && e.target.getAnimations && e.target.getAnimations()[0];
    if (!a) return;
    var target = (frameNow() + it.phase * it.dur) % it.dur;          // 此刻应处的进度（秒）
    a.currentTime = (((target + it.delay) % it.dur + it.dur) % it.dur) * 1000;   // 进度 = currentTime − delay
  });
  box.appendChild(frag);
})();
