/* =========================================================
   神绮桌宠 · 正式页面启动器
   - 页面完全加载后、浏览器空闲时才启动（不抢首屏、不拖慢滚动）
   - 手机用更小尺寸
   - 尊重系统「减少动态效果」
   - 同一页面只会有一只（重复引入也不会叠）
   想调参只改这里：size / bottom / activityLevel
   ========================================================= */
(function () {
  'use strict';

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
      reducedMotion: reduce
    });
  }

  function later() {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(boot, { timeout: 2500 });
    } else {
      window.setTimeout(boot, 1200);
    }
  }

  if (document.readyState === 'complete') later();
  else window.addEventListener('load', later, { once: true });
})();
