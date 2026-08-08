/* ==========================================================================
   TermGraph — a dependency-free 3D force-directed graph on a 2D canvas.

   Nodes are laid out in 3D by a small spring/repulsion simulation, rotated
   by yaw/pitch, perspective-projected, and painted back-to-front so depth
   reads correctly. No WebGL, no libraries.

   new TermGraph(canvas, { nodes, links, onSelect })
     nodes: [{ id, label, section, color }]
     links: [{ source, target }]      // ids
   ========================================================================== */

export class TermGraph {
  constructor(canvas, { nodes, links, onSelect } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.onSelect = onSelect || (() => {});

    this.nodes = nodes.map((n, i) => {
      // Fibonacci sphere gives a well-spread, deterministic starting shell.
      const phi = Math.acos(1 - (2 * (i + 0.5)) / nodes.length);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const r = 190;
      return {
        ...n,
        x: r * Math.sin(phi) * Math.cos(theta),
        y: r * Math.sin(phi) * Math.sin(theta),
        z: r * Math.cos(phi),
        vx: 0,
        vy: 0,
        vz: 0,
        sx: 0,
        sy: 0,
        scale: 1,
        depth: 0,
      };
    });

    this.index = new Map(this.nodes.map((n) => [n.id, n]));
    this.links = links
      .map((l) => ({ s: this.index.get(l.source), t: this.index.get(l.target) }))
      .filter((l) => l.s && l.t);

    // Degree drives node radius, so hub terms read as hubs.
    for (const n of this.nodes) n.degree = 0;
    for (const l of this.links) {
      l.s.degree++;
      l.t.degree++;
    }

    this.yaw = 0.5;
    this.pitch = -0.25;
    this.autoRotate = true;
    this.hovered = null;
    this.selected = null;
    this.focus = null; // id -> highlight it and its neighbours
    this.alpha = 1; // simulation temperature
    this.dpr = 1;
    this.pointer = { x: -1e4, y: -1e4 };

    this.neighbours = new Map(this.nodes.map((n) => [n.id, new Set()]));
    for (const l of this.links) {
      this.neighbours.get(l.s.id).add(l.t.id);
      this.neighbours.get(l.t.id).add(l.s.id);
    }

    this._bind();
    this.resize();
    this._loop = this._loop.bind(this);
    this._raf = requestAnimationFrame(this._loop);
  }

  /* ---------------------------------------------------------------- input */

  _bind() {
    const c = this.canvas;
    let dragging = false;
    let moved = 0;
    let last = null;

    const down = (e) => {
      dragging = true;
      moved = 0;
      last = this._pt(e);
      c.classList.add("dragging");
      c.setPointerCapture?.(e.pointerId);
    };

    const move = (e) => {
      const p = this._pt(e);
      this.pointer = p;
      if (dragging && last) {
        const dx = p.x - last.x;
        const dy = p.y - last.y;
        moved += Math.abs(dx) + Math.abs(dy);
        this.yaw += dx * 0.006;
        this.pitch = clamp(this.pitch + dy * 0.006, -1.35, 1.35);
        this.autoRotate = false;
      }
      last = p;
    };

    const up = (e) => {
      if (dragging && moved < 5) {
        const hit = this._hit(this._pt(e));
        if (hit) this.onSelect(hit.id);
      }
      dragging = false;
      last = null;
      c.classList.remove("dragging");
    };

    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", () => {
      dragging = false;
      c.classList.remove("dragging");
    });
    c.addEventListener("pointerleave", () => {
      this.pointer = { x: -1e4, y: -1e4 };
      this.hovered = null;
    });

    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(c);
  }

  _pt(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  _hit(p) {
    let best = null;
    let bestD = 18;
    for (const n of this.nodes) {
      const d = Math.hypot(n.sx - p.x, n.sy - p.y);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  }

  /* --------------------------------------------------------------- layout */

  resize() {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    this.w = r.width;
    this.h = r.height;
    this.alpha = Math.max(this.alpha, 0.35);
  }

  /** One step of a cheap O(n^2) force sim — fine at this node count. */
  _tick() {
    const nodes = this.nodes;
    const REPEL = 5200;
    const SPRING = 0.0022;
    const REST = 130;
    const CENTER = 0.0016;
    const DAMP = 0.86;

    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dz = a.z - b.z;
        let d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 1) d2 = 1;
        const d = Math.sqrt(d2);
        const f = REPEL / d2 / d;
        dx *= f;
        dy *= f;
        dz *= f;
        a.vx += dx;
        a.vy += dy;
        a.vz += dz;
        b.vx -= dx;
        b.vy -= dy;
        b.vz -= dz;
      }
    }

    for (const l of this.links) {
      const dx = l.t.x - l.s.x;
      const dy = l.t.y - l.s.y;
      const dz = l.t.z - l.s.z;
      const d = Math.hypot(dx, dy, dz) || 1;
      const f = (d - REST) * SPRING;
      const ux = (dx / d) * f;
      const uy = (dy / d) * f;
      const uz = (dz / d) * f;
      l.s.vx += ux;
      l.s.vy += uy;
      l.s.vz += uz;
      l.t.vx -= ux;
      l.t.vy -= uy;
      l.t.vz -= uz;
    }

    for (const n of nodes) {
      n.vx -= n.x * CENTER;
      n.vy -= n.y * CENTER;
      n.vz -= n.z * CENTER;
      n.vx *= DAMP;
      n.vy *= DAMP;
      n.vz *= DAMP;
      n.x += n.vx * this.alpha;
      n.y += n.vy * this.alpha;
      n.z += n.vz * this.alpha;
    }

    this.alpha *= 0.994;
    if (this.alpha < 0.02) this.alpha = 0.02;
  }

  /* --------------------------------------------------------------- render */

  _project() {
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const cx = this.w / 2;
    const cyy = this.h / 2;
    const dist = 760;

    // Auto-fit: keep the whole cloud inside the frame no matter how far the
    // simulation spreads. Smoothed so it eases rather than snapping.
    let maxR = 1;
    for (const n of this.nodes) {
      const r2 = n.x * n.x + n.y * n.y + n.z * n.z;
      if (r2 > maxR) maxR = r2;
    }
    maxR = Math.sqrt(maxR);
    this.fitR = this.fitR ? this.fitR + (maxR - this.fitR) * 0.04 : maxR;
    const fov = (0.44 * Math.min(this.w, this.h) * dist) / this.fitR;

    for (const n of this.nodes) {
      const x1 = n.x * cy - n.z * sy;
      const z1 = n.x * sy + n.z * cy;
      const y1 = n.y * cp - z1 * sp;
      const z2 = n.y * sp + z1 * cp;
      const k = fov / (dist + z2);
      n.sx = cx + x1 * k;
      n.sy = cyy + y1 * k;
      n.scale = k;
      n.depth = z2;
    }
  }

  _draw() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);

    this.hovered = this._hit(this.pointer);
    const focusId = this.hovered?.id || this.focus || this.selected;
    const near = focusId ? this.neighbours.get(focusId) : null;
    const lit = (id) => !focusId || id === focusId || near?.has(id);

    // Edges, back to front.
    const links = [...this.links].sort(
      (a, b) => (a.s.depth + a.t.depth) / 2 - (b.s.depth + b.t.depth) / 2
    );
    ctx.lineWidth = 1;
    for (const l of links) {
      const on = lit(l.s.id) && lit(l.t.id);
      const fade = clamp((l.s.scale + l.t.scale) / 2, 0.25, 1.3);
      ctx.globalAlpha = (on ? 0.4 : 0.05) * fade;
      ctx.strokeStyle = on ? l.s.color : this.dim;
      ctx.beginPath();
      ctx.moveTo(l.s.sx, l.s.sy);
      ctx.lineTo(l.t.sx, l.t.sy);
      ctx.stroke();
    }

    // Nodes, back to front.
    const nodes = [...this.nodes].sort((a, b) => b.depth - a.depth);
    for (const n of nodes) {
      const on = lit(n.id);
      const r = (3 + Math.min(n.degree, 8) * 0.55) * clamp(n.scale, 0.45, 1.5);
      ctx.globalAlpha = on ? clamp(n.scale * 0.95, 0.35, 1) : 0.12;
      ctx.fillStyle = n.color;
      ctx.beginPath();
      ctx.arc(n.sx, n.sy, r, 0, Math.PI * 2);
      ctx.fill();

      if (n.id === this.selected) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = n.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(n.sx, n.sy, r + 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 1;
      }
    }

    // Label for the hovered node only — keeps the field readable.
    const h = this.hovered;
    if (h) {
      ctx.globalAlpha = 1;
      ctx.font =
        '11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      const text = h.label.toUpperCase();
      const w = ctx.measureText(text).width;
      const px = clamp(h.sx + 12, 6, this.w - w - 14);
      const py = clamp(h.sy - 10, 18, this.h - 8);
      ctx.fillStyle = this.paper;
      ctx.globalAlpha = 0.92;
      ctx.fillRect(px - 5, py - 12, w + 10, 17);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = h.color;
      ctx.strokeRect(px - 5.5, py - 12.5, w + 11, 18);
      ctx.fillStyle = this.ink;
      ctx.fillText(text, px, py);
    }

    ctx.globalAlpha = 1;
  }

  _loop() {
    if (this.autoRotate && !this.hovered) this.yaw += 0.0016;
    this._tick();
    this._project();
    this._draw();
    this._raf = requestAnimationFrame(this._loop);
  }

  /* ------------------------------------------------------------------ api */

  setTheme({ paper, ink, dim }) {
    this.paper = paper;
    this.ink = ink;
    this.dim = dim;
  }

  setColors(map) {
    for (const n of this.nodes) if (map[n.id]) n.color = map[n.id];
  }

  select(id) {
    this.selected = id || null;
    if (id) this.autoRotate = false;
  }

  setFocus(id) {
    this.focus = id || null;
  }

  reheat(a = 0.6) {
    this.alpha = Math.max(this.alpha, a);
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    this._ro?.disconnect();
  }
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
