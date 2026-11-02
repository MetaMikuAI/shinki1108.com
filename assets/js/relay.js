/* =========================================================
   接力作品 · 分类、成员名单与棒次编号（取自原包，数据改读 assets/data/works.json）
   ========================================================= */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const grid = $('#relayGrid');
  const emptyEl = $('#relayEmpty');
  const catsBox = $('#relayCats');
  const membersBox = $('#membersList');      // 成员名单：页内视图容器
  const worksView = $('#relayWorksView');
  const membersView = $('#relayMembersView');
  const membersBtn = $('#relayMembersBtn');
  const contentTitle = $('#relayContentTitle');
  const countEl = $('#relayCount');

  let items = [];
  let cat = 'all';
  let membersMode = false;   // true = 内容区显示「成员名单」子视图

  /* ---------- 作品数据 ---------- */
  async function fetchWorks() {
    try {
      const res = await fetch('assets/data/works.json');
      if (!res.ok) return [];
      const j = await res.json();
      return Array.isArray(j) ? j.filter((w) => w && w.channel === 'relay') : [];
    } catch (_) { return []; }
  }

  function numberByYear(ordered) {
    const used = Object.create(null);     // 年份 → 已占用棒次
    const map = new Map();
    const norm = (v) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
    };
    // 第一轮：管理员手动指定的棒次优先占用
    for (const it of ordered) {
      const y = itemYear(it);
      used[y] = used[y] || new Set();
      const n = norm(it.no);
      if (n && !used[y].has(n)) { used[y].add(n); map.set(it, n); }
    }
    // 第二轮：其余作品按顺序填补空缺号
    for (const it of ordered) {
      if (map.has(it)) continue;
      const y = itemYear(it);
      used[y] = used[y] || new Set();
      let n = 1;
      while (used[y].has(n)) n += 1;
      used[y].add(n);
      map.set(it, n);
    }
    return map;
  }
  function itemYear(it) {
    const y = Number(it.year) || (it.ts ? new Date(it.ts).getFullYear() : new Date().getFullYear());
    return y;
  }

  /* ---------- 分类 & 成员 ---------- */
  const FIXED_YEARS = [2026, 2025];
  const YEAR_LABELS = { 2026: '2026 魔界新篇', 2025: '2025 怪绮传承' };
  /**
   * 展示顺序：年份优先（2026 → 2025，与侧边栏分类一致），同一年内按棒次升序。
   * 棒次来自 numberByYear（手动指定的号优先、其余按时间填补空缺），
   * 所以排序后看到的就是「第 1 棒 → 第 2 棒 → …」连续排列。
   */
  function displayOrder() {
    const base = orderedItems();                 // 时间序：用于分配棒次
    const noMap = numberByYear(base);
    const rank = (it) => {
      const i = FIXED_YEARS.indexOf(Number(itemYear(it)));
      return i < 0 ? FIXED_YEARS.length : i;     // 未列出的年份排在最后
    };
    return base.slice().sort((a, b) => {
      const ra = rank(a), rb = rank(b);
      if (ra !== rb) return ra - rb;
      return (noMap.get(a) || 0) - (noMap.get(b) || 0);
    });
  }

  function orderedItems() {
    return items.slice().sort((a, b) => (a.ts || 0) - (b.ts || 0));
  }
  function buildCats() {
    if (!catsBox) return;
    catsBox.innerHTML = '';
    const mk = (label, value) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'relay-cat';
      b.textContent = label;
      b.dataset.cat = value;
      b.addEventListener('click', () => {
        cat = value;
        $$('.relay-cat', catsBox).forEach((n) => n.classList.toggle('is-active', n === b));
        if (membersMode) showMembers(false); // 点年份 = 切回作品视图（不跳转、不滚动）
        else render();
      });
      return b;
    };
    catsBox.appendChild(mk('全部作品', 'all'));
    for (const y of FIXED_YEARS) catsBox.appendChild(mk(YEAR_LABELS[y] || (y + ' 年'), String(y)));
    const first = catsBox.querySelector('.relay-cat');
    if (first) first.classList.add('is-active');
  }
  /* ---------- 文章正文：本地降级直接存字符串，服务器模式按需拉取 .txt ---------- */
  const textCache = new Map();
  function localText(it) {
    return typeof it.data === 'string' && it.data.indexOf('data:') !== 0 ? it.data : '';
  }
  function textCount(it) {
    const t = textCache.get(it.id) || localText(it);
    return t ? t.replace(/\s/g, '').length : 0;
  }
  async function loadText(it) {
    if (textCache.has(it.id)) return textCache.get(it.id);
    const local = localText(it);
    if (local) { textCache.set(it.id, local); return local; }
    if (it.file) {
      try {
        const res = await fetch(it.file, { cache: 'force-cache' });
        if (res.ok) {
          const t = await res.text();
          textCache.set(it.id, t);
          return t;
        }
      } catch (_) {}
    }
    return '';
  }


  /* ---------- 成员名单（页内子视图：第几棒 / 作者 / 说明 / 链接） ---------- */
  function buildMemberCard(it, no) {
    const card = document.createElement('article');
    card.className = 'relay-member';

    const head = document.createElement('p');
    head.className = 'relay-member__head';
    const noEl = document.createElement('b');
    noEl.className = 'relay-member__no';
    noEl.textContent = '第 ' + no + ' 棒';
    const authorEl = document.createElement('span');
    authorEl.className = 'relay-member__author';
    authorEl.textContent = it.author || '佚名';
    head.append(noEl, authorEl);

    const descEl = document.createElement('p');
    descEl.className = 'relay-member__desc';
    descEl.textContent = it.desc || '无描述';

    card.append(head, descEl);

    if (it.url) {
      const a = document.createElement('a');
      a.className = 'relay-member__link';
      a.href = it.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = '查看链接 ↗';
      card.appendChild(a);
    }
    return card;
  }

  function buildMembers() {
    if (!membersBox) return;
    membersBox.textContent = '';
    const ordered = displayOrder();               // 成员名单也按棒次顺序
    for (const y of FIXED_YEARS) {
      // 与作品卡片同一套编号（按时间序分配，保证两处一致）
      const noMap = numberByYear(orderedItems());
      const ofYear = [];
      ordered.forEach((it) => { if (itemYear(it) === y) ofYear.push({ it, no: noMap.get(it) }); });

      const block = document.createElement('section');
      block.className = 'members-year';

      const h = document.createElement('h3');
      h.className = 'members-year__title';
      h.textContent = (YEAR_LABELS[y] || (y + ' 年')) + '　·　' + ofYear.length + ' 棒';
      block.appendChild(h);

      if (!ofYear.length) {
        const none = document.createElement('p');
        none.className = 'members-note';
        none.textContent = '这一年还没有接力作品，第一棒等你来～';
        block.appendChild(none);
      } else {
        const box = document.createElement('div');
        box.className = 'members-grid';
        for (const { it, no } of ofYear) box.appendChild(buildMemberCard(it, no));
        block.appendChild(box);
      }
      membersBox.appendChild(block);
    }
  }

  /* 内容区视图切换：作品 ←→ 成员名单 */
  /* 地址栏用 replaceState 同步，绝不用 location.hash：
     给 location.hash 赋空值会让浏览器跳到文档顶部（切回作品时页面乱滚的元凶）。 */
  function syncUrl(members) {
    try {
      const base = location.pathname + location.search;
      history.replaceState(null, '', members ? base + '#members' : base);
    } catch (_) { /* 老浏览器/沙箱下忽略即可，视图本身已切换 */ }
  }

  function showMembers(on) {
    membersMode = !!on;
    if (worksView) worksView.hidden = membersMode;
    if (membersView) membersView.hidden = !membersMode;
    if (membersBtn) {
      membersBtn.classList.toggle('is-active', membersMode);
      membersBtn.setAttribute('aria-pressed', String(membersMode));
    }
    if (membersMode) {
      $$('.relay-cat', catsBox).forEach((n) => n.classList.remove('is-active'));
      if (contentTitle) contentTitle.textContent = '成员名单';
      buildMembers();
    } else {
      const active = $$('.relay-cat', catsBox).filter((n) => n.dataset.cat === cat)[0];
      if (active) active.classList.add('is-active');
      render();
    }
    syncUrl(membersMode);
  }

  function applyHash() {
    if (location.hash === '#members') showMembers(true);
  }


  /* ---------- 渲染 ---------- */
  function itemMediaURL(item) {
    return item.file || item.data || '';
  }

  function buildItem(item, no, yearLabel) {
    const fig = document.createElement('figure');
    fig.className = 'glass glass--frost relay-item';
    fig.setAttribute('data-id', item.id);
    fig.classList.add('is-clickable');
    fig.tabIndex = 0;
    fig.setAttribute('role', 'button');
    fig.setAttribute('aria-label', '查看《' + (item.title || '无题') + '》全屏');
    fig.addEventListener('click', (e) => {
      if (e.target.closest('a, video, .relay-item__tools')) return;   // 链接/视频控件/管理按钮不触发
      openLightbox(item);
    });
    fig.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLightbox(item); }
    });

    const title = item.title || '无题';
    const author = item.author || '佚名';

    let media;
    const isText = item.kind === 'text';
    if (item.kind === 'video') {
      media = document.createElement('video');
      media.controls = true;
      media.preload = 'metadata';
      media.playsInline = true;
      media.src = itemMediaURL(item);
      fig.classList.add('relay-item--video');
    } else if (isText) {
      fig.classList.add('relay-item--text');
      media = document.createElement('div');
      media.className = 'relay-item__media relay-textcard';
      const tHead = document.createElement('p');
      tHead.className = 'relay-textcard__title';
      tHead.textContent = title;
      const tBody = document.createElement('p');
      tBody.className = 'relay-textcard__body';
      const cached = textCache.get(item.id) || localText(item);
      tBody.textContent = cached ? cached.slice(0, 150) : (item.desc || '点击阅读全文…');
      const tFoot = document.createElement('span');
      tFoot.className = 'relay-textcard__foot';
      tFoot.textContent = '点击阅读全文 ↗';
      media.append(tHead, tBody, tFoot);
      // 文章：进入时把正文预读进来，便于显示字数与片段
      loadText(item).then((t) => {
        if (!t) return;
        tBody.textContent = t.slice(0, 150) + (t.length > 150 ? '…' : '');
        const len = t.replace(/\s/g, '').length;
        noLine.textContent = (yearLabel ? yearLabel + ' · ' : '') + '第 ' + no + ' 棒　文章 · ' + len + ' 字';
      }).catch(() => {});
    } else {
      media = document.createElement('img');
      media.src = itemMediaURL(item);
      media.alt = '接力画作《' + title + '》 作者：' + author;
      media.loading = 'lazy';
      media.decoding = 'async';
    }
    if (!isText) media.className = 'relay-item__media';

    const body = document.createElement('div');
    body.className = 'relay-item__body';

    const noLine = document.createElement('p');
    noLine.className = 'relay-item__no';
    const kindLabel = item.kind === 'video' ? '视频' : (item.kind === 'text' ? '文章' : '画作');
    const textLen = item.kind === 'text' ? textCount(item) : 0;
    noLine.textContent = (yearLabel ? yearLabel + ' · ' : '') + '第 ' + no + ' 棒　' + kindLabel +
      (textLen ? ' · ' + textLen + ' 字' : '');

    const nameLine = document.createElement('p');
    nameLine.className = 'relay-item__name';
    const nameB = document.createElement('b');
    nameB.textContent = author;
    nameLine.append(nameB, '\u00A0\u00A0' + title);

    const cap = document.createElement('figcaption');
    cap.className = 'relay-item__cap';
    if (item.desc) {
      const desc = document.createElement('p');
      desc.className = 'relay-item__desc';
      desc.textContent = item.desc;
      cap.appendChild(desc);
    } else {
      const nothing = document.createElement('p');
      nothing.className = 'relay-item__desc relay-item__desc--muted';
      nothing.textContent = '无描述';
      cap.appendChild(nothing);
    }
    if (item.url) {
      const a = document.createElement('a');
      a.className = 'relay-item__link';
      a.href = item.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = '查看链接 ↗';
      cap.appendChild(a);
    }

    body.append(noLine, nameLine, cap);
    fig.append(media, body);

    return fig;
  }

  function updateCount() {
    if (!countEl) return;
    countEl.textContent = items.length ? '全站共 ' + items.length + ' 份接力作品' : '';
  }

  /* ---------- 加载骨架占位 ---------- */
  let worksLoaded = false;
  function renderSkeleton() {
    if (!grid) return;
    Array.from(grid.children).forEach((n) => { if (n !== emptyEl) n.remove(); });   // 保留「还没有作品」的空状态节点
    for (let i = 0; i < 6; i++) {
      const s = document.createElement('div');
      s.className = 'skel';
      s.setAttribute('aria-hidden', 'true');
      grid.appendChild(s);
    }
    if (emptyEl) emptyEl.hidden = true;
    if (countEl) countEl.textContent = '加载中…';
  }

  function render() {
    if (!grid || membersMode) return; // 成员名单视图下不重绘作品区
    $$('.skel', grid).forEach((n) => n.remove());
    if (!worksLoaded && !items.length) { renderSkeleton(); return; }
    // 同时清掉上一轮的空年份提示，否则每次切年份都会再叠一条、永不消失
    $$('.relay-item, .relay-filter-empty', grid).forEach((n) => n.remove());
    const ordered = displayOrder();               // 按 年份 + 棒次 排序后的展示顺序
    if (emptyEl) emptyEl.hidden = ordered.length > 0;
    const filtered = cat === 'all'
      ? ordered
      : ordered.filter((it) => itemYear(it) === Number(cat));
    if (contentTitle) contentTitle.textContent = cat === 'all' ? '全部作品' : cat + ' 年';
    const frag = document.createDocumentFragment();
    const noMap = numberByYear(orderedItems());          // 编号始终按时间序分配，与展示排序无关
    ordered.forEach((item) => {
      if (!filtered.includes(item)) return;
      // 「全部作品」时带上年份，避免 2025/2026 出现相同棒次号造成误解
      const label = cat === 'all' ? String(itemYear(item)) : null;
      frag.appendChild(buildItem(item, noMap.get(item), label));
    });
    if (!filtered.length && ordered.length) {
      const note = document.createElement('p');
      note.className = 'relay-filter-empty';
      note.textContent = '该年份还没有作品，换一个分类看看吧～';
      frag.appendChild(note);
    }
    const anchor = emptyEl ? emptyEl.nextSibling : null;
    grid.insertBefore(frag, anchor);
    updateCount();
  }

  function renderAll() {
    buildCats();
    if (membersMode) buildMembers();
    else render();
  }

  function setItems(list) {
    items = (list || []).sort((a, b) => (a.ts || 0) - (b.ts || 0));
    renderAll();
  }

  async function reload() {
    setItems(await fetchWorks());
    worksLoaded = true;
    render();
    applyHash(); // 带 #members 进来时直接落到成员名单视图
  }


/* =========================================================
     全屏查看（与画廊大图同款）：图片 / 视频 / 文章 都能点开看
     关闭方式：✕ 按钮 / Esc / 点击空白；← → 切换上一篇/下一篇
     ========================================================= */
  let lb = null, lbIndex = 0;

  function lbList() {
    const ordered = displayOrder();               // ← → 按棒次顺序切换
    return cat === 'all' ? ordered : ordered.filter((it) => itemYear(it) === Number(cat));
  }
  function ensureLightbox() {
    if (lb) return lb;
    lb = document.createElement('div');
    lb.className = 'rlb';
    lb.setAttribute('role', 'dialog');
    lb.setAttribute('aria-modal', 'true');
    lb.setAttribute('aria-label', '接力作品全屏查看');
    lb.innerHTML =
      '<button type="button" class="rlb-close" aria-label="关闭">×</button>' +
      '<button type="button" class="rlb-nav rlb-nav--prev" aria-label="上一篇">‹</button>' +
      '<button type="button" class="rlb-nav rlb-nav--next" aria-label="下一篇">›</button>' +
      '<div class="rlb-body"><div class="rlb-stage"></div><div class="rlb-cap"></div></div>';
    document.body.appendChild(lb);
    lb.addEventListener('click', (e) => {
      if (e.target === lb || e.target.closest('.rlb-close')) closeLightbox();
      else if (e.target.closest('.rlb-nav--prev')) stepLightbox(-1);
      else if (e.target.closest('.rlb-nav--next')) stepLightbox(1);
    });
    document.addEventListener('keydown', (e) => {
      if (!lb || !lb.classList.contains('open')) return;
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowLeft') stepLightbox(-1);
      else if (e.key === 'ArrowRight') stepLightbox(1);
    });
    return lb;
  }

  async function renderLightbox() {
    if (!lb) return;
    const list = lbList();
    if (!list.length) return;
    lbIndex = Math.max(0, Math.min(lbIndex, list.length - 1));
    const it = list[lbIndex];
    const noMap = numberByYear(orderedItems());
    const stage = lb.querySelector('.rlb-stage');
    const cap = lb.querySelector('.rlb-cap');
    stage.textContent = '';
    stage.classList.toggle('is-text', it.kind === 'text');

    if (it.kind === 'text') {
      const article = document.createElement('article');
      article.className = 'rlb-article';
      article.textContent = '加载中…';
      stage.appendChild(article);
      const t = await loadText(it);
      article.textContent = t || '（正文缺失）';
    } else if (it.kind === 'video') {
      const v = document.createElement('video');
      v.src = itemMediaURL(it);
      v.controls = true;
      v.autoplay = true;
      v.playsInline = true;
      v.className = 'rlb-media';
      stage.appendChild(v);
    } else {
      const img = document.createElement('img');
      img.src = itemMediaURL(it);
      img.alt = '接力画作《' + (it.title || '无题') + '》';
      img.className = 'rlb-media';
      stage.appendChild(img);
    }

    const kindLabel = it.kind === 'video' ? '视频' : (it.kind === 'text' ? '文章' : '画作');
    const no = noMap.get(it) || lbIndex + 1;
    cap.textContent = itemYear(it) + ' · 第 ' + no + ' 棒　' + kindLabel +
      '　' + (it.title || '无题') + '　—　' + (it.author || '佚名');
    if (it.url) {
      const a = document.createElement('a');
      a.className = 'rlb-link';
      a.href = it.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = '作品链接 ↗';
      cap.appendChild(a);
    }
  }

  function openLightbox(item) {
    const list = lbList();
    const idx = list.findIndex((x) => x.id === item.id);
    lbIndex = idx < 0 ? 0 : idx;
    ensureLightbox();
    lb.classList.add('open');
    document.body.classList.add('rlb-open');
    renderLightbox();
    const c = lb.querySelector('.rlb-close');
    if (c) c.focus();
  }
  function closeLightbox() {
    if (!lb) return;
    lb.classList.remove('open');
    document.body.classList.remove('rlb-open');
    const v = lb.querySelector('video');
    if (v) { try { v.pause(); } catch (_) {} }
    setTimeout(() => { const s = lb.querySelector('.rlb-stage'); if (s && !lb.classList.contains('open')) s.textContent = ''; }, 200);
  }
  function stepLightbox(d) {
    const list = lbList();
    if (!list.length) return;
    lbIndex = (lbIndex + d + list.length) % list.length;
    renderLightbox();
  }


  /* ---------- 成员名单视图开关（页内切换 + #members 锚点） ---------- */
  if (membersBtn) {
    membersBtn.addEventListener('click', () => showMembers(!membersMode));
  }
  window.addEventListener('hashchange', applyHash);

  /* 顶部导航的「接力作品」指向本页：拦下直接切回作品视图，
     避免浏览器因片段变化把页面滚到顶部（成员名单的入口只在侧边栏）。 */
  $$('.nav-link').forEach((a) => {
    if ((a.getAttribute('href') || '') !== 'relay.html') return;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      showMembers(false);
    });
  });

  /* ---------- 初始化 ---------- */
  renderSkeleton(); // 未加载前显示骨架占位
  reload();
})();

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
       大写 SHINKI 六个字母的 ASCII 码相加得到 454，把 454 当十六进制读，即十进制 1108 → 11 月 08 日；
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
