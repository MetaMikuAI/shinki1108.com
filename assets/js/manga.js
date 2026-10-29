/* =========================================================
   四格与表情包 · 页面脚本
   结构照搬蕾蒂之家的阅读器：目录 → 四格阅读器 / 表情包网格
   · 懒加载（只加载你正在看的那几页）
   · 进度条、翻话、键盘 ← → / Esc
   · 记住每话读到哪一页
   ========================================================= */
(() => {
  'use strict';

  const INDEX_URL = 'manga/index.json';
  const AHEAD_PX = 1600;              // 提前加载范围
  const LAST_KEY = 'shinki-manga-last';

  const $ = (s, r = document) => r.querySelector(s);
  const listReader = $('#mgListReader');
  const listPacks = $('#mgListPacks');
  const listView = $('#mgListView');
  const readerView = $('#mgReaderView');
  const packView = $('#mgPackView');
  const pagesEl = $('#mgPages');
  const barTitle = $('#mgBarTitle');
  const countEl = $('#mgCount');
  const progressEl = $('#mgProgress');
  const pageImg = $('#mgPageImg');
  const pagePh = $('#mgPagePh');
  const prevBtn = $('#mgPrev');
  const nextBtn = $('#mgNext');
  const packBarTitle = $('#mgPackTitle');
  const packCount = $('#mgPackCount');
  const gridEl = $('#mgGrid');
  const light = $('#mgLight');
  const lightImg = $('#mgLightImg');
  const lightCount = $('#mgLightCount');

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let index = null;        // { collections: [...] }
  let collections = [];
  let current = null;      // 当前合集
  let pages = [];          // 当前页文件名
  let io = null;           // 懒加载观察器
  let packIdx = 0;         // 表情包大图当前序号
  let pageIdx = 0;         // 四格当前页（0 基）
  let packPages = [];

  const readLast = () => { try { return JSON.parse(localStorage.getItem(LAST_KEY)) || {}; } catch (_) { return {}; } };
  const writeLast = (id, page) => {
    try { const m = readLast(); m[id] = page; localStorage.setItem(LAST_KEY, JSON.stringify(m)); } catch (_) {}
  };

  /* ---------------- 载入索引 ---------------- */
  async function boot() {
    try {
      const r = await fetch(INDEX_URL, { cache: 'no-cache' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      index = await r.json();
      collections = index.collections || [];
      renderCards();
    } catch (e) {
      const msg = '<p class="mg-empty">合集暂时无法加载，请刷新重试。</p>';
      listReader.innerHTML = msg;
      listPacks.innerHTML = '';
    }
  }

  /* ---------------- 目录卡片 ---------------- */
  function cardHTML(c) {
    const tall = (c.coverFit === 'top') ? ' mg-card__cover--tall' : '';   // 四格封面是横幅裁的 4:3 → 直接填满；其余用 contain 靠上
    return '<article class="mg-card" data-id="' + esc(c.id) + '" tabindex="0" role="button" aria-label="打开 ' + esc(c.title) + '">' +
      '<div class="mg-card__cover' + tall + '">' +
        '<img data-src="manga/' + esc(c.id) + '/thumbs/' + esc(c.cover || '001.webp') + '" alt="' + esc(c.title) + ' 封面">' +
        '<span class="mg-card__badge">' + (c.count || '?') + ' 张</span>' +
      '</div>' +
      '<div class="mg-card__meta">' +
        '<h3 class="mg-card__title">' + esc(c.title) + '</h3>' +
        '<p class="mg-card__desc">' + esc(c.desc || '') + '</p>' +
      '</div>' +
    '</article>';
  }

  function renderCards() {
    const readers = collections.filter((c) => c.type === 'reader');
    const packs = collections.filter((c) => c.type !== 'reader');
    listReader.innerHTML = readers.length ? readers.map(cardHTML).join('') : '<p class="mg-empty">暂无四格</p>';
    listPacks.innerHTML = packs.length ? packs.map(cardHTML).join('') : '<p class="mg-empty">暂无表情包</p>';
    if (!packs.length) listPacks.closest('.mg-section').hidden = true;

    // 封面懒加载
    const imgs = document.querySelectorAll('.mg-card__cover img[data-src]');
    const lazy = new IntersectionObserver((ents) => {
      ents.forEach((en) => {
        if (!en.isIntersecting) return;
        const img = en.target;
        // 注意：必须先挂 onload 再设 src —— 命中缓存时 onload 可能早于挂载而永不触发
        img.onload = () => img.classList.add('in');
        img.onerror = () => { img.style.display = 'none'; };
        img.src = img.dataset.src;
        if (img.complete && img.naturalWidth) img.classList.add('in');   // 已在缓存里
        lazy.unobserve(img);
      });
    }, { rootMargin: '300px' });
    imgs.forEach((i) => lazy.observe(i));

    document.querySelectorAll('.mg-card').forEach((card) => {
      const open = () => openCollection(card.dataset.id);
      card.addEventListener('click', open);
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
  }

  /* ---------------- 打开一个合集 ---------------- */
  async function openCollection(id) {
    const c = collections.find((x) => x.id === id);
    if (!c) return;
    current = c;
    let data = null;
    try {
      const r = await fetch('manga/' + id + '/pages.json', { cache: 'no-cache' });
      if (r.ok) data = await r.json();
    } catch (_) {}
    pages = (data && data.pages) || [];
    if (!pages.length) { alert('这个合集还没有图片。'); return; }

    if (c.type === 'reader') openReader(); else openPack();
  }

  /* ---------------- 视图切换 ---------------- */
  function showView(which) {
    listView.hidden = which !== 'list';
    readerView.hidden = which !== 'reader';
    packView.hidden = which !== 'pack';
    document.body.classList.toggle('is-reading', which !== 'list');   // 阅读/看表情包时隐藏站点顶栏
    if (which !== 'list') window.scrollTo({ top: 0, behavior: 'auto' });
  }

  /* ---------------- 四格阅读器（向左翻页制） ---------------- */
  function pageSrc(i) { return 'manga/' + current.id + '/pages/' + pages[i]; }

  function paintPage(dir) {
    if (!pageImg) return;
    pagePh.hidden = false;
    pagePh.textContent = (pageIdx + 1) + ' / ' + pages.length;
    const requestedPage = pageIdx;
    const requestedCollection = current.id;
    const next = new Image();
    next.onload = () => {
      if (pageIdx !== requestedPage || current.id !== requestedCollection) return;
      pageImg.src = next.src;
      pageImg.alt = current.title + ' 第 ' + (pageIdx + 1) + ' 页';
      pageImg.classList.remove('slide-l', 'slide-r');
      if (dir) { void pageImg.offsetWidth; pageImg.classList.add(dir > 0 ? 'slide-l' : 'slide-r'); }
      pagePh.hidden = true;
      window.scrollTo({ top: 0, behavior: 'auto' });   // 新的一话从头看（整页滚动）
    };
    next.onerror = () => { if (pageIdx !== requestedPage || current.id !== requestedCollection) return; pagePh.hidden = false; pagePh.textContent = '第 ' + (pageIdx + 1) + ' 页加载失败'; };
    next.src = pageSrc(pageIdx);

    countEl.textContent = (pageIdx + 1) + ' / ' + pages.length;
    progressEl.style.width = (100 * (pageIdx + 1) / pages.length).toFixed(1) + '%';
    writeLast(current.id, pageIdx + 1);
    // 预取前后页，翻起来才跟手
    [pageIdx + 1, pageIdx - 1].forEach((k) => { if (k >= 0 && k < pages.length) { const im = new Image(); im.src = pageSrc(k); } });
  }

  function pageStep(d) {
    const n = pageIdx + d;
    if (n < 0 || n >= pages.length) {
      // 到头了：给个轻微反馈，不静默
      if (pageImg) { pageImg.classList.remove('bump'); void pageImg.offsetWidth; pageImg.classList.add('bump'); }
      return;
    }
    pageIdx = n;
    paintPage(d);
  }

  function openReader() {
    showView('reader');
    barTitle.textContent = current.title;
    pageIdx = Math.min(Math.max((readLast()[current.id] || 1) - 1, 0), pages.length - 1);
    paintPage(0);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  // 进度条 = （当前第几话 + 该话滚到哪）÷ 总话数
  const paintProgress = () => {
    const d = document.documentElement;
    const span = d.scrollHeight - window.innerHeight;
    const frac = span > 40 ? Math.min(1, Math.max(0, d.scrollTop / span)) : 0;
    progressEl.style.width = (100 * (pageIdx + frac) / pages.length).toFixed(1) + '%';
  };
  window.addEventListener('scroll', () => { if (!readerView.hidden) paintProgress(); }, { passive: true });
  window.addEventListener('resize', () => { if (!readerView.hidden) paintProgress(); });

  const jumpTo = () => {
    const v = window.prompt('跳到第几话？（1 - ' + pages.length + '）', String(pageIdx + 1));
    if (v == null) return;
    const n = parseInt(v, 10);
    if (!isFinite(n) || n < 1 || n > pages.length) return;
    const dir = n - 1 > pageIdx ? 1 : -1;
    pageIdx = n - 1;
    paintPage(dir);
  };

  // 手机：左右滑动翻页
  (() => {
    let sx = 0, sy = 0, tracking = false;
    const stage = pagesEl;
    if (!stage) return;
    stage.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; tracking = true;
    }, { passive: true });
    stage.addEventListener('touchend', (e) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) > 46 && Math.abs(dx) > Math.abs(dy) * 1.2) pageStep(dx < 0 ? 1 : -1);
    }, { passive: true });
  })();

  /* ---------------- 表情包网格 ---------------- */
  function openPack() {
    showView('pack');
    packPages = pages;
    packBarTitle.textContent = current.title;
    packCount.textContent = pages.length + ' 张';
    gridEl.innerHTML = pages.map((f, i) =>
      '<button type="button" class="mg-sticker" data-i="' + i + '" aria-label="查看第 ' + (i + 1) + ' 张">' +
        '<img alt="" data-src="manga/' + esc(current.id) + '/pages/' + esc(f) + '">' +
      '</button>').join('');

    const lazy = new IntersectionObserver((ents) => {
      ents.forEach((en) => {
        if (!en.isIntersecting) return;
        const img = en.target;
        img.onload = () => img.classList.add('in');
        img.onerror = () => img.classList.add('in');
        img.src = img.dataset.src;
        if (img.complete && img.naturalWidth) img.classList.add('in');
        lazy.unobserve(img);
      });
    }, { rootMargin: '400px' });
    gridEl.querySelectorAll('img[data-src]').forEach((i) => lazy.observe(i));
    gridEl.querySelectorAll('.mg-sticker').forEach((b) => {
      b.addEventListener('click', () => openLight(+b.dataset.i));
    });
  }

  function openLight(i) {
    packIdx = (i + packPages.length) % packPages.length;
    lightImg.src = 'manga/' + current.id + '/pages/' + packPages[packIdx];
    lightCount.textContent = (packIdx + 1) + ' / ' + packPages.length;
    light.hidden = false;
    document.body.classList.add('mg-locked');
  }
  function closeLight() {
    light.hidden = true;
    document.body.classList.remove('mg-locked');
  }
  const stepLight = (d) => { if (!light.hidden) openLight(packIdx + d); };

  /* ---------------- 上一话 / 下一话 ---------------- */
  function step(d) {
    const readers = collections.filter((c) => c.type === 'reader');
    if (!readers.length || !current) return;
    let i = readers.findIndex((c) => c.id === current.id);
    i = (i + d + readers.length) % readers.length;
    openCollection(readers[i].id);
  }

  /* ---------------- 事件 ---------------- */
  const goList = () => { if (light && !light.hidden) closeLight(); showView('list'); window.scrollTo({ top: 0, behavior: 'auto' }); };
  $('#mgBack').addEventListener('click', goList);
  $('#mgPackBack').addEventListener('click', goList);
  if (prevBtn) prevBtn.addEventListener('click', () => pageStep(-1));   // 上一话 = 上一页（只有一个四格合集）
  if (nextBtn) nextBtn.addEventListener('click', () => pageStep(1));
  const prevPageBtn = $('#mgPrevPage'), nextPageBtn = $('#mgNextPage');
  if (prevPageBtn) prevPageBtn.addEventListener('click', () => pageStep(-1));
  if (nextPageBtn) nextPageBtn.addEventListener('click', () => pageStep(1));
  const jumpBtn = $('#mgJump');
  if (jumpBtn) jumpBtn.addEventListener('click', jumpTo);

  $('#mgLightClose').addEventListener('click', closeLight);
  $('#mgLightPrev').addEventListener('click', () => stepLight(-1));
  $('#mgLightNext').addEventListener('click', () => stepLight(1));
  light.addEventListener('click', (e) => { if (e.target === light) closeLight(); });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!light.hidden) { closeLight(); return; }
      if (!readerView.hidden || !packView.hidden) showView('list');
      return;
    }
    if (!light.hidden) {
      if (e.key === 'ArrowLeft') stepLight(-1);
      if (e.key === 'ArrowRight') stepLight(1);
      return;
    }
    if (!readerView.hidden) {
      if (e.key === 'ArrowLeft') pageStep(-1);
      if (e.key === 'ArrowRight') pageStep(1);
      if (e.key === 'PageDown' || e.key === ' ') pageStep(1);
      if (e.key === 'PageUp') pageStep(-1);
    }
  });

  // 兜底：任何时刻已经真正加载完成的图，都不该因为没触发 onload 而看不见
  function sweepLoaded() {
    document.querySelectorAll('img[data-src]').forEach((img) => {
      if (img.src && img.complete && img.naturalWidth && !img.classList.contains('in')) img.classList.add('in');
    });
  }
  setInterval(sweepLoaded, 900);
  window.addEventListener('pageshow', sweepLoaded);

  boot();
})();
