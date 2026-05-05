/* ============================================================
   pixel-sprites.js — Pixel Art Avatar System for PIXEL.LOBBY
   ============================================================ */
(function (root) {
  'use strict';

  /* ── Avatar keys ─────────────────────────────────────────── */
  var AVATAR_KEYS = [
    'knight','wizard','ninja','robot','alien',
    'cat','ghost','skull','bat','dragon','pug','slime'
  ];

  /* ── Sprite maps (8 chars × 8 rows) ─────────────────────── */
  var SPRITE_MAPS = {
    knight: [
      '..BBBB..',
      '.BLLLLB.',
      '.BLXXLB.',
      '.BLXXLB.',
      '..BSSB..',
      '.BSXXSB.',
      '.BSSSSB.',
      '.B.BB.B.'
    ],
    wizard: [
      '...B....',
      '..BXB...',
      '.BXXXB..',
      'BXXXXXB.',
      '.BLLLB..',
      '..BLLB..',
      '.BSSSB..',
      '.BB..BB.'
    ],
    ninja: [
      '.BBBBBB.',
      'BLLLLLLB',
      'BBYBBYBB',
      'BLLLLLLB',
      '.BSSSSB.',
      'BSXXXXSB',
      'BSSSSSSB',
      '.B.BB.B.'
    ],
    robot: [
      '.BBBBBB.',
      'BLLLLLLB',
      'BLBLLBLB',
      'BLLLLLLB',
      '.BBYYBB.',
      'BSSSSSSB',
      'BSXXXXSB',
      '.BB.BB..'
    ],
    alien: [
      '.BBBB...',
      'BXXXXBB.',
      'BXLBLXB.',
      'BXXXXXB.',
      'BBYYYBB.',
      '.BSSSB..',
      'BSSSSSB.',
      '.BB.BB..'
    ],
    cat: [
      'B.BBBB.B',
      'BLBLLBLB',
      'BLBLLBLB',
      'BLLBBLLB',
      '.BLLLLB.',
      '.BLLLLB.',
      'B.BLLB.B',
      '.BB..BB.'
    ],
    ghost: [
      '..BBBB..',
      '.BLLLLB.',
      'BLLBLBLB',
      'BLLBLBLB',
      'BLLLLLLB',
      'BLLLLLLB',
      'B.BB.BB.',
      '.B..B..B'
    ],
    skull: [
      '.BBBBBB.',
      'BLLLLLLB',
      'BLBLLBLB',
      'BLBLLBLB',
      'BLLBBLLB',
      '.BBLLBB.',
      '.B.BB.B.',
      '..B..B..'
    ],
    bat: [
      'B......B',
      'BB.BB.BB',
      'BLBLLBLB',
      'BLLLLLLB',
      'BLLBBLLB',
      '.BLLLLB.',
      '..BBBB..',
      '...BB...'
    ],
    dragon: [
      '.BBBB...',
      'BXXXXBB.',
      'BXLXXXB.',
      'BXXXXBB.',
      '.BSSSB..',
      'BSXXXSB.',
      'BSSSSSB.',
      '.BB.BB..'
    ],
    pug: [
      '..BBBB..',
      '.BLLLLB.',
      'BLLBLBLB',
      'BLLLLLLB',
      '.BBLLBB.',
      '.BSSSSB.',
      '.BSXXSB.',
      'B.BB.BB.'
    ],
    slime: [
      '........',
      '..BBBB..',
      '.BLXXLB.',
      'BXLXXLXB',
      'BXXBXXBB',
      'BSXXXXSB',
      '.BSSSSSB',
      '.BB..BB.'
    ]
  };

  /* ── Color palette ───────────────────────────────────────── */
  var COLOR_PALETTE = [
    '#ff2e88', // magenta
    '#00f0ff', // cyan
    '#39ff7a', // lime
    '#ffe600', // amber
    '#ff7a1f', // orange
    '#b14aed', // violet
    '#ff3860', // crimson
    '#5effc1'  // mint
  ];

  /* ── Shade helper ────────────────────────────────────────── */
  function shadeOf(hex, factor) {
    var r = parseInt(hex.slice(1,3), 16);
    var g = parseInt(hex.slice(3,5), 16);
    var b = parseInt(hex.slice(5,7), 16);
    r = Math.min(255, Math.round(r * factor));
    g = Math.min(255, Math.round(g * factor));
    b = Math.min(255, Math.round(b * factor));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  /* ── Color map resolver ──────────────────────────────────── */
  function buildColorMap(mainColor) {
    return {
      'X': mainColor,
      'L': shadeOf(mainColor, 1.4),
      'S': shadeOf(mainColor, 0.6),
      'B': '#0a0420',
      'Y': '#ffe600',
      'R': '#ff3860',
      'C': '#00f0ff',
      'P': '#ff2e88',
      'G': '#39ff7a',
      '.': 'transparent'
    };
  }

  /* ── renderSprite ─────────────────────────────────────────── */
  function renderSprite(containerEl, kind, color, size) {
    if (!containerEl) return;
    size = size || 48;
    var rows = SPRITE_MAPS[kind] || SPRITE_MAPS['knight'];
    var colorMap = buildColorMap(color || '#ff2e88');
    var pixelSize = size / 8;

    containerEl.innerHTML = '';
    containerEl.style.position = 'relative';
    containerEl.style.width = size + 'px';
    containerEl.style.height = size + 'px';
    containerEl.style.imageRendering = 'pixelated';
    containerEl.style.flexShrink = '0';

    for (var row = 0; row < 8; row++) {
      var rowStr = rows[row] || '........';
      for (var col = 0; col < 8; col++) {
        var ch = rowStr[col] || '.';
        if (ch === '.') continue;
        var c = colorMap[ch] || 'transparent';
        if (c === 'transparent') continue;
        var span = document.createElement('span');
        span.style.position = 'absolute';
        span.style.left = (col * pixelSize) + 'px';
        span.style.top  = (row * pixelSize) + 'px';
        span.style.width  = pixelSize + 'px';
        span.style.height = pixelSize + 'px';
        span.style.background = c;
        span.style.imageRendering = 'pixelated';
        containerEl.appendChild(span);
      }
    }
  }

  /* ── renderAvatar (same + bob class) ────────────────────── */
  function renderAvatar(containerEl, kind, color, size) {
    renderSprite(containerEl, kind, color, size);
    containerEl.classList.add('sprite-bob');
  }

  /* ── Particle system ─────────────────────────────────────── */
  function renderParticles() {
    var existing = document.getElementById('particles');
    var canvas;
    if (existing && existing.tagName === 'CANVAS') {
      canvas = existing;
    } else {
      canvas = document.createElement('canvas');
      canvas.id = 'particles';
      canvas.style.position = 'fixed';
      canvas.style.inset = '0';
      canvas.style.zIndex = '1';
      canvas.style.pointerEvents = 'none';
      document.body.appendChild(canvas);
    }

    var ctx = canvas.getContext('2d');
    var COLORS = ['#ff2e88','#00f0ff','#b14aed','#ffe600','#39ff7a','#ff7a1f'];
    var COUNT  = 70;
    var particles = [];
    var raf;
    var running = true;

    function resize() {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    for (var i = 0; i < COUNT; i++) {
      particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        size: Math.floor(Math.random() * 3 + 1) * 2,   // 2, 4, or 6 px
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        speed: Math.random() * 0.5 + 0.2,
        drift: (Math.random() - 0.5) * 0.3,
        alpha: Math.random() * 0.5 + 0.2
      });
    }

    function frame() {
      if (!running) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (var j = 0; j < particles.length; j++) {
        var p = particles[j];
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
        p.y -= p.speed;
        p.x += p.drift;
        if (p.y + p.size < 0) {
          p.y = canvas.height + p.size;
          p.x = Math.random() * canvas.width;
        }
        if (p.x < -p.size) p.x = canvas.width + p.size;
        if (p.x > canvas.width + p.size) p.x = -p.size;
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    }
    frame();

    return function cleanup() {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }

  /* ── Expose to window ────────────────────────────────────── */
  root.AVATAR_KEYS    = AVATAR_KEYS;
  root.SPRITE_MAPS    = SPRITE_MAPS;
  root.COLOR_PALETTE  = COLOR_PALETTE;
  root.shadeOf        = shadeOf;
  root.renderSprite   = renderSprite;
  root.renderAvatar   = renderAvatar;
  root.renderParticles = renderParticles;

})(window);
