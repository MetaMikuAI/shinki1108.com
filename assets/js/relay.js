/* ==================== 接力时间 · 11.8 倒计时（仅接力页） ==================== */
  (function initRelayTimeCountdown() {
    const $ = (sel, root = document) => root.querySelector(sel);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const daysEl = $('#wcDays');
    const hoursEl = $('#wcHours');
    const minsEl = $('#wcMins');
    const secsEl = $('#wcSecs');
    const targetEl = $('#winterTarget');
    const footEl = $('#winterFoot');
    if (!daysEl || !hoursEl || !minsEl || !secsEl) return;

    /* 接力时间 · 11.8
       把 shinki 六个小写字母的 ASCII 码相加得到 454，16 进制转 8 进制即 1108 → 11 月 08 日；
       其中的 8 也是躺下来的「无限」∞，对应神绮角色曲英文副标题里的 Infinite Being。 */
    function nextTarget(now) {
      const y = now.getFullYear();
      const t = new Date(y, 10, 8, 0, 0, 0, 0);                 // 今年的 11 月 8 日
      return now < new Date(y, 10, 9) ? t : new Date(y + 1, 10, 8, 0, 0, 0, 0);  // 已过则取明年
    }

    const pad = (n) => String(n).padStart(2, '0');
    let target = nextTarget(new Date());

    function paintTarget() {
      if (!targetEl) return;
      targetEl.textContent = '目标 · ' + target.getFullYear() + ' 年 11 月 08 日（接力时间）';
    }
    paintTarget();

    function tick() {
      const now = new Date();
      if (now >= target) {
        const endOfDay = new Date(target.getFullYear(), target.getMonth(), target.getDate() + 1, 0, 0, 0, 0);
        if (now < endOfDay) {
          daysEl.textContent = '00'; hoursEl.textContent = '00';
          minsEl.textContent = '00'; secsEl.textContent = '00';
          if (footEl) footEl.textContent = '✦ 11 月 8 日 —— 接力时间到了，把喜欢传下去吧 ✦';
          return;
        }
        target = nextTarget(now);
        paintTarget();
      }
      const diff = Math.max(0, target - now);
      daysEl.textContent = pad(Math.floor(diff / 86400000));
      hoursEl.textContent = pad(Math.floor(diff / 3600000) % 24);
      minsEl.textContent = pad(Math.floor(diff / 60000) % 60);
      secsEl.textContent = pad(Math.floor(diff / 1000) % 60);
      if (footEl) footEl.textContent = '✦ 11.8 —— 魔界の扉が開く日。';
      if (!reduceMotion && secsEl) {
        secsEl.classList.remove('pop');
        void secsEl.offsetWidth;
        secsEl.classList.add('pop');
      }
    }

    tick();
    setInterval(tick, 1000);
  })();
