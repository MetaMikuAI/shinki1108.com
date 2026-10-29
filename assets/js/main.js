(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = window.matchMedia('(max-width: 760px), (pointer: coarse)').matches;


  /* ==================== 2. 吸顶导航 ==================== */
  const header = $('#siteHeader');
  if (header) {
    const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 10);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ==================== 3. 移动端菜单 ==================== */
  const navToggle = $('#navToggle');
  const navLinks = $('#navLinks');

  /* 抽屉是 .site-header 的子元素，而导航条带 backdrop-filter / transform 时会
     成为 fixed 后代的包含块 → 抽屉会被压成导航条那么高。打开时给 body 加
     nav-open，由 CSS 临时取消那些属性，抽屉就正常相对视口铺开。 */
  function setNavOpen(open) {
    if (document.body.classList) document.body.classList.toggle('nav-open', !!open);
    if (navLinks) {
      const hidden = !open && window.matchMedia('(max-width: 760px)').matches;
      navLinks.setAttribute('aria-hidden', String(hidden));
      navLinks.inert = hidden;
    }
  }
  function closeNav() {
    if (navLinks) navLinks.classList.remove('open');
    if (navToggle) {
      navToggle.setAttribute('aria-expanded', 'false');
      navToggle.setAttribute('aria-label', '展开导航');
    }
    setNavOpen(false);
  }

  if (navToggle && navLinks) {
    setNavOpen(false);
    window.addEventListener('resize', closeNav);
    navToggle.addEventListener('click', () => {
      const open = !navLinks.classList.contains('open');
      navLinks.classList.toggle('open', open);
      navToggle.setAttribute('aria-expanded', String(open));
      navToggle.setAttribute('aria-label', open ? '收起导航' : '展开导航');
      setNavOpen(open);
    });
    $$('a', navLinks).forEach((a) => a.addEventListener('click', closeNav));
    document.addEventListener('click', (e) => {
      if (!navLinks.contains(e.target) && !navToggle.contains(e.target)) closeNav();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && navLinks.classList.contains('open')) closeNav();
    });
  }

  /* ==================== 4. 滚动显现 ==================== */
  const revealEls = $$('.reveal');
  if ('IntersectionObserver' in window && !reduceMotion) {
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (en.isIntersecting) {
          en.target.classList.add('in');
          io.unobserve(en.target);
        }
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach((el) => {
      const sibs = el.parentElement ? Array.from(el.parentElement.children) : [];
      const idx = sibs.filter((s) => s.classList && s.classList.contains('reveal')).indexOf(el);
      if (idx > 0) el.style.transitionDelay = Math.min(idx, 6) * 90 + 'ms';
      io.observe(el);
    });
  } else {
    revealEls.forEach((el) => el.classList.add('in'));
  }

  /* 兜底：脚本后插入的 .reveal 卡片不会被上面的观察器抓到（它只在加载时抓一次），
     这里定期补一次，避免"卡片/封面永远是 opacity:0" */
  const reinforceReveal = () => {
    $$('.reveal:not(.in)').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < innerHeight && r.bottom > 0) el.classList.add('in');
    });
  };
  setInterval(reinforceReveal, 1200);
  window.addEventListener('load', reinforceReveal);

  /* ==================== 5. 滚动高亮 ==================== */
  const spyLinks = $$('.nav-link').filter((l) => {
    const h = l.getAttribute('href');
    return h && h.charAt(0) === '#';
  });
  const spyTargets = spyLinks
    .map((l) => $(l.getAttribute('href')))
    .filter(Boolean);

  function setActive(id) {
    spyLinks.forEach((l) => {
      l.classList.toggle('is-active', l.getAttribute('href') === '#' + id);
    });
  }

  if ('IntersectionObserver' in window && spyTargets.length) {
    const spy = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting);
      if (!visible.length) return;
      visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      setActive(visible[0].target.id);
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
    spyTargets.forEach((s) => spy.observe(s));
  }


  /* ==================== 7. 页脚年份 ==================== */
  const yearEl = $('#year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ==================== 8. 夜穹星星 ==================== */
  const starsBox = $('#bgStars');
  if (starsBox && !reduceMotion) {
    const frag = document.createDocumentFragment();
    const starCount = Math.min(isMobile ? 55 : 90, Math.max(isMobile ? 28 : 40, Math.round(window.innerWidth / (isMobile ? 26 : 16))));
    for (let i = 0; i < starCount; i++) {
      const s = document.createElement('span');
      s.className = 'star';
      s.style.setProperty('--x', (Math.random() * 100).toFixed(2) + '%');
      s.style.setProperty('--y', (Math.random() * 72).toFixed(2) + '%');
      s.style.setProperty('--w', (1.2 + Math.random() * 1.8).toFixed(1) + 'px');
      s.style.setProperty('--dur', (2.4 + Math.random() * 4).toFixed(2) + 's');
      s.style.setProperty('--delay', (Math.random() * 6).toFixed(2) + 's');
      frag.appendChild(s);
    }
    starsBox.appendChild(frag);
  }

  /* ==================== 12. 章节定位圆点（主流风格：原生自由滚动 + 快速跳段） ==================== */
  (function initSectionDots() {
    const sections = $$('main > section');
    if (sections.length < 2) return;

    function sectionName(s) {
      const h = s.querySelector('.section__title');
      return h ? h.textContent.replace(/\s+/g, ' ').trim() : '第 ' + (sections.indexOf(s) + 1) + ' 段';
    }
    let currentIdx = 0;
    function currentSec() {
      const probe = window.scrollY + window.innerHeight * 0.42;
      let idx = 0;
      sections.forEach((s, i) => { if (s.offsetTop <= probe) idx = i; });
      return idx;
    }

    const navDots = document.createElement('nav');
    navDots.className = 'page-dots';
    navDots.setAttribute('aria-label', '章节导航');
    sections.forEach((s, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'page-dots__dot';
      b.title = sectionName(s);
      b.setAttribute('aria-label', '跳到：' + sectionName(s));
      b.addEventListener('click', () => {
        s.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      navDots.appendChild(b);
    });
    document.body.appendChild(navDots);
    const dots = Array.from(navDots.children);
    function syncDots() {
      dots.forEach((d, i) => d.classList.toggle('is-active', i === currentIdx));
    }
    currentIdx = currentSec();
    syncDots();

    /* 滚动时自然高亮当前章节（140ms 防抖，纯阅读模式） */
    let syncTimer = 0;
    window.addEventListener('scroll', () => {
      window.clearTimeout(syncTimer);
      syncTimer = window.setTimeout(() => {
        currentIdx = currentSec();
        syncDots();
      }, 140);
    }, { passive: true });
    window.addEventListener('resize', () => {
      currentIdx = currentSec();
      syncDots();
    });
    window.addEventListener('load', () => {
      window.setTimeout(() => {
        currentIdx = currentSec();
        syncDots();
      }, 350);
    });
  })();

  /* ==================== 17. 阅读进度条 + 回到顶部 ==================== */
  (function initReadingUI() {
    const bar = document.createElement('div');
    bar.className = 'scroll-progress';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);

    const top = document.createElement('button');
    top.type = 'button';
    top.className = 'to-top';
    top.setAttribute('aria-label', '回到顶部');
    top.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5m0 0l-6 6m6-6l6 6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    document.body.appendChild(top);

    let raf = 0;
    function update() {
      raf = 0;
      const h = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const p = Math.min(1, Math.max(0, window.scrollY / h));
      bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
      top.classList.toggle('is-visible', window.scrollY > 400);
    }
    window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
    window.addEventListener('resize', update);
    top.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    update();
  })();

  /* ==================== 19. 主题曲播放器（自绘 · 魔界之门） ==================== */
  (() => {
    const box = $('#themePlayer');
    if (!box) return;
    const audio = $('#tpAudio');
    const btn = $('#tpBtn');
    const seek = $('#tpSeek');
    const curEl = $('#tpCur');
    const durEl = $('#tpDur');
    if (!audio || !btn || !seek) return;

    const fmt = (sec) => {
      if (!isFinite(sec) || sec < 0) return '0:00';
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      return m + ':' + String(s).padStart(2, '0');
    };

    let seeking = false;

    function paintProgress() {
      const d = audio.duration || 0;
      const ratio = d ? Math.min(1, audio.currentTime / d) : 0;
      box.style.setProperty('--tp-progress', (ratio * 100).toFixed(3) + '%');
      if (!seeking) seek.value = String(Math.round(ratio * 1000));
      curEl.textContent = fmt(audio.currentTime);
    }

    function setPlaying(on) {
      box.classList.toggle('is-playing', !!on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }

    btn.addEventListener('click', () => {
      if (audio.paused) {
        // 站点内其它音频（如果有）先停下，避免叠音
        $$('audio').forEach((a) => { if (a !== audio) a.pause(); });
        audio.play().catch(() => {});
      } else {
        audio.pause();
      }
    });

    audio.addEventListener('loadedmetadata', () => { durEl.textContent = fmt(audio.duration); paintProgress(); });
    audio.addEventListener('durationchange', () => { durEl.textContent = fmt(audio.duration); });
    audio.addEventListener('timeupdate', paintProgress);
    audio.addEventListener('play', () => setPlaying(true));
    audio.addEventListener('pause', () => setPlaying(false));
    audio.addEventListener('ended', () => { setPlaying(false); audio.currentTime = 0; paintProgress(); });

    seek.addEventListener('input', () => {
      seeking = true;
      const d = audio.duration || 0;
      const t = (Number(seek.value) / 1000) * d;
      curEl.textContent = fmt(t);
      box.style.setProperty('--tp-progress', ((Number(seek.value) / 1000) * 100).toFixed(3) + '%');
    });
    const commit = () => {
      if (!seeking) return;
      seeking = false;
      const d = audio.duration || 0;
      audio.currentTime = (Number(seek.value) / 1000) * d;
      paintProgress();
    };
    seek.addEventListener('change', commit);
    seek.addEventListener('pointerup', commit);

    // 空格键：焦点在播放器上时切换播放
    box.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        btn.click();
      }
    });

    paintProgress();
  })();

  /* ==================== 22. 离开页面时停止所有媒体（手机端切页不再"后台还在放"） ==================== */
  (() => {
    const stopAll = (why) => {
      $$('audio, video').forEach((m) => {
        try {
          if (!m.paused) { m.pause(); }
          m.currentTime = 0;
        } catch (_) {}
      });
      const box = document.getElementById('themePlayer');
      if (box) box.classList.remove('is-playing');
    };

    // ① 正常导航离开 / 进入往返缓存
    window.addEventListener('pagehide', () => stopAll('pagehide'));
    window.addEventListener('beforeunload', () => stopAll('beforeunload'));

    // ② 切到后台或锁屏（手机最常见）
    document.addEventListener('visibilitychange', () => { if (document.hidden) stopAll('hidden'); });

    // ③ 点站内链接要跳走时，立刻停（有些 App 内置浏览器不销毁旧页面）
    document.addEventListener('click', (e) => {
      const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a) return;
      if (a.target === '_blank' || a.getAttribute('target') === '_blank' || a.hasAttribute('download')) return;
      const href = a.getAttribute('href') || '';
      if (!href || href.charAt(0) === '#' || /^(https?:)?\/\//i.test(href) || /^(mailto|tel):/i.test(href)) return;
      stopAll('navigate');
    }, true);
  })();

  /* ==================== 23. 魔界扭蛋机（页脚） ==================== */
  (() => {
    const root = document.getElementById('gacha');
    if (!root) return;
    const machine = document.getElementById('gachaMachine');
    const btn = document.getElementById('gachaBtn');
    const modal = document.getElementById('gachaModal');
    const box = document.getElementById('gachaBox');
    const img = document.getElementById('gachaImg');
    const labelEl = document.getElementById('gachaLabel');
    const fortuneEl = document.getElementById('gachaFortune');
    const closeBtn = document.getElementById('gachaClose');
    if (!machine || !modal) return;

    // 九个结果：文件 标签 运势 权重 配色档
    const RESULTS = [
      { src: 'g1', name: '喜欢', label: '恭喜，你被魔界之神的祝福砸中了，请享受这份从天而降的超级好运吧！', fortune: '大吉', rank: 'daikichi', weight: 1 },
      { src: 'g2', name: '支持', label: '水逆退散！坏事霉运通通跑开！好运滚滚来！神绮大人会支持你的哦～', fortune: '中吉', rank: 'kichi', weight: 1 },
      { src: 'g3', name: '跑路', label: '滴！快接收来自神绮大人的小幸运！请务必好好珍惜——', fortune: '小吉', rank: 'shokichi', weight: 1 },
      { src: 'g4', name: '疑问', label: '有时候，幸福就藏在每一天的平凡日常里。愿时光荏苒，你我如初。', fortune: '平', rank: 'he', weight: 1 },
      { src: 'g5', name: '反对', label: '小小的挑战也是生活中不可不品的一环呢，愿魔神保佑你！', fortune: '小凶', rank: 'kyo', weight: 1 },
      { src: 'g6', name: '伤心了', label: '冷知识，如果你不承认神绮大人很帅，有可能会被她凶哦！', fortune: '中凶', rank: 'kyo', weight: 1 },
      { src: 'g7', name: '生气气', label: '似乎有点难办，不过问题不大，暂且把烦恼抛到身后吧，稍作休息也没关系的。', fortune: '大凶', rank: 'kyo', weight: 1 },
      { src: 'g9', file: 'g9t.webp', name: '吃豆人', label: '你发现了神绮大人的吃豆绮隐藏形态，奖励一个来自神绮大人的❤️！', fortune: '太神绮了', rank: 'special', weight: 1 },
      { src: 'g8', name: '图片被神绮吃掉', label: '咦，神绮大人似乎把你当成了黑子？恐怕要被她视奸一整天了——', fortune: '太黑绮了', rank: 'special-bad', weight: 1 },
    ];
    const TOTAL = RESULTS.reduce((a, r) => a + r.weight, 0);
    const imgURL = (r) => 'assets/img/gacha/' + (r.file || (r.src + '.webp'));   // file 可覆盖（透明版等）

    let rolling = false;

    /* ---------- 每日一次（非管理员）---------- */
    const DAY_KEY = 'shinki-gacha-day';       // { date, src, label, fortune, rank }
    const dayKey = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const readDay = () => { try { return JSON.parse(localStorage.getItem(DAY_KEY) || 'null'); } catch (_) { return null; } };
    const writeDay = (r) => { try { localStorage.setItem(DAY_KEY, JSON.stringify({ date: dayKey(new Date()), src: r.src, label: r.label, fortune: r.fortune, rank: r.rank })); } catch (_) {} };
    const usedToday = () => { const d = readDay(); return !!d && d.date === dayKey(new Date()); };
    const gateOn = () => usedToday();
    const msToMidnight = () => {
      const n = new Date(), m = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 0, 2);
      return m - n;
    };

    function updateGate() {
      const used = gateOn();
      root.classList.toggle('is-used', used);
      const day = readDay();
      if (btn) {
        btn.disabled = used;
        btn.textContent = used ? '明天再来' : '扭一次';
      }
      const hint = root.querySelector('.gacha__hint');
      if (hint) {
        if (used && day) {
          const h = Math.max(0, Math.floor(msToMidnight() / 3600000));
          const m = Math.max(0, Math.floor((msToMidnight() % 3600000) / 60000));
          hint.textContent = '今天抽到的是 ' + day.label + ' · ' + day.fortune + '，' + h + ' 小时 ' + m + ' 分后重置（每日 0 点）。';
        } else hint.textContent = '投一枚魔界硬币，看看神绮今天是什么心情。（每天一次）';
      }
      // 到零点自动解锁
      clearTimeout(updateGate._t);
      if (used) updateGate._t = setTimeout(updateGate, Math.min(msToMidnight(), 2147483647));
    }

    /* 按吉凶生成向外迸射的星点：档位越高越多，彩蛋项最多 */
    const SPARKS = { he: 0, shokichi: 6, kichi: 11, daikichi: 20, kyo: 9, special: 34, 'special-bad': 30 };
    const FLAKES = { kyo: 14, 'special-bad': 22 };   // 凶档向下飘落的暗色碎屑
    // 手机端：粒子数量与飞散距离等比收小（省电 + 不糊成一团）
    const fxScale = () => {
      const w = (window.innerWidth || 1024);
      return w < 420 ? 0.6 : w < 700 ? 0.8 : 1;
    };
    function burst(rank) {
      const fx = box.querySelector('.gacha-fx');
      if (!fx) return;
      try {
        // 凶档/彩蛋凶：向下飘落的暗色碎屑
        const fall = fx.querySelector('.gacha-fx__fall');
        if (fall) {
          fall.innerHTML = '';
          const nf = Math.round((FLAKES[rank] || 0) * fxScale());
          for (let i = 0; i < nf; i++) {
            const f = document.createElement('span');
            f.className = 'gacha-fx__flake';
            f.style.setProperty('--fx', (Math.random() * 100).toFixed(1) + '%');
            f.style.setProperty('--w', (3 + Math.random() * 4).toFixed(1) + 'px');
            f.style.setProperty('--h', (6 + Math.random() * 10).toFixed(1) + 'px');
            f.style.setProperty('--dur', (1.8 + Math.random() * 1.6).toFixed(2) + 's');
            f.style.setProperty('--delay', (Math.random() * 1.4).toFixed(2) + 's');
            fall.appendChild(f);
          }
        }
        fx.querySelectorAll('.gacha-fx__spark').forEach((el) => el.remove());
        const k = fxScale();
        const n = Math.round((SPARKS[rank] || 0) * k);
        for (let i = 0; i < n; i++) {
          const s = document.createElement('span');
          s.className = 'gacha-fx__spark';
          const a = (Math.PI * 2 * i) / n + (Math.random() - .5) * .5;
          const d = (60 + Math.random() * (rank === 'special' ? 150 : 100)) * k;
          s.style.setProperty('--tx', (Math.cos(a) * d).toFixed(1) + 'px');
          s.style.setProperty('--ty', (Math.sin(a) * d).toFixed(1) + 'px');
          s.style.setProperty('--delay', (Math.random() * .28).toFixed(2) + 's');
          s.style.setProperty('--size', (3 + Math.random() * (rank === 'special' ? 7 : 4)).toFixed(1) + 'px');
          fx.appendChild(s);
        }
      } catch (_) {}
    }

    /* ---------------- 音效（Web Audio 现场合成，不依赖音频文件） ---------------- */
    let actx = null, muted = false;
    try { muted = localStorage.getItem('shinki-gacha-sound') === '0'; } catch (_) {}
    function ac() {
      if (muted) return null;
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      if (!actx) actx = new C();
      if (actx.state === 'suspended') actx.resume();
      return actx;
    }
    function tone(freq, dur, type, delay, gain, slideTo) {
      const c = ac(); if (!c) return;
      const t = c.currentTime + (delay || 0);
      const o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain || 0.16, t + 0.014);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + dur + 0.03);
    }
    function tick(delay, gain) {
      const c = ac(); if (!c) return;
      const t = c.currentTime + (delay || 0);
      const len = Math.floor(c.sampleRate * 0.035);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = c.createBufferSource(); src.buffer = buf;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 1.2;
      const g = c.createGain(); g.gain.value = gain || 0.1;
      src.connect(bp); bp.connect(g); g.connect(c.destination);
      src.start(t);
    }
    const SFX = {
      crank() { for (let i = 0; i < 6; i++) tick(i * 0.07, 0.09); },
      thud() { tone(150, 0.2, 'sine', 0, 0.22, 80); tick(0.02, 0.08); },
      crack() { tick(0, 0.16); tone(660, 0.08, 'square', 0, 0.08); },
      burst() { tone(880, 0.16, 'triangle', 0, 0.14, 1400); tick(0, 0.14); },
      result(rank) {
        const seq = {
          daikichi: [[523, 0], [659, .11], [784, .22], [1047, .33], [1319, .46]],
          kichi: [[523, 0], [659, .12], [784, .24]],
          shokichi: [[523, 0], [659, .13]],
          he: [[440, 0]],
          kyo: [[392, 0], [311, .16], [247, .32]],
          special: [[523, 0], [659, .1], [784, .2], [1047, .3], [1319, .42], [1568, .54]],
          'special-bad': [[262, 0], [233, .18], [175, .38], [147, .6]],
        }[rank] || [[440, 0]];
        const type = rank === 'kyo' || rank === 'special-bad' ? 'sawtooth' : 'sine';
        const gain = rank === 'he' ? 0.1 : 0.14;
        seq.forEach(([f, d]) => tone(f, 0.34, type, d, gain));
        if (rank === 'daikichi' || rank === 'special') { for (let i = 0; i < 8; i++) tick(0.5 + i * 0.05, 0.05); }
        if (rank === 'special-bad') { tone(90, 1.1, 'triangle', 0.2, 0.2, 60); }
      },
    };

    /* ---------------- 桌宠联动 ---------------- */
    const PET_LINES = {
      daikichi: ['大吉！今天运气不错嘛。', '唔，抽到好的了？那是自然。'],
      kichi: ['中吉……还行吧。'],
      shokichi: ['小吉。聊胜于无。'],
      he: ['平平淡淡才是真。'],
      kyo: ['唔……这个签，我不太喜欢。', '……别看了，收起来。'],
      special: ['太神绮了！！这就是神的力量！', '哈哈——看见没有，这就是魔界之神！'],
      'special-bad': ['太黑绮了……这签有问题，重抽不行吗？', '……我劝你当没看见。'],
    };
    const PET_COMFORT = ['别难过，明天还有一次。', '……运气而已，别放在心上。', '过来，让你摸一下头。'];
    function petSay(list) {
      const pet = window.ShinkiPet;
      if (!pet || !pet.say) return null;
      try { const t = list[Math.floor(Math.random() * list.length)]; pet.say(t); return pet; } catch (_) { return null; }
    }
    function petReact(rank) {
      const pet = window.ShinkiPet;
      if (!pet) return;
      try {
        if (rank === 'special') { pet.happy && pet.happy(); pet.jump && pet.jump(); petSay(PET_LINES.special); }
        else if (rank === 'daikichi') { pet.happy && pet.happy(); pet.jump && pet.jump(); petSay(PET_LINES.daikichi); }
        else if (rank === 'kichi' || rank === 'shokichi' || rank === 'he') { petSay(PET_LINES[rank]); }
        else if (rank === 'kyo' || rank === 'special-bad') {
          // 凶：桌宠探出来安慰（表演"摸头"）
          petSay(rank === 'special-bad' ? PET_LINES['special-bad'] : PET_COMFORT);
          pet.play && pet.play('head_pat');
        }
      } catch (_) {}
    }

    function pick() {
      let n = Math.random() * TOTAL;
      for (const r of RESULTS) { n -= r.weight; if (n < 0) return r; }
      return RESULTS[RESULTS.length - 1];
    }

    function show(r, note) {
      const noteEl = document.getElementById('gachaNote');
      if (noteEl) { noteEl.hidden = !note; if (note) noteEl.innerHTML = note; }
      img.src = imgURL(r);
      img.alt = r.name || r.label;
      labelEl.textContent = r.label;
      fortuneEl.textContent = r.fortune;
      box.setAttribute('data-rank', r.rank);
      modal.hidden = false;
      modal.classList.toggle('is-special', r.rank === 'special');
      try { document.body.classList.add('gacha-locked'); } catch (_) {}
      burst(r.rank);
      SFX.result(r.rank);
      petReact(r.rank);
      if (closeBtn && closeBtn.focus) closeBtn.focus();
    }

    function hide() {
      modal.hidden = true;
      try { document.body.classList.remove('gacha-locked'); } catch (_) {}
    }

    // 扭蛋四帧：闭合 → 裂开 → 打开 → 爆开
    const FRAMES = ['capsule-a.webp', 'capsule-b.webp', 'capsule-c.webp', 'capsule-d.webp'];
    const capImg = document.getElementById('gachaCapImg');

    function roll() {
      if (rolling) return;
      // 今天已经抽过 → 直接把今天的结果再给他看一遍
      if (gateOn()) {
        const d = readDay();
        if (d) show(d, '今天已经扭过啦，每天只能扭一次。<br>明天 0 点重置，到时候再来试运气吧。');
        return;
      }
      rolling = true;
      const r = pick();
      // ① 机台抖动，扭蛋从出货口掉出来
      root.classList.add('is-turning');
      SFX.crank();
      if (capImg) capImg.src = 'assets/img/gacha/' + FRAMES[0];
      setTimeout(() => {
        root.classList.remove('is-turning');
        root.classList.add('is-dropping');
        SFX.thud();
        if (capImg) capImg.src = 'assets/img/gacha/' + FRAMES[1];   // 裂开一条缝
      }, 620);
      setTimeout(() => { SFX.crack(); if (capImg) capImg.src = 'assets/img/gacha/' + FRAMES[2]; }, 900);   // 打开
      setTimeout(() => {                                                                      // 爆开
        root.classList.add('is-bursting');
        SFX.burst();
        if (capImg) capImg.src = 'assets/img/gacha/' + FRAMES[3];
      }, 1150);
      setTimeout(() => { show(r); writeDay(r); updateGate(); }, 1480);          // 出结果 + 记录当天
      setTimeout(() => {
        root.classList.remove('is-dropping', 'is-bursting');
        rolling = false;
      }, 1950);
    }

    machine.addEventListener('click', roll);
    machine.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); roll(); }
    });
    if (btn) btn.addEventListener('click', roll);
    if (closeBtn) closeBtn.addEventListener('click', hide);
    modal.addEventListener('click', (e) => { if (e.target === modal) hide(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) hide(); });

    const soundBtn = document.getElementById('gachaSound');
    if (soundBtn) {
      const paint = () => { soundBtn.textContent = muted ? '🔇' : '🔊'; soundBtn.setAttribute('aria-pressed', muted ? 'true' : 'false'); };
      paint();
      soundBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        muted = !muted;
        try { localStorage.setItem('shinki-gacha-sound', muted ? '0' : '1'); } catch (_) {}
        paint();
        if (!muted) { tick(0, 0.09); tone(880, 0.12, 'sine', 0.05, 0.12); }   // 开声时给个提示音
      });
    }

    updateGate();
    window.addEventListener('focus', updateGate);

  })();
})();
