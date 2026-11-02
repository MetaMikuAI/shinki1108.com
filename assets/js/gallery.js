/* =========================================================
   同人画廊 · 「小小画廊」式实现（取自原包，数据改读 assets/data/works.json）
   无缝滚动：JS rAF 逐像素移动 + 双份相同轨道 + W 处回绕 + 悬停暂停
   点击放大：共享 fixed 遮罩（96vw/84vh/contain）+ 说明栏
   悬停放大：纯 CSS scale(1.05) + 阴影上浮
   ========================================================= */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const wrap = $('#galleryWrap');
  const track = $('#galleryTrack');
  const countEl = $('#uploadCount');
  const emptyHint = $('#galleryEmptyHint');

  let works = [];
  const serverMode = true;   // 作品数据来自站点上的 works.json（全站可见）

  /* ================= 一、无缝滚动（跑马灯） ================= */
  let x = 0, W = 0, speed = 1.2, paused = false, rafId = 0;

  function computeW() {
    if (!track) return;
    W = track.scrollWidth / 2; // 一份内容的精确宽度（图片真实加载后量）
  }
  function step() {
    if (!paused) {
      x -= speed;
      if (W > 0 && x <= -W) {   // 第一份完整滚出 → 回绕一份宽，画面零跳变
        x += W;
        computeW();             // 重测（防布局变化）
      }
      track.style.transform = 'translateX(' + x + 'px)';
    }
    rafId = requestAnimationFrame(step);
  }
  function startLoop() {
    if (rafId) return;
    rafId = requestAnimationFrame(step);
  }
  function stopLoop() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  }
  // 等全部图片加载完再量宽启动（宽度不准会跳）
  function waitImagesThenStart(root) {
    const imgs = $$('img', root || track);
    if (!imgs.length) { computeW(); startLoop(); return; }
    let done = 0;
    const onOne = () => {
      done += 1;
      if (done >= imgs.length) { computeW(); startLoop(); }
    };
    imgs.forEach((im) => {
      if (im.complete && im.naturalWidth > 0) onOne();
      else {
        im.addEventListener('load', onOne, { once: true });
        im.addEventListener('error', onOne, { once: true });
      }
    });
  }

  if (wrap && track) {
    wrap.addEventListener('mouseenter', () => { paused = true; });
    wrap.addEventListener('mouseleave', () => { paused = false; });
  }

  /* ================= 二、点击放大（Lightbox 遮罩） ================= */
  let lb = null, lbIndex = 0;

  function ensureLB() {
    if (lb) return lb;
    lb = document.createElement('div');
    lb.className = 'glb';
    lb.setAttribute('role', 'dialog');
    lb.setAttribute('aria-modal', 'true');
    lb.setAttribute('aria-label', '作品大图浏览');
    lb.innerHTML =
      '<button type="button" class="glb-close" aria-label="关闭">×</button>' +
      '<button type="button" class="glb-nav glb-nav--prev" aria-label="上一张">‹</button>' +
      '<button type="button" class="glb-nav glb-nav--next" aria-label="下一张">›</button>' +
      '<div class="glb-body"><img alt=""><div class="glb-cap"></div></div>';
    document.body.appendChild(lb);
    bindSwipe(lb);
    lb.addEventListener('click', (e) => {
      if (e.target === lb || e.target.closest('.glb-close')) closeLB();
      else if (e.target.closest('.glb-nav--prev')) stepLB(-1);
      else if (e.target.closest('.glb-nav--next')) stepLB(1);
    });
    return lb;
  }
  function openLB(item, index) {
    if (!works.length) return;
    lbIndex = Math.max(0, Math.min(index, works.length - 1));
    ensureLB();
    renderLB();
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
    const c = lb.querySelector('.glb-close');
    if (c) c.focus();
  }
  function renderLB() {
    if (!lb) return;
    const item = works[lbIndex];
    const img = lb.querySelector('img');
    img.alt = item.title || '无题';
    // 竖版（高>宽）解除高度上限 → 舞台可上下滚动看全
    img.classList.toggle('is-portrait', false);
    // 先挂 onload 再设 src：命中缓存时 onload 可能早于挂载而永不触发
    const afterLoad = () => {
      img.classList.toggle('is-portrait', img.naturalHeight > img.naturalWidth);
      const body = lb.querySelector('.glb-body');
      if (body) body.scrollTop = 0;
    };
    img.onload = afterLoad;
    img.src = fullSrc(item);
    if (img.complete && img.naturalWidth) afterLoad();
    const cap = lb.querySelector('.glb-cap');
    cap.textContent = '';
    const capTitle = document.createElement('b');
    capTitle.textContent = item.title || '无题';
    cap.appendChild(capTitle);
    if (item.desc) cap.appendChild(document.createTextNode('　「' + item.desc + '」'));
    if (item.author) { const capAuthor = document.createElement('span'); capAuthor.textContent = item.author; cap.appendChild(capAuthor); }
    const capNo = document.createElement('em');
    capNo.textContent = (works.length - lbIndex) + ' / ' + works.length;
    cap.appendChild(capNo);
  }
  function stepLB(d) {
    if (!works.length) return;
    lbIndex = (lbIndex + d + works.length) % works.length;
    renderLB();
  }
  function closeLB() {
    if (!lb) return;
    lb.classList.remove('open');
    document.body.style.overflow = '';
  }
  document.addEventListener('keydown', (e) => {
    if (!lb || !lb.classList.contains('open')) {
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); closeLB(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); stepLB(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); stepLB(1); }
  });

  /* ================= 卡片 与 轨道布局 ================= */
  function cardSrc(item) {
    return item.thumb || item.thumbData || item.file || item.data || '';   // 卡片/一览：优先缩略图
  }
  function fullSrc(item) {
    return item.file || item.data || '';                                   // 全屏：原图
  }
  function makeCard(item, index, extraCls) {
    const c = document.createElement('figure');
    c.className = 'gcard' + (extraCls ? ' ' + extraCls : '');
    c.tabIndex = 0;
    c.setAttribute('role', 'button');
    c.setAttribute('aria-label', '放大查看《' + (item.title || '无题') + '》');

    const img = document.createElement('img');
    img.src = cardSrc(item);
    img.alt = item.title || '无题';
    img.decoding = 'async';
    img.loading = 'lazy';
    img.addEventListener('error', () => c.classList.add('gcard--failed'));
    c.appendChild(img);

    const cap = document.createElement('figcaption');
    cap.className = 'gcard__cap';
    const t = document.createElement('b');
    t.textContent = item.title || '无题';
    const d = document.createElement('span');
    d.textContent = item.desc || '（暂无说明）';
    const a = document.createElement('span');
    a.className = 'gcard__author';
    a.textContent = item.author ? '绘 · ' + item.author : '';
    cap.append(t, d, a);
    c.appendChild(cap);

    c.addEventListener('click', () => openLB(item, index));
    c.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLB(item, index); }
    });
    return c;
  }
  function layout(items, root) {
    if (!root) return;
    items.forEach((it, i) => {
      if (!cardSrc(it)) return;
      // 两份克隆都用同一份"真实序号"，保证点哪张开哪张（含 clone 副本）
      const realIndex = works.length - 1 - (i % works.length);
      root.appendChild(makeCard(it, realIndex));
    });
  }
  /* ---------- 轨道下方：画廊图一览（超过 24 幅折叠，按需展开） ---------- */
  const OVERVIEW_LIMIT = 24;
  let overviewExpanded = false;
  function renderOverview() {
    const box = $('#galleryOverview');
    if (!box) return;
    box.textContent = '';
    const ordered = works.slice().reverse();
    const shown = overviewExpanded ? ordered : ordered.slice(0, OVERVIEW_LIMIT);
    shown.forEach((it, i) => {
      if (!cardSrc(it)) return;
      const realIndex = works.length - 1 - i;
      box.appendChild(makeCard(it, realIndex, 'gcard--ov'));
    });
    if (!overviewExpanded && ordered.length > OVERVIEW_LIMIT) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'btn btn--ghost btn--sm gallery-more';
      more.textContent = '显示全部 ' + ordered.length + ' 幅';
      more.addEventListener('click', () => { overviewExpanded = true; renderOverview(); });
      box.appendChild(more);
    }
  }
  /* ---------- 加载骨架占位 ---------- */
  let worksLoaded = false;
  function renderSkeleton() {
    if (!track) return;
    track.textContent = '';
    const ov = $('#galleryOverview');
    if (ov) ov.textContent = '';
    for (let i = 0; i < 6; i++) {
      const s = document.createElement('div');
      s.className = 'skel';
      s.setAttribute('aria-hidden', 'true');
      track.appendChild(s);
    }
    if (ov) {
      for (let i = 0; i < 8; i++) {
        const s = document.createElement('div');
        s.className = 'skel';
        s.setAttribute('aria-hidden', 'true');
        ov.appendChild(s);
      }
    }
    if (countEl) countEl.textContent = '加载中…';
    if (emptyHint) emptyHint.hidden = true;
  }

  function renderGallery() {
    if (!track) return;
    if (!worksLoaded && !works.length) { renderSkeleton(); return; }
    track.textContent = '';
    x = 0; W = 0;
    const ordered = works.slice().reverse(); // 新作品在前
    layout(ordered, track);   // 第一份
    layout(ordered, track);   // 第二份（完全一致 → 无缝回绕）
    renderOverview();
    if (countEl) {
      countEl.textContent = works.length
        ? (serverMode ? '全站共 ' + works.length + ' 幅作品' : '本机已收藏 ' + works.length + ' 幅作品')
        : '';
    }
    if (emptyHint) emptyHint.hidden = works.length > 0;
    waitImagesThenStart(track);
  }


  /* 轮播可见性：屏幕外/后台时暂停省帧 */
  if (wrap && 'IntersectionObserver' in window) {
    let wrapVisible = true;
    const ioW = new IntersectionObserver((es) => {
      es.forEach((en) => {
        const was = wrapVisible;
        wrapVisible = en.isIntersecting;
        if (was && !wrapVisible) stopLoop();
        if (!was && wrapVisible && works.length && !document.hidden) startLoop();
      });
    }, { threshold: 0.05 });
    ioW.observe(wrap);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopLoop();
      else if (wrapVisible && works.length) startLoop();
    });
  }

  /* ================= 交互：轮播拖拽滚动 / 大图滑动切换 / 焦点陷阱 ================= */
  function bindSwipe(box) {
    let tsX = 0, tsY = 0, tsT = 0;
    box.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      tsX = t.clientX; tsY = t.clientY; tsT = Date.now();
    }, { passive: true });
    box.addEventListener('touchend', (e) => {
      const t = e.changedTouches[0];
      const dx = t.clientX - tsX, dy = t.clientY - tsY;
      if (Date.now() - tsT > 700) return;
      if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy)) { stepLB(dx < 0 ? 1 : -1); return; }
      if (dy > 90 && Math.abs(dy) > Math.abs(dx)) closeLB();
    }, { passive: true });
  }
  (function initUxPack() {
    /* 3) 轮播：鼠标拖拽横向滚动（拖拽后抑制误点击） */
    if (wrap) {
      let dragging = false, startX = 0, startLeft = 0, moved = 0;
      wrap.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'touch') return;
        dragging = true; moved = 0;
        startX = e.clientX; startLeft = wrap.scrollLeft;
        wrap.classList.add('is-dragging');
      });
      window.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const dx = e.clientX - startX;
        moved = Math.max(moved, Math.abs(dx));
        if (moved > 4) wrap.scrollLeft = startLeft - dx;
      });
      window.addEventListener('pointerup', () => {
        if (!dragging) return;
        dragging = false;
        wrap.classList.remove('is-dragging');
      });
      wrap.addEventListener('click', (e) => {
        if (moved > 6) { e.stopPropagation(); e.preventDefault(); moved = 0; }
      }, true);
    }

    /* 5) 大图焦点陷阱：Tab 只在查看器内循环 */
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab' || !lb || !lb.classList.contains('open')) return;
      const focusables = Array.from(lb.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
        .filter((el) => !el.disabled && el.offsetParent !== null);
      if (!focusables.length) return;
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  })();

  /* ================= 初始化 ================= */
  async function fetchWorks() {
    try {
      const r = await fetch('assets/data/works.json');
      if (!r.ok) return [];
      const j = await r.json();
      return Array.isArray(j) ? j.filter((w) => w && w.channel === 'gallery') : [];
    } catch (_) { return []; }
  }
  renderGallery(); // 未加载前显示骨架占位
  (async function init() {
    works = await fetchWorks();
    worksLoaded = true;
    renderGallery();
  })();
})();
