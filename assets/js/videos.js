/* =========================================================
   神绮站 · 科普小课堂（视频页）脚本
   交互：封面 + 大播放键 → 点击就在卡片内播放（不跳转 B 站）
   兜底：封面拿不到也能播；播放器空白时保留「在 B 站打开」链接
   ========================================================= */
(function () {
  'use strict';

  var grid = document.getElementById('vidGrid');
  var emptyBox = document.getElementById('vidEmpty');
  if (!grid) return;

  var DATA_URL = 'assets/data/videos.json';

  function parseEntry(raw) {
    if (raw === null || raw === undefined) return null;
    var isObj = typeof raw === 'object';
    var text = isObj
      ? String(raw.bvid || raw.url || raw.link || raw.src || raw.iframe || raw.embed || '')
      : String(raw);
    var m = /(BV[0-9A-Za-z]{10})/.exec(text);
    if (!m) return null;
    var pm = /[?&](?:p|page)=(\d+)/i.exec(text);
    var pRaw = isObj ? (raw.p !== undefined ? raw.p : raw.page) : undefined;
    var p = Math.max(1, Math.floor(Number(pm ? pm[1] : (pRaw || 1))) || 1);
    return {
      bvid: m[1],
      p: p,
      title: isObj ? String(raw.title || '') : '',
      note: isObj ? String(raw.note || '') : ''
    };
  }

  function embedUrl(bv, p, info) {
    var parts = ['isOutside=true'];
    if (info && info.aid) parts.push('aid=' + info.aid);
    parts.push('bvid=' + bv);
    if (info && info.cid) parts.push('cid=' + info.cid);
    parts.push('p=' + p, 'autoplay=1', 'danmaku=0', 'high_quality=1');   // 点击后自动开播
    return 'https://player.bilibili.com/player.html?' + parts.join('&');
  }
  function watchUrl(bv, p) {
    return 'https://www.bilibili.com/video/' + bv + (p > 1 ? '?p=' + p : '');
  }
  function buildCard(item) {
    var card = document.createElement('article');
    card.className = 'vid';

    /* ---- 标题区 ---- */
    var head = document.createElement('div');
    head.className = 'vid__head';
    var h3 = document.createElement('h3');
    h3.className = 'vid__title';
    h3.textContent = item.title || ('B 站视频 ' + item.bvid);
    head.appendChild(h3);
    var meta = document.createElement('p');
    meta.className = 'vid__meta';
    meta.textContent = item.note || '669的科普小课堂 · 点击播放';
    head.appendChild(meta);
    card.appendChild(head);

    /* ---- 播发区：封面 + 大播放键 ---- */
    var stage = document.createElement('div');
    stage.className = 'vid__stage';

    var poster = document.createElement('button');
    poster.type = 'button';
    poster.className = 'vid__poster';
    poster.setAttribute('aria-label', '播放：' + (item.title || item.bvid));

    var cover = document.createElement('img');
    cover.className = 'vid__cover';
    cover.alt = '';
    cover.hidden = true;                       // 有封面地址才显示
    poster.appendChild(cover);

    var play = document.createElement('span');
    play.className = 'vid__play';
    play.innerHTML = '<i></i><b>点击播放</b>';
    poster.appendChild(play);

    stage.appendChild(poster);
    card.appendChild(stage);

    /* ---- 底部：提示 + B 站兜底链接 ---- */
    var foot = document.createElement('div');
    foot.className = 'vid__foot';
    var note = document.createElement('p');
    note.className = 'vid__note';
    note.textContent = '点击封面即可在页内播放';
    foot.appendChild(note);
    var a = document.createElement('a');
    a.className = 'text-link vid__link';
    a.href = watchUrl(item.bvid, item.p);
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = '播放器空白？在 B 站打开 ↗';
    foot.appendChild(a);
    card.appendChild(foot);

    /* ---- 点击 → 就地加载播放器 ---- */
    var frame = null;
    poster.addEventListener('click', function () {
      if (frame) return;
      frame = document.createElement('iframe');
      frame.className = 'vid__frame';
      frame.src = embedUrl(item.bvid, item.p, item.info);
      frame.setAttribute('title', 'B站视频：' + (item.title || item.bvid));
      frame.setAttribute('allowfullscreen', 'true');
      frame.setAttribute('allow', 'fullscreen; autoplay; encrypted-media; picture-in-picture');
      frame.setAttribute('scrolling', 'no');
      frame.setAttribute('frameborder', '0');
      stage.appendChild(frame);
      card.classList.add('is-playing');
    });

    card.__titleEl = h3;
    card.__metaEl = meta;
    card.__coverEl = cover;
    card.__noteEl = note;
    return card;
  }

  function main() {
    fetch(DATA_URL, { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (raw) {
        var arr = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.videos) ? raw.videos : []);
        var list = arr.map(parseEntry).filter(Boolean);

        var loading = grid.querySelector('.vid-loading');
        if (loading) loading.remove();

        if (!list.length) {
          if (emptyBox) emptyBox.hidden = false;
          return;
        }

        list.forEach(function (it) {
          it.__card = buildCard(it);
          grid.appendChild(it.__card);
        });

      })
      .catch(function (e) {
        var loading2 = grid.querySelector('.vid-loading');
        if (loading2) loading2.remove();
        var box = document.createElement('div');
        box.className = 'vid-error';
        box.textContent = '视频清单读取失败：' + (e && e.message ? e.message : String(e)) +
          ' · 请稍后刷新重试';
        grid.appendChild(box);
      });
  }

  main();
})();
