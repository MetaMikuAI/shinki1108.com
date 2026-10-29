/* =========================================================
   神绮桌宠 · 引擎 v2（模仿 dsh-dafeiyu 的架构，改良后用于网页）
   架构对照：
     · clips 清单（帧序列 + frameMs + loop + motion 动作语义）  ← 同 dafeiyu 的 pet-manifest
     · stateMap / 状态机（IDLE / WALK / HAPPY / ANGRY / DIZZY / DRAG / SLEEP / PAT）
     · idleMicroClips：待机时「偶尔」眨个眼、瞥一眼（而不是一直换表情）
     · 配置项照搬它那套：activityLevel / bubbleMode / reducedMotion / size …
   用法：ShinkiPet.init({ mount, size, ... })
   ========================================================= */
(function () {
  'use strict';

  var MANIFEST_URL = 'assets/pet/pet-manifest.json';
  var ASSET_V = 3;                                   // 素材缓存版本，换素材时 +1
  function ASSET(name) { return 'assets/pet/' + name + '?v=' + ASSET_V; }

  /* 兜底清单（manifest 读不到时用，保证桌宠一定出得来） */
  var FALLBACK = {
    clips: {
      idle: { frames: [{ pose: 'p3', expr: 1 }], loop: true, motion: 'breathe' },
      blink: { frames: [{ pose: 'p3', expr: 2 }], loop: false, holdMs: 260 },
      glance: { frames: [{ pose: 'p3', expr: 4 }], loop: false, holdMs: 420 },
      walk: { frames: [{ pose: 'p2', expr: 1 }], loop: true, motion: 'walk' },
      happy: { frames: [{ pose: 'p4', expr: 2 }], loop: false, holdMs: 1100, motion: 'bounce' },
      angry: { frames: [{ pose: 'p4', expr: 5 }], loop: false, holdMs: 1200, motion: 'shake' },
      dizzy: { frames: [{ pose: 'p1', expr: 3 }], loop: true, motion: 'dizzy' },
      dragging: { frames: [{ pose: 'p1', expr: 4 }], loop: true },
      drop: { frames: [{ pose: 'p2', expr: 3 }], loop: false, holdMs: 700, motion: 'bounce' },
      head_pat: { frames: [{ pose: 'p3', expr: 3 }], loop: false, holdMs: 1400, motion: 'pat' },
      sleep: { frames: [{ pose: 'p1', expr: 1 }], loop: true, motion: 'breathe' },
      wakeup: { frames: [{ pose: 'p3', expr: 5 }], loop: false, holdMs: 900, motion: 'bounce' }
    },
    idleMicroClips: ['blink', 'glance'],
    config: { size: 156, speed: 42, idleToSleep: 30000, microEveryMs: 5200, microChance: 0.45, activityLevel: 'normal', bubbleMode: 'events', reducedMotion: false },
    lines: {
      poke: ['别戳啦，会痒的。', '……有什么事吗？', '黑绮士 669，报到。'],
      head_pat: ['唔……摸头可不是对神明的礼节。', '……就一下哦。'],
      angry: ['巫女什么的，不过是神的狗而已！'],
      drop: ['哇——！'], dizzy: ['头……好晕……'], sleep: ['zzZ……'], wakeup: ['唔……谁呀？']
    }
  };

  var ACTIVITY = { quiet: 0.0008, normal: 0.0022, lively: 0.0055 };

  var cfg, clips, micros, lines, root, flip, sprite, bubble, shadow;
  var clip, clipIdx, clipUntil, poseId, expr, frameTimer, microTimer, raf;
  var x = 0, y = 0, vx = 0, vy = 0, facing = 1, dragging = false, dragOffX = 0, dragOffY = 0;
  var moveUntil = 0, sleepTimer = null, onGround = true, lastLoop = 0;
  var sleepWakeTimer = null, sleepMicroTimer = null;
  var lastPoseAt = Date.now(), microSince = 0, lastMicroAt = 0;
  var lastStateSeen = 'IDLE', stateSince = Date.now();   // 状态看门狗
  var releaseStalePress = null;                          // 由 bindPointer 注入
  var pressAlive = function () { return null; };          // 由 bindPointer 注入   // 最后一次换姿势/表情的时间（防呆心跳用）   // 睡眠相关计时器
  var draggingSince = 0, dragDistance = 0, pokeTimes = [];
  var STATE = 'IDLE', previewing = false, clipName = 'idle';

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  /* ---------------- clip 播放 ---------------- */
  function frameOf(c, i) {
    var f = c.frames[Math.min(i, c.frames.length - 1)];
    return f;
  }
  function renderFrame() {
    if (previewing) return;                 // 预览模式下不被 clip 覆盖
    var f = frameOf(clip, clip.reverse ? (clip.frames.length - 1 - clipIdx) : clipIdx);
    if (!f) return;
    if (sprite) sprite.src = ASSET('' + (f.src || (f.pose + '_' + String(f.expr).padStart(2, '0') + '.png')));
    lastPoseAt = Date.now();
    if (f.pose) poseId = f.pose;
    if (f.expr) expr = f.expr;
  }
  function setMotion(name) {
    if (!sprite) return;
    sprite.className = 'pet__sprite' + (name ? ' motion-' + name : '');
  }
  /** 播放一个 clip；one-shot 的会在 holdMs 后自动回到 idle */
  function play(name, opts) {
    var c = clips[name] || clips.idle;
    if (!c) return;
    previewing = false;                     // 任何 clip 播放都退出预览模式
    clip = c; clipIdx = 0;
    renderFrame();
    setMotion(cfg.reducedMotion ? '' : (c.motion || ''));
    if (frameTimer) { clearInterval(frameTimer); frameTimer = null; }
    if (c.frames.length > 1) {
      // 注意：原来是 if (c.loop && ...)，导致"一次性多帧 clip（过渡动画）"只播第 1 帧
      frameTimer = setInterval(function () {
        clipIdx++;
        if (clipIdx >= c.frames.length) {
          if (c.loop) clipIdx = 0; else { clipIdx = c.frames.length - 1; clearInterval(frameTimer); frameTimer = null; }
        }
        renderFrame();
      }, c.frameMs || 180);
    }
    if (!c.loop) {
      var hold = c.holdMs || 900;
      clipUntil = Date.now() + (opts && opts.hold ? opts.hold : hold);
    } else {
      clipUntil = 0;
    }
    clipName = name;
    root.dataset.clip = name;
    root.dataset.state = STATE;
  }
  function backToIdle() {
    STATE = 'IDLE';
    play('idle');
  }

  /* ---------------- 说话 ---------------- */
  function say(text, ms) {
    if (!bubble || !root) return;
    bubble.textContent = text;
    root.classList.add('is-talking');
    clearTimeout(bubble.__t);
    bubble.__t = setTimeout(function () { root.classList.remove('is-talking'); }, ms || 2600);
  }
  function sayFrom(key) {
    var arr = lines[key];
    if (arr && arr.length) say(pick(arr));
  }

  /* ---------------- 位置 ---------------- */
  function applyTransform() {
    if (!root) return;
    root.style.transform = 'translate3d(' + Math.round(x) + 'px,' + Math.round(y) + 'px,0)';
    if (flip) flip.style.transform = 'scaleX(' + facing + ')';
  }
  /* 真实可视区尺寸：手机上地址栏伸缩时用 visualViewport 才准 */
  function viewW() { return (window.visualViewport && window.visualViewport.width) || window.innerWidth; }
  function viewH() { return (window.visualViewport && window.visualViewport.height) || window.innerHeight; }

  function bounds() {
    var w = root.offsetWidth || cfg.size, h = root.offsetHeight || cfg.size;
    // translateY 是相对页面顶部的位移：0 = 顶部，maxY = 贴可视底部（再留 cfg.bottom）
    var maxY = Math.max(0, viewH() - h - cfg.bottom);
    return { minX: 0, maxX: Math.max(0, viewW() - w), minY: 0, maxY: maxY };
  }

  /* ---------------- 行为 ---------------- */
  /* 睡姿微动作：睡着时偶尔翻个身 / 嘟囔一句，避免"趴下就一潭死水" */
  function startSleepMicro() {
    clearInterval(sleepMicroTimer);
    sleepMicroTimer = setInterval(function () {
      if (STATE !== 'SLEEP' || dragging) return;
      if (Math.random() > cfg.sleepMicroChance) return;
      var name = (clips.sleep_roll && Math.random() < 0.6) ? 'sleep_roll' : (clips.sleep_fuss ? 'sleep_fuss' : 'sleep');
      play(name);
      sayFrom('dream');
      setTimeout(function () { if (STATE === 'SLEEP' && !dragging) play('sleep'); }, (clips[name].holdMs || 900) + 60);
    }, cfg.sleepMicroEveryMs);
  }

  /* 进入睡眠的唯一入口（自动睡 / 手动睡 / API 都走这里） */
  function enterSleep() {
    STATE = 'SLEEP';
    play(clips.lie_down ? 'lie_down' : 'sleep');   // 有过渡帧就先播过渡
    if (!clips.lie_down) sayFrom('sleep');
    // 关键：睡一小觉会自己醒，不会一直趴着不动
    clearTimeout(sleepWakeTimer);
    sleepWakeTimer = setTimeout(function () {
      if (STATE === 'SLEEP' && !dragging) wake(true);
    }, cfg.sleepToWake);
    startSleepMicro();
  }

  function armSleep() {
    clearTimeout(sleepTimer);
    sleepTimer = setTimeout(function () {
      if (dragging) return;
      enterSleep();
    }, cfg.idleToSleep);
  }
  function act() { armSleep(); }
  function wake(fromSleep) {
    armSleep();
    clearTimeout(sleepWakeTimer);
    clearInterval(sleepMicroTimer);
    if (fromSleep && STATE === 'SLEEP') { STATE = 'WAKE'; sayFrom('wakeup'); play(clips.stand_up ? 'stand_up' : 'wakeup'); }
  }
  function jump() { if (!onGround) return; vy = -320; onGround = false; }
  function walk(dir, ms) {
    facing = dir < 0 ? -1 : 1;
    vx = cfg.speed * facing;
    moveUntil = Date.now() + (ms || rand(1200, 3200));
    if (STATE !== 'WALK') { STATE = 'WALK'; play('walk'); root.classList.add('is-walking'); if (Math.random() < 0.3) sayFrom('walk'); }
  }
  function happy(ms) { STATE = 'HAPPY'; play('happy', { hold: ms }); }
  function angry(ms) { STATE = 'ANGRY'; play(clips.angry_in ? 'angry_in' : 'angry', { hold: ms }); }
  function dizzy(ms) { STATE = 'DIZZY'; play('dizzy'); if (ms) { clipUntil = Date.now() + ms; } else { clipUntil = 0; } }

  /* ---------------- 主循环 ---------------- */
  function loop() {
    // 页面切到后台：不做物理计算（省电），回前台再继续
    if (document.hidden) { lastLoop = 0; raf = requestAnimationFrame(loop); return; }
    var now = Date.now(), dt = Math.min(0.05, lastLoop ? (now - lastLoop) / 1000 : 0.016);

    /* ---- 看门狗：无条件保证"不会永远卡住"（移动端定时器/手势都可能丢事件）---- */
    if (STATE !== lastStateSeen) { lastStateSeen = STATE; stateSince = now; }
    // ⓪ 僵尸按住：按住超过 6 秒还没抬手 → 无条件强制释放
    //    （手机手势被系统抢走时 pointerup 会丢；正在拖拽时也必须能解开，否则会永远挂在半空）
    var pa = pressAlive();
    if (pa && (now - pa.at) > 6000) {
      if (releaseStalePress) releaseStalePress();
      dragging = false;
      onGround = false; vy = 0;            // 交给重力落回地面
      if (root) root.classList.remove('is-dragging');
      if (STATE !== 'IDLE' && STATE !== 'SLEEP') backToIdle();
    }
    if (!dragging) {
      // ① 任何非待机状态（睡眠除外）卡超过 12 秒 → 强制回待机
      if (STATE !== 'IDLE' && STATE !== 'SLEEP' && (now - stateSince) > 12000) {
        root.classList.remove('is-walking');
        backToIdle();
      }
      // ② 太久没换过外观 → 强制来一个微动作（不依赖 setInterval）
      if (STATE === 'IDLE' && (now - lastPoseAt) > (cfg.idleChangeMax || 9000)) fireMicro(true);
      // ②b 素材兜底：已经远超心跳间隔还没换过图（说明图没加载出来）→ 重设一次 src 再拉
      if (STATE === 'IDLE' && (now - lastPoseAt) > (cfg.idleChangeMax || 9000) * 2) {
        sprite.dataset.retry = '0';
        renderFrame();
        lastPoseAt = now;
        if (window.console && console.warn) console.warn('[桌宠] 画面长时间未更新，已重新请求当前帧素材');
      }
      // ③ 卡在走路态超时 → 回待机
      if (STATE === 'WALK' && now > moveUntil + 1500) { root.classList.remove('is-walking'); backToIdle(); }
      // ④ 卡在微动作态超时 → 回待机
      if (STATE === 'MICRO' && (now - microSince) > 8000) backToIdle();
    }
    lastLoop = now;

    if (!dragging) {
      if (now < moveUntil) {
        x += vx * dt;
        var b = bounds();
        if (x <= b.minX) { x = b.minX; vx = -vx; facing = 1; }
        if (x >= b.maxX) { x = b.maxX; vx = -vx; facing = -1; }
      } else {
        vx = 0;
        if (STATE === 'WALK') { STATE = 'IDLE'; root.classList.remove('is-walking'); play('idle'); }
        var act = ACTIVITY[cfg.activityLevel] || ACTIVITY.normal;
        if (STATE === 'IDLE' && Math.random() < act) walk(Math.random() < 0.5 ? -1 : 1);
      }
      if (!onGround || vy !== 0) {
        vy += 1400 * dt;
        y += vy * dt;
        var bb = bounds();
        if (y >= bb.maxY) {
          y = bb.maxY; vy = 0; onGround = true;
          STATE = 'DROP'; play('drop');
          if (dragDistance > 600) sayFrom('drop');
          dragDistance = 0;
        }
      }
      // one-shot clip 播完回待机
      if (clipUntil && now >= clipUntil) {
        clipUntil = 0;
        var cNext = clips[clipName] && clips[clipName].next;
        if (cNext && clips[cNext] && cNext !== 'idle') {
          if (cNext === 'sleep') { STATE = 'SLEEP'; sayFrom('sleep'); }
          play(cNext);
        } else backToIdle();
      }
    }
    applyTransform();
    raf = requestAnimationFrame(loop);
  }

  /* ---------------- 待机微动作（偶尔眨眼/瞥一眼）---------------- */
  /* 触发一次待机微动作（force=true 时忽略概率，用于心跳兜底） */
  function fireMicro(force) {
    if (dragging || STATE !== 'IDLE') return false;
    if (!force && Math.random() > cfg.microChance) return false;
    var name = pick(micros);
    if (!clips[name]) return false;
    var keep = STATE;
    STATE = 'MICRO';
    microSince = Date.now();
    play(name);
    lastMicroAt = Date.now();
    if (clips[name].next) return true;      // 多段链条自己负责收尾
    setTimeout(function () {
      if ((STATE === 'MICRO' || STATE === keep) && !dragging) backToIdle();
    }, (clips[name].holdMs || 300) + 40);
    return true;
  }

  function startMicro() {
    clearInterval(microTimer);
    // 辅助定时器（部分浏览器上会被节流，所以真正可靠的是下面主循环里的心跳）
    microTimer = setInterval(function () { fireMicro(false); }, cfg.microEveryMs);
  }

  /* ---------------- 指针交互：戳 / 摸头 / 拖拽（先判定意图，避免误当成举起） ---------------- */
  function bindPointer() {
    var lastX = 0, lastY = 0, lastT = 0;
    var press = null;      // { x, y, at, moved, started, pat, holdTimer }

    // 触摸用手指更宽的容差：轻微抖动不算拖拽；鼠标则要灵敏
    function thresh(e) { return (e && e.pointerType === 'touch') ? 16 : 6; }
    function distTo(e) { return Math.sqrt((e.clientX - press.x) * (e.clientX - press.x) + (e.clientY - press.y) * (e.clientY - press.y)); }

    function detach() {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
    }

    function onMove(e) {
      if (!press) return;
      press.moved = Math.max(press.moved, distTo(e));
      if (!press.started) {
        if (distTo(e) <= thresh(e)) return;          // 还在手指抖动的容差内 → 不算拖拽
        // 正式进入拖拽：此刻重算抓取偏移，位置不会跳
        press.started = true;
        clearTimeout(press.holdTimer);
        dragging = true; onGround = false;
        draggingSince = Date.now(); dragDistance = 0;
        dragOffX = e.clientX - x; dragOffY = e.clientY - y;
        lastX = e.clientX; lastY = e.clientY; lastT = Date.now(); vx = 0; vy = 0;
        root.classList.add('is-dragging');
        STATE = 'DRAG'; play('dragging');
      }
      var b = bounds();
      dragDistance += Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY);
      x = clamp(e.clientX - dragOffX, b.minX, b.maxX);
      y = clamp(e.clientY - dragOffY, b.minY, b.maxY);
      var now = Date.now(), dt = Math.max(1, now - lastT);
      vx = clamp((e.clientX - lastX) / dt * 260, -900, 900);
      lastX = e.clientX; lastY = e.clientY; lastT = now;
      if (Math.abs(e.clientX - press.x) > 6) facing = e.clientX > press.x ? 1 : -1;
      applyTransform();
      if (e.cancelable) e.preventDefault();
    }

    function onUp(e) {
      if (!press) return;
      clearTimeout(press.holdTimer);
      var started = press.started, wasPat = press.pat, dur = Date.now() - press.at;
      detach();
      press = null;
      dragging = false;
      root.classList.remove('is-dragging');

      if (started) {
        /* —— 拖拽结束：投掷 + 落地 —— */
        vy = -140; onGround = false;
        var heldLong = Date.now() - draggingSince;
        if (dragDistance > 900 || heldLong > 5000) {
          if (Math.random() < 0.5) { angry(1400); sayFrom('angry'); } else { dizzy(1600); sayFrom('dizzy'); }
        } else {
          STATE = 'WALK'; play('walk'); root.classList.add('is-walking');
        }
        walk(vx < 0 ? -1 : 1, rand(400, 1100));
        return;
      }

      if (wasPat) { backToIdle(); return; }          // 摸头期间松手

      /* —— 没怎么动就松手 = 戳一下 —— */
      act();
      if (STATE === 'SLEEP') { wake(true); return; }
      var now = Date.now();
      pokeTimes = pokeTimes.filter(function (t) { return now - t < 2000; });
      pokeTimes.push(now);
      if (pokeTimes.length >= 3) {                   // 连戳三下 → 生气
        pokeTimes = [];
        angry(1500); sayFrom('angry'); jump();
        return;
      }
      happy(1100); sayFrom('poke'); jump();
    }

    /* 供主循环调用：把"按住"状态强制清掉（应对手机上手势被系统抢走、收不到 pointerup） */
    pressAlive = function () { return press; };
    releaseStalePress = function () {
      if (!press) return false;
      clearTimeout(press.holdTimer);
      detach();
      press = null;
      dragging = false;
      if (root) root.classList.remove('is-dragging');
      return true;
    };

    root.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      if (press) return;
      act();                                          // 一按就重置睡眠计时
      moveUntil = 0; vx = 0;                          // 正在溜达的话先停下来
      press = { x: e.clientX, y: e.clientY, at: Date.now(), moved: 0, started: false, pat: false, holdTimer: 0 };
      try { if (root.setPointerCapture && e.pointerId !== undefined) root.setPointerCapture(e.pointerId); } catch (_) {}
      window.addEventListener('pointermove', onMove, true);
      window.addEventListener('pointerup', onUp, true);
      window.addEventListener('pointercancel', onUp, true);
      // 按住不动 0.6 秒 = 摸头
      press.holdTimer = setTimeout(function () {
        if (!press || press.started || press.moved > 16) return;   // 期间动过就不算摸头
        press.pat = true;
        STATE = 'PAT';
        play('head_pat');
        sayFrom('head_pat');
      }, 600);
      e.preventDefault();
    });
  }


  /* ---------------- 初始化 ---------------- */
  function buildDom() {
    root = document.createElement('div');
    root.className = 'pet';
    root.style.setProperty('--pet-size', cfg.size + 'px');

    bubble = document.createElement('div');
    bubble.className = 'pet__bubble';

    shadow = document.createElement('span');
    shadow.className = 'pet__shadow';
    shadow.setAttribute('aria-hidden', 'true');

    flip = document.createElement('div');
    flip.className = 'pet__flip';

    sprite = document.createElement('img');
    sprite.className = 'pet__sprite';
    sprite.alt = '';
    sprite.draggable = false;
    // 素材加载失败时浏览器会一直显示上一张图（看起来就是"卡住不动"）——这里自动换 URL 重试
    sprite.addEventListener('load', function () { sprite.dataset.retry = '0'; });
    sprite.addEventListener('error', function () {
      var cur = String(sprite.src || sprite.getAttribute('src') || '');   // property 优先（浏览器里它就是当前请求的绝对地址）
      var tries = Number(sprite.dataset.retry || 0);
      if (tries < 2 && cur) {
        sprite.dataset.retry = String(tries + 1);
        var base = cur.split('&r=')[0];
        var next = base + '&r=' + (tries + 1);
        if (window.console && console.warn) console.warn('[桌宠] 素材加载失败，重试 ' + (tries + 1) + ' 次：' + cur);
        sprite.src = next;
      } else if (window.console && console.warn) {
        console.warn('[桌宠] 素材反复加载失败（网络问题？）：' + cur);
      }
    });

    flip.appendChild(sprite);
    root.appendChild(bubble);
    root.appendChild(shadow);
    root.appendChild(flip);
  }

  function start(manifest) {
    clips = (manifest && manifest.clips) || FALLBACK.clips;
    micros = (manifest && manifest.idleMicroClips) || FALLBACK.idleMicroClips;
    lines = (manifest && manifest.lines) || FALLBACK.lines;
    var mc = (manifest && manifest.config) || {};

    cfg = Object.assign({
      mount: document.body, size: mc.size || 156, speed: mc.speed || 42,
      idleToSleep: mc.idleToSleep || 30000, microEveryMs: mc.microEveryMs || 5200,
      idleChangeMax: mc.idleChangeMax || 9000,
      sleepToWake: mc.sleepToWake || 25000, sleepMicroEveryMs: mc.sleepMicroEveryMs || 6500, sleepMicroChance: mc.sleepMicroChance === undefined ? 0.5 : mc.sleepMicroChance,
      microChance: mc.microChance === undefined ? 0.45 : mc.microChance,
      activityLevel: mc.activityLevel || 'normal', bubbleMode: mc.bubbleMode || 'events',
      reducedMotion: mc.reducedMotion || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches),
      bottom: 0
    }, start.__opts || {});

    buildDom();
    cfg.mount.appendChild(root);

    // 底部安全区（iOS 的 home 指示条）也算进来
    var safe = 0;
    try {
      var raw = getComputedStyle(root).getPropertyValue('--pet-safe-bottom') || '0px';
      safe = parseFloat(raw) || 0;
    } catch (_) { safe = 0; }
    cfg.bottom = cfg.bottom + safe;

    x = Math.max(12, viewW() - cfg.size - 24);
    var startH = root.offsetHeight || cfg.size;
    y = Math.max(0, viewH() - startH - cfg.bottom);
    applyTransform();
    // 出场：轻轻落下
    root.classList.add('is-entering');
    setTimeout(function () { root.classList.remove('is-entering'); }, 1100);
    bindPointer();
    backToIdle();
    startMicro();
    try {
      console.log('[桌宠] 已启动 · clip ' + Object.keys(clips).length + ' 个 · ' +
        (cfg.reducedMotion ? '系统开了减少动态效果（骨骼动作已减，但换表情照常）' : '正常模式') +
        ' · 待机心跳 ' + (cfg.idleChangeMax || 9000) + 'ms');
    } catch (_) {}
    armSleep();
    loop();

    function reflow() {
      var b = bounds();
      x = clamp(x, b.minX, b.maxX);
      // 只有贴地时才跟着底部走（被拖到半空的不要被硬拉下来）
      y = onGround ? b.maxY : clamp(y, b.minY, b.maxY);
      applyTransform();
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) return;
      if (STATE === 'SLEEP') { wake(true); return; }            // 回到页面就醒来
      // 后台期间定时器多半被节流了：回来就先检查一次，别让它是"定格"的画面
      if (STATE === 'IDLE' && (Date.now() - lastPoseAt) > (cfg.idleChangeMax || 9000)) fireMicro(true);
    });
    window.addEventListener('resize', reflow, { passive: true });
    window.addEventListener('orientationchange', function () { setTimeout(reflow, 220); });
    if (window.visualViewport) {
      // 手机上地址栏伸缩 / 键盘弹出都走这里，桌宠始终贴着真实可视底部
      window.visualViewport.addEventListener('resize', reflow, { passive: true });
      window.visualViewport.addEventListener('scroll', reflow, { passive: true });
    }
  }

  function init(opts) {
    start.__opts = opts || {};
    var done = false;
    function go(manifest) { if (done || !manifest) return; done = true; start(manifest); }
    fetch(MANIFEST_URL, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(go)
      .catch(function () { go(null); });
    return API;
  }

  var API = {
    init: init,
    play: function (name) { act(); STATE = name.toUpperCase(); play(name); },
    say: function (t) { say(t); },
    sayFrom: sayFrom,
    walk: function (d, ms) { act(); walk(d, ms); },
    jump: jump,
    happy: function () { act(); happy(); },
    angry: function () { act(); angry(); },
    dizzy: function () { act(); dizzy(1600); },
    sleep: function () { enterSleep(); },
    wake: function () { wake(true); },
    /** 调整贴底偏移（例如底部有控制台时把桌宠垫起来站上去） */
    setBottom: function (px) {
      cfg.bottom = Number(px) || 0;
      var b = bounds();
      y = clamp(y, b.minY, b.maxY);
      if (onGround) y = b.maxY;
      applyTransform();
    },
    clips: function () { return clips ? Object.keys(clips) : []; },
    /** 调试用：直接预览某张素材（文件名，如 'stand-puzzle.webp'） */
    preview: function (src) {
      previewing = true;
      if (sprite) {
        sprite.src = ASSET(String(src));
        setMotion('');
      }
      return String(src);
    },
    state: function () {
      return { state: STATE, clip: root && root.dataset.clip, pose: poseId, expr: expr,
        x: Math.round(x), y: Math.round(y), facing: facing, dragging: dragging,
        sleeping: STATE === 'SLEEP' };
    },
    destroy: function () {
      if (raf) cancelAnimationFrame(raf);
      if (frameTimer) clearInterval(frameTimer);
      if (microTimer) clearInterval(microTimer);
      if (root && root.parentNode) root.parentNode.removeChild(root);
    }
  };

  window.ShinkiPet = API;
})();
