/**
 * Scaffold hero scene.
 *
 * A 3D lattice rendered to canvas with hand-rolled projection: no WebGL, no
 * library, ~4KB. The brand is called Scaffold and sells multi-tenant
 * foundations, so the visual is a structural lattice with one highlighted
 * plane reading as the isolation boundary. Motion is motivated: the rotation
 * is what makes it legible as a structure rather than a flat grid.
 *
 * Guardrails:
 *   - transform-only work on the GPU is not available to canvas, so the
 *     render is capped: DPR <= 2, ~34 nodes, one pass per frame
 *   - pauses when scrolled out of view and when the tab is hidden
 *   - prefers-reduced-motion renders one static frame and never animates
 */
(function () {
  var canvas = document.getElementById('scaffoldScene');
  if (!canvas || !canvas.getContext) return;

  var ctx = canvas.getContext('2d');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var COLS = 4, ROWS = 4, LAYERS = 3;
  var SPACING = 1, LAYER_GAP = 1.25;
  var BOUNDARY_LAYER = 1; // the plane drawn in accent

  // ---- build the lattice -------------------------------------------------
  var nodes = [];
  for (var ly = 0; ly < LAYERS; ly++) {
    for (var z = 0; z < ROWS; z++) {
      for (var x = 0; x < COLS; x++) {
        nodes.push({
          x: (x - (COLS - 1) / 2) * SPACING,
          y: (ly - (LAYERS - 1) / 2) * LAYER_GAP,
          z: (z - (ROWS - 1) / 2) * SPACING,
          layer: ly
        });
      }
    }
  }

  // Edges hold node INDICES, not references, so the draw loop never has to
  // search the node array and can read precomputed projections directly.
  var edges = [];
  function idx(layer, gx, gz) {
    return layer * ROWS * COLS + gz * COLS + gx;
  }
  for (var l = 0; l < LAYERS; l++) {
    for (var gz = 0; gz < ROWS; gz++) {
      for (var gx = 0; gx < COLS; gx++) {
        if (gx < COLS - 1) edges.push([idx(l, gx, gz), idx(l, gx + 1, gz), l]);
        if (gz < ROWS - 1) edges.push([idx(l, gx, gz), idx(l, gx, gz + 1), l]);
        if (l < LAYERS - 1) edges.push([idx(l, gx, gz), idx(l + 1, gx, gz), -1]);
      }
    }
  }
  // Reused across frames so the render allocates nothing per frame.
  var pts = new Array(nodes.length);
  var order = edges.map(function (_, i) { return i; });
  var edgeDepth = new Array(edges.length);

  // ---- projection --------------------------------------------------------
  var yaw = -0.6, pitch = 0.42;
  var pointerX = 0, pointerY = 0, targetX = 0, targetY = 0;

  function project(p, w, h) {
    // yaw about Y, then pitch about X, then weak perspective divide
    var cy = Math.cos(yaw), sy = Math.sin(yaw);
    var x1 = p.x * cy - p.z * sy;
    var z1 = p.x * sy + p.z * cy;

    var cp = Math.cos(pitch), sp = Math.sin(pitch);
    var y1 = p.y * cp - z1 * sp;
    var z2 = p.y * sp + z1 * cp;

    var fov = 7.5;
    var scale = fov / (fov + z2);
    var unit = Math.min(w, h) * 0.19;

    return {
      x: w / 2 + x1 * unit * scale + pointerX * 16,
      y: h / 2 + y1 * unit * scale + pointerY * 12,
      s: scale,
      depth: z2
    };
  }

  // ---- render ------------------------------------------------------------
  var W = 0, H = 0;

  function resize() {
    var rect = canvas.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width; H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    if (!W || !H) return;

    // Project every node exactly once per frame.
    for (var n0 = 0; n0 < nodes.length; n0++) pts[n0] = project(nodes[n0], W, H);

    // Depth per edge, computed once, then sort indices by it: painter's
    // algorithm so nearer lines land on top.
    for (var d = 0; d < edges.length; d++) {
      edgeDepth[d] = (pts[edges[d][0]].depth + pts[edges[d][1]].depth) / 2;
    }
    order.sort(function (a, b) { return edgeDepth[b] - edgeDepth[a]; });

    for (var i = 0; i < order.length; i++) {
      var e = edges[order[i]];
      var a = pts[e[0]];
      var b = pts[e[1]];
      var fade = Math.max(0.06, Math.min(1, 1.25 - edgeDepth[order[i]] * 0.22));

      if (e[2] === BOUNDARY_LAYER) {
        ctx.strokeStyle = 'rgba(238,179,92,' + (fade * 0.85).toFixed(3) + ')';
        ctx.lineWidth = 1.15;
      } else if (e[2] === -1) {
        ctx.strokeStyle = 'rgba(163,163,173,' + (fade * 0.16).toFixed(3) + ')';
        ctx.lineWidth = 1;
      } else {
        ctx.strokeStyle = 'rgba(163,163,173,' + (fade * 0.34).toFixed(3) + ')';
        ctx.lineWidth = 1;
      }
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // nodes
    for (var n = 0; n < nodes.length; n++) {
      var p = pts[n];
      var isBoundary = nodes[n].layer === BOUNDARY_LAYER;
      var fade = Math.max(0.08, Math.min(1, 1.25 - p.depth * 0.22));
      var r = (isBoundary ? 2.4 : 1.7) * p.s;

      ctx.fillStyle = isBoundary
        ? 'rgba(238,179,92,' + fade.toFixed(3) + ')'
        : 'rgba(245,243,238,' + (fade * 0.5).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.6, r), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---- loop --------------------------------------------------------------
  var raf = null, visible = false;

  function frame() {
    yaw += 0.0022;
    pointerX += (targetX - pointerX) * 0.05;
    pointerY += (targetY - pointerY) * 0.05;
    draw();
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (raf || reduce) return;
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    if (raf) { cancelAnimationFrame(raf); raf = null; }
  }

  resize();
  draw();

  if (!reduce) {
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          visible = en.isIntersecting;
          if (visible && !document.hidden) start(); else stop();
        });
      }, { threshold: 0.05 }).observe(canvas);
    } else {
      visible = true;
      start();
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop();
      else if (visible) start();
    });

    // Pointer parallax, clamped so it reads as depth rather than a toy.
    var host = canvas.parentElement;
    host.addEventListener('pointermove', function (ev) {
      var r = host.getBoundingClientRect();
      targetX = ((ev.clientX - r.left) / r.width - 0.5) * 2;
      targetY = ((ev.clientY - r.top) / r.height - 0.5) * 2;
    });
    host.addEventListener('pointerleave', function () { targetX = 0; targetY = 0; });
  }

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { resize(); draw(); }, 120);
  });
})();

/**
 * Parallax tilt for product cards.
 *
 * Motivated as feedback: the card responds to where the pointer actually is,
 * which makes a large clickable surface feel like a control rather than a
 * picture. Transform-only, no layout reads in the loop, and it does nothing
 * on touch or under reduced motion.
 */
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia('(hover:hover) and (pointer:fine)').matches;
  if (reduce || !fine) return;

  var MAX_DEG = 4.5;   // restrained: past ~6deg it reads as a gimmick

  Array.prototype.forEach.call(document.querySelectorAll('.tilt'), function (host) {
    var inner = host.querySelector('.tilt-inner');
    if (!inner) return;
    var rect = null;

    host.addEventListener('pointerenter', function () {
      rect = host.getBoundingClientRect();   // measured once per hover, not per move
    });

    host.addEventListener('pointermove', function (ev) {
      if (!rect) rect = host.getBoundingClientRect();
      var px = (ev.clientX - rect.left) / rect.width - 0.5;
      var py = (ev.clientY - rect.top) / rect.height - 0.5;
      inner.style.transform =
        'rotateY(' + (px * MAX_DEG).toFixed(2) + 'deg) ' +
        'rotateX(' + (-py * MAX_DEG).toFixed(2) + 'deg) ' +
        'translateZ(0)';
    });

    host.addEventListener('pointerleave', function () {
      rect = null;
      inner.style.transform = '';
    });
  });
})();
