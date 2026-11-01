/* =========================================================
   神绮桌宠 · 页面启动器
   - 页面解析完就启动；从别的页面过来时站在原来的位置，不再重新落下
   - 预渲染的页面等用户真正打开时再启动，这样拿到的位置才是最新的
   - 手机用更小尺寸；尊重系统「减少动态效果」
   - 同一页面只会有一只（重复引入也不会叠）
   想调参只改这里：size / bottom / activityLevel
   ========================================================= */
(function () {
  'use strict';

  var POS_KEY = 'shinki-pet-pos';   // 与 pet.js 一致

  function readPos() {
    try { return JSON.parse(sessionStorage.getItem(POS_KEY) || 'null'); } catch (_) { return null; }
  }

  function boot() {
    if (!window.ShinkiPet) return;
    if (document.querySelector('.pet')) return;          // 已有就不再生成

    var small = window.matchMedia('(max-width: 720px)').matches;
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    window.ShinkiPet.init({
      size: small ? 104 : 150,
      bottom: small ? 6 : 10,
      activityLevel: 'quiet',      // 正式页面安静一点：只是偶尔走两步
      exprIdleEvery: 0,            // 不自动换表情（只靠待机微动作）
      reducedMotion: reduce,
      restore: readPos()
    });
  }

  if (document.prerendering) document.addEventListener('prerenderingchange', boot, { once: true });
  else boot();
})();
