/* =========================================================
   神绮 · 新版首页脚本
   - 阶段：视口中线所在的版块决定背景、六翼与 HUD（html[data-phase]）
   - HUD 血条：随滚动减少，到底显示「撃破！」
   - 神战对话：四条路线，逐字显示，可展开全部台词
   - 神绮之日（11.08）倒计时
   导航、滚动显现、扭蛋机仍由 main.js 负责
   ========================================================= */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ==================== 1. 阶段 + HUD ==================== */
  const hud = $('.hud');
  const hudPhase = $('#hudPhase');
  const hudHp = $('#hudHp');
  let phase = root.dataset.phase || '1';
  let defeated = false;

  function paintPhase() {
    if (hudPhase) hudPhase.textContent = defeated ? '撃破！' : 'PHASE ' + phase + '/9';
  }

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        phase = en.target.dataset.phase;
        root.dataset.phase = phase;
        paintPhase();
      });
    }, { rootMargin: '-50% 0px -50% 0px' });
    $$('#main [data-phase]').forEach((el) => io.observe(el));
  }

  let raf = 0;
  function paintHp() {
    raf = 0;
    const max = Math.max(1, root.scrollHeight - window.innerHeight);
    const p = Math.min(1, Math.max(0, window.scrollY / max));
    if (hudHp) hudHp.style.transform = 'scaleX(' + (1 - p).toFixed(4) + ')';
    const down = p > 0.995;
    if (down !== defeated) {
      defeated = down;
      if (hud) hud.classList.toggle('is-down', down);
      paintPhase();
    }
  }
  window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(paintHp); }, { passive: true });
  window.addEventListener('resize', paintHp);
  paintHp();

  /* ==================== 2. 神战对话 ==================== */
  (() => {
    const dlg = $('#dlg');
    if (!dlg) return;
    const screen = $('#dlgScreen');
    const boss = $('#dlgBoss');
    const player = $('#dlgPlayer');
    const live = $('#dlgLive');
    const count = $('#dlgCount');
    const next = $('#dlgNext');
    const all = $('#dlgAll');
    const tabs = $$('[role="tab"]', dlg);
    if (!screen || !boss || !player || !next || !tabs.length) return;

    const NAMES = { shinki: '神绮', reimu: '灵梦', marisa: '魔理沙', mima: '魅魔', yuuka: '幽香' };
    let lines = [];
    let idx = 0;
    let typing = 0;
    let current = null;   // { row, span, text }

    dlg.classList.add('is-enhanced');
    screen.hidden = false;

    function clearRows() {
      [boss, player].forEach((r) => {
        r.querySelector('b').textContent = '';
        r.querySelector('span').textContent = '';
        r.classList.remove('is-current', 'is-done');
      });
    }

    function finishTyping() {
      clearInterval(typing);
      typing = 0;
      if (!current) return;
      current.span.textContent = current.text;
      current.row.classList.add('is-done');
    }

    function show(i, instant) {
      finishTyping();
      idx = i;
      const who = lines[i].dataset.who;
      const row = who === 'shinki' ? boss : player;
      const span = row.querySelector('span');
      const text = lines[i].textContent.trim();
      [boss, player].forEach((r) => r.classList.toggle('is-current', r === row));
      row.classList.remove('is-done');
      row.style.setProperty('--who', 'var(--c-' + who + ')');
      row.querySelector('b').textContent = NAMES[who] || '';
      current = { row, span, text };
      if (live) live.textContent = (NAMES[who] || '') + '：' + text;
      if (count) count.textContent = (i + 1) + ' / ' + lines.length;
      next.textContent = i === lines.length - 1 ? '重新开始 ↺' : '下一句 ▼';

      if (instant || reduceMotion) { finishTyping(); return; }
      let n = 0;
      span.textContent = '';
      typing = setInterval(() => {
        n += 1;
        span.textContent = text.slice(0, n);
        if (n >= text.length) finishTyping();
      }, 34);
    }

    function step() {
      if (typing) { finishTyping(); return; }
      if (idx === lines.length - 1) clearRows();
      show(idx + 1 < lines.length ? idx + 1 : 0);
    }

    function selectRoute(tab, opts) {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      });
      if (opts && opts.focus) tab.focus();
      lines = $$('li', document.getElementById(tab.getAttribute('aria-controls')));
      clearRows();
      if (lines.length) show(0, opts && opts.instant);
    }

    tabs.forEach((t, i) => {
      t.addEventListener('click', () => selectRoute(t));
      t.addEventListener('keydown', (e) => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        selectRoute(tabs[(i + d + tabs.length) % tabs.length], { focus: true });
      });
    });
    next.addEventListener('click', step);
    screen.addEventListener('click', (e) => { if (!e.target.closest('button')) step(); });
    if (all) {
      all.addEventListener('click', () => {
        const open = dlg.classList.toggle('show-all');
        all.setAttribute('aria-expanded', String(open));
        all.textContent = open ? '收起台词' : '全部台词';
      });
    }

    selectRoute(tabs[0], { instant: true });
  })();

  /* ==================== 3. 神绮之日倒计时 ==================== */
  (() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let target = new Date(now.getFullYear(), 10, 8);
    if (today > target) target = new Date(now.getFullYear() + 1, 10, 8);
    const days = Math.round((target - today) / 86400000);
    const a = $('#dayCount');
    const b = $('#dayCount2');
    if (a) a.textContent = days === 0 ? '今天就是 11.08 神绮之日！' : '距 11.08 神绮之日还有 ' + days + ' 天';
    if (b) b.textContent = days === 0 ? '今天就是神绮之日。' : '每年的神绮之日，距下一次还有 ' + days + ' 天。';
  })();
})();
