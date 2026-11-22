// ---------------------------------------------------------------------------
// Figural series and domino series for battles, in the LANRT / Mensa idiom.
//
// Studied from LANRT K (42 figural items) and LANRT D (44 domino items) by
// X. Li, the informal high-range tests that circulate on r/cognitiveTesting,
// and from the Mensa online tests they borrow their look from. The look is
// strict: thin black line figures on white, solid black fills, hatched squares
// for cells that are deliberately hidden, a lone outlined square where the
// answer goes, and six boxed options in a strip. Nothing decorative.
//
// The item types in those tests reduce to a small grammar, and that grammar
// is what this module generates fresh from a seed:
//   sectorTurn   a divided circle whose black sectors turn by a fixed step
//   sectorOp     third cell = first OP second over sector sets (or / xor / minus)
//   fillStep     a shape filling up across the row, with a marker line moving
//   quadrants    quadrant patterns transformed row by row (complement, turn)
//   polyTurn     a polyomino with a marked cell, turning and advancing
//   glyphTurn    two nested glyphs turning at their own rates
//   dotWalk      a marked point walking a lattice with wrap-around
//   frameWalk    travellers moving round a square frame, facing their motion
//   nestCycle    nested shapes cycling their order, inner fill toggling
//   mosaic       a composite picture and its tiles in order, one tile missing
//   arcCount     counted left and right arcs following two rules
//   markSets     union / difference / xor over marks on a lattice
//   linesDots    chords through a shape with one dot per region
//   binaryTiles  two-cell tiles counting in binary
//   domino       LANRT-D style domino series over several layouts
//
// Battles last two minutes for eight items, so every family is tuned a good
// deal easier than LANRT itself: one or two rules, short series, and
// distractors that break exactly one thing. The procedural seed means no two
// duels ever share a puzzle, which is the point of generating rather than
// curating here.
//
// Figures are lists of primitives in a unit square (y down):
//   {t:"line",x1,y1,x2,y2} {t:"poly",pts,f} {t:"circle",cx,cy,r,f}
//   {t:"sector",cx,cy,r,a0,a1} {t:"arc",cx,cy,r,a0,a1} {t:"dot",cx,cy,r,f}
//   {t:"hatch"} {t:"text",x,y,s}
// Angles are degrees, 0 = east, increasing clockwise (because y is down).
// ---------------------------------------------------------------------------

// ---------- deterministic rng (same construction as catGenerator) ----------
function hashSeed(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}
function rngFrom(seed) {
  let a = hashSeed(seed);
  const next = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.int = (n) => Math.floor(next() * n);
  next.pick = (list) => list[Math.floor(next() * list.length)];
  next.shuffle = (list) => {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  next.subset = (list, k) => next.shuffle(list).slice(0, k).sort((p, q) => p - q);
  return next;
}

// ---------- geometry ----------
const rad = (d) => (d * Math.PI) / 180;
const mod = (a, n) => ((a % n) + n) % n;
const r3 = (v) => Math.round(v * 1000) / 1000;

function rotPt([x, y], deg, cx = 0.5, cy = 0.5) {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  const dx = x - cx;
  const dy = y - cy;
  return [cx + dx * c - dy * s, cy + dx * s + dy * c];
}
function regular(n, r = 0.42, cx = 0.5, cy = 0.5, start = -90) {
  const pts = [];
  for (let i = 0; i < n; i += 1) {
    const a = rad(start + (360 * i) / n);
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}
function circlePts(r = 0.4, cx = 0.5, cy = 0.5, n = 48) {
  return regular(n, r, cx, cy, -90);
}
// Sutherland-Hodgman against the half-plane a*x + b*y + c >= 0.
function clipHalf(pts, a, b, c) {
  const out = [];
  const inside = ([x, y]) => a * x + b * y + c >= -1e-9;
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const pin = inside(p);
    const qin = inside(q);
    if (pin) out.push(p);
    if (pin !== qin) {
      const dp = a * p[0] + b * p[1] + c;
      const dq = a * q[0] + b * q[1] + c;
      const t = dp / (dp - dq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}
function clip(pts, planes) {
  let out = pts;
  for (const [a, b, c] of planes) out = clipHalf(out, a, b, c);
  return out;
}
const PLANE = {
  left: [-1, 0, 0.5], right: [1, 0, -0.5], top: [0, -1, 0.5], bottom: [0, 1, -0.5],
  nw: [-1, -1, 1], se: [1, 1, -1], ne: [1, -1, 0], sw: [-1, 1, 0]
};
const QUAD = { tl: ["left", "top"], tr: ["right", "top"], bl: ["left", "bottom"], br: ["right", "bottom"] };

const SHAPES = {
  circle: circlePts(0.4),
  square: [[0.12, 0.12], [0.88, 0.12], [0.88, 0.88], [0.12, 0.88]],
  triangle: [[0.5, 0.1], [0.92, 0.86], [0.08, 0.86]],
  diamond: [[0.5, 0.08], [0.92, 0.5], [0.5, 0.92], [0.08, 0.5]],
  pentagon: regular(5, 0.44),
  hexagon: regular(6, 0.44, 0.5, 0.5, 0)
};
const SHAPE_NAMES = Object.keys(SHAPES);

// ---------- primitives ----------
const line = (x1, y1, x2, y2) => ({ t: "line", x1, y1, x2, y2 });
const dot = (cx, cy, r = 0.045, f = 1) => ({ t: "dot", cx, cy, r, f });
const sector = (cx, cy, r, a0, a1) => ({ t: "sector", cx, cy, r, a0, a1 });
const poly = (pts, f = 1) => ({ t: "poly", pts, f });
const circ = (cx, cy, r, f = 0) => ({ t: "circle", cx, cy, r, f });
const HATCH = [{ t: "hatch" }];

function outline(shape, scale = 1) {
  if (shape === "circle") return circ(0.5, 0.5, 0.4 * scale, 0);
  return poly(SHAPES[shape].map(([x, y]) => [0.5 + (x - 0.5) * scale, 0.5 + (y - 0.5) * scale]), 0);
}
function filled(shape, scale = 1) {
  if (shape === "circle") return circ(0.5, 0.5, 0.4 * scale, 1);
  return poly(SHAPES[shape].map(([x, y]) => [0.5 + (x - 0.5) * scale, 0.5 + (y - 0.5) * scale]), 1);
}
function region(shape, planeNames) {
  const pts = clip(SHAPES[shape], planeNames.map((name) => PLANE[name]));
  return pts.length >= 3 ? poly(pts, 1) : null;
}
function quadrantsFig(shape, quads) {
  const fig = [outline(shape)];
  for (const q of quads) {
    const r = region(shape, QUAD[q]);
    if (r) fig.push(r);
  }
  return fig;
}

function rotFig(fig, deg, cx = 0.5, cy = 0.5) {
  return fig.map((p) => {
    if (p.t === "line") { const [x1, y1] = rotPt([p.x1, p.y1], deg, cx, cy); const [x2, y2] = rotPt([p.x2, p.y2], deg, cx, cy); return { ...p, x1, y1, x2, y2 }; }
    if (p.t === "poly") return { ...p, pts: p.pts.map((pt) => rotPt(pt, deg, cx, cy)) };
    if (p.t === "circle" || p.t === "dot") { const [x, y] = rotPt([p.cx, p.cy], deg, cx, cy); return { ...p, cx: x, cy: y }; }
    if (p.t === "sector" || p.t === "arc") { const [x, y] = rotPt([p.cx, p.cy], deg, cx, cy); return { ...p, cx: x, cy: y, a0: p.a0 + deg, a1: p.a1 + deg }; }
    return p;
  });
}
function flipFig(fig) {
  const fx = (x) => 1 - x;
  return fig.map((p) => {
    if (p.t === "line") return { ...p, x1: fx(p.x1), x2: fx(p.x2) };
    if (p.t === "poly") return { ...p, pts: p.pts.map(([x, y]) => [fx(x), y]) };
    if (p.t === "circle" || p.t === "dot") return { ...p, cx: fx(p.cx) };
    if (p.t === "sector" || p.t === "arc") return { ...p, cx: fx(p.cx), a0: 180 - p.a1, a1: 180 - p.a0 };
    return p;
  });
}
function keyOf(fig) {
  return JSON.stringify(fig, (k, v) => (typeof v === "number" ? r3(v) : v));
}

// ---------- shared pieces ----------
function sectorFig(n, set, r = 0.42) {
  const fig = [circ(0.5, 0.5, r, 0)];
  for (let i = 0; i < n; i += 1) {
    const a = -90 + (360 * i) / n;
    fig.push(line(0.5, 0.5, 0.5 + Math.cos(rad(a)) * r, 0.5 + Math.sin(rad(a)) * r));
  }
  for (const i of set) fig.push(sector(0.5, 0.5, r, -90 + (360 * i) / n, -90 + (360 * (i + 1)) / n));
  return fig;
}
const shiftSet = (set, k, n) => set.map((i) => mod(i + k, n)).sort((a, b) => a - b);
const complementSet = (set, n) => Array.from({ length: n }, (_, i) => i).filter((i) => !set.includes(i));
const setOps = {
  or: (a, b, n) => Array.from({ length: n }, (_, i) => i).filter((i) => a.includes(i) || b.includes(i)),
  and: (a, b) => a.filter((i) => b.includes(i)),
  xor: (a, b, n) => Array.from({ length: n }, (_, i) => i).filter((i) => a.includes(i) !== b.includes(i)),
  minus: (a, b) => a.filter((i) => !b.includes(i))
};
const sameSet = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// Polyomino cells drawn as a block grid that fits the cell, one marker.
function polyFig(cells, marker, markerStyle = "fill") {
  const xs = cells.map(([x]) => x); const ys = cells.map(([, y]) => y);
  const w = Math.max(...xs) + 1; const h = Math.max(...ys) + 1;
  const ext = Math.max(w, h, 3);
  const step = 0.8 / ext;
  const ox = 0.5 - (w * step) / 2; const oy = 0.5 - (h * step) / 2;
  const fig = [];
  cells.forEach(([x, y], index) => {
    const x0 = ox + x * step; const y0 = oy + y * step;
    fig.push(poly([[x0, y0], [x0 + step, y0], [x0 + step, y0 + step], [x0, y0 + step]], 0));
    if (index === marker) {
      if (markerStyle === "fill") fig.push(poly([[x0, y0], [x0 + step, y0], [x0 + step, y0 + step], [x0, y0 + step]], 1));
      else fig.push(poly([[x0, y0], [x0 + step, y0], [x0 + step, y0 + step]], 1)); // top-right half
    }
  });
  return fig;
}
function normCells(cells) {
  const mx = Math.min(...cells.map(([x]) => x)); const my = Math.min(...cells.map(([, y]) => y));
  return cells.map(([x, y]) => [x - mx, y - my]);
}
function rotCells(cells) { return normCells(cells.map(([x, y]) => [-y, x])); }
function flipCells(cells) { return normCells(cells.map(([x, y]) => [-x, y])); }
const POLYOMINOES = {
  L3: [[0, 0], [0, 1], [1, 1]],
  L4: [[0, 0], [0, 1], [0, 2], [1, 2]],
  T4: [[0, 0], [1, 0], [2, 0], [1, 1]],
  S4: [[1, 0], [2, 0], [0, 1], [1, 1]],
  J4: [[1, 0], [1, 1], [1, 2], [0, 2]],
  P5: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]]
};

// ---------- the item assembler ----------
function assemble(rng, built, family) {
  if (!built) return null;
  const seen = new Set([keyOf(built.answer)]);
  const options = [built.answer];
  const consider = (fig) => {
    if (!fig || options.length >= 6) return;
    const k = keyOf(fig);
    if (seen.has(k)) return;
    seen.add(k);
    options.push(fig);
  };
  for (const d of built.distractors) consider(d);
  if (options.length < 6) {
    for (const extra of [rotFig(built.answer, 90), rotFig(built.answer, 180), rotFig(built.answer, 270), flipFig(built.answer)]) consider(extra);
  }
  if (options.length < 6) for (const cell of built.cells) if (Array.isArray(cell)) consider(cell);
  if (options.length < 6) return null;
  const order = rng.shuffle(options.map((_, i) => i));
  const optionFigs = order.map((i) => options[i]);
  return {
    kind: "lanrt",
    domain: "lanrt",
    family,
    tag: family,
    prompt: built.prompt ?? "Which option completes the pattern?",
    lanrt: { cols: built.cols, cells: built.cells, header: built.header ?? null, optionFigs },
    options: optionFigs.map((_, i) => `Option ${i + 1}`),
    answerIndex: order.indexOf(0)
  };
}

// ---------- families ----------
const FAMILIES = {};

// A divided circle whose black sectors turn by a fixed step per column and a
// fixed step per row (LANRT K 18, 29, 40).
FAMILIES.sectorTurn = (rng, level) => {
  const n = level >= 5 ? 8 : 6;
  const k = level <= 3 ? 1 : level <= 6 ? 2 : 3;
  let set;
  if (k === 1) set = [rng.int(n)];
  else if (k === 2) { const s = rng.int(n); set = rng() < 0.5 ? [s, mod(s + 1, n)] : [s, mod(s + 2, n)]; }
  else { const s = rng.int(n); set = [s, mod(s + 1, n), mod(s + 3, n)]; }
  set = [...new Set(set)].sort((a, b) => a - b);
  const colStep = 1 + rng.int(n - 1);
  const rowStep = 1 + rng.int(n - 1);
  const at = (r, c) => shiftSet(set, r * rowStep + c * colStep, n);
  const cells = [];
  for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) cells.push(sectorFig(n, at(r, c)));
  const answerSet = at(2, 2);
  cells[8] = null;
  const distractors = [];
  for (const s of [1, -1, 2, -2, 3, -3, 4]) { const d = shiftSet(answerSet, s, n); if (!sameSet(d, answerSet)) distractors.push(sectorFig(n, d)); }
  distractors.push(sectorFig(n, complementSet(answerSet, n)));
  return { cols: 3, cells, answer: sectorFig(n, answerSet), distractors };
};

// Third cell of each row = first OP second over sector sets.
FAMILIES.sectorOp = (rng, level) => {
  const n = level >= 5 ? 8 : 6;
  const op = level < 4 ? "or" : level < 7 ? "xor" : "minus";
  const all = Array.from({ length: n }, (_, i) => i);
  const rows = [];
  for (let r = 0; r < 3; r += 1) {
    let a; let b; let c; let tries = 0;
    do {
      a = rng.subset(all, 2 + rng.int(n === 8 ? 3 : 2));
      b = rng.subset(all, 2 + rng.int(n === 8 ? 3 : 2));
      c = setOps[op](a, b, n);
      tries += 1;
    } while ((sameSet(a, b) || c.length < 1 || c.length > n - 1) && tries < 40);
    rows.push([a, b, c]);
  }
  const cells = rows.flatMap(([a, b, c]) => [sectorFig(n, a), sectorFig(n, b), sectorFig(n, c)]);
  const [a, b, answerSet] = rows[2];
  cells[8] = null;
  const alts = [setOps.or(a, b, n), setOps.and(a, b, n), setOps.xor(a, b, n), setOps.minus(a, b, n), setOps.minus(b, a, n), a, b, complementSet(answerSet, n), shiftSet(answerSet, 1, n)];
  const distractors = alts.filter((s) => s.length && !sameSet(s, answerSet)).map((s) => sectorFig(n, s));
  return { cols: 3, cells, answer: sectorFig(n, answerSet), distractors };
};

// A shape filling across the row (empty, half, full), the half side chosen per
// row; from level 4 a marker line steps above / through / below (LANRT K 1).
FAMILIES.fillStep = (rng, level) => {
  const shapes = rng.shuffle(["circle", "square", "triangle", "diamond", "pentagon"]).slice(0, 3);
  const sides = rng.shuffle(["left", "right", "top", "bottom"]).slice(0, 3);
  const withMarker = level >= 4;
  const markerFor = (r, c) => {
    if (!withMarker) return [];
    const horizontal = r % 2 === 0;
    const pos = [0.04, 0.5, 0.96][c];
    return horizontal ? [line(0.1, pos, 0.9, pos)] : [line(pos, 0.1, pos, 0.9)];
  };
  const fillFor = (shape, side, state) => {
    if (state === 0) return [outline(shape)];
    if (state === 1) return [outline(shape), region(shape, [side])].filter(Boolean);
    return [filled(shape)];
  };
  const cells = [];
  for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) cells.push([...fillFor(shapes[r], sides[r], c), ...markerFor(r, c)]);
  const answer = cells[8];
  cells[8] = null;
  const s = shapes[2];
  const distractors = [
    [...fillFor(s, sides[2], 1), ...markerFor(2, 2)],
    [...fillFor(s, sides[2], 0), ...markerFor(2, 2)],
    [...fillFor(shapes[1], sides[1], 2), ...markerFor(2, 2)],
    [...fillFor(shapes[0], sides[0], 2), ...markerFor(2, 2)],
    [...fillFor(s, sides[2], 2), ...markerFor(2, 1)],
    [...fillFor(s, sides[2], 2), ...markerFor(2, 0)],
    [...fillFor(s, sides[2], 2), ...markerFor(1, 2)],
    [...fillFor(s, sides[2], 1), ...markerFor(2, 1)]
  ];
  return { cols: 3, cells, answer, distractors };
};

// Quadrant patterns: row two is the complement of row one, row three the
// pattern turned a quarter (LANRT K 3, 11, 37).
FAMILIES.quadrants = (rng, level) => {
  const shape = rng.pick(["square", "circle", "diamond"]);
  const quads = ["tl", "tr", "br", "bl"]; // clockwise order
  const turn = (set, q) => set.map((name) => quads[mod(quads.indexOf(name) + q, 4)]).sort();
  const comp = (set) => quads.filter((q) => !set.includes(q)).sort();
  const mirror = (set) => set.map((q) => ({ tl: "tr", tr: "tl", bl: "br", br: "bl" })[q]).sort();
  const patterns = [];
  let tries = 0;
  while (patterns.length < 3 && tries < 60) {
    tries += 1;
    const size = 1 + rng.int(level >= 7 ? 3 : 2);
    const p = rng.subset([0, 1, 2, 3], size).map((i) => quads[i]).sort();
    if (patterns.some((q) => sameSet(q, p))) continue;
    patterns.push(p);
  }
  if (patterns.length < 3) return null;
  const rowRule = level < 6 ? [(p) => p, comp, (p) => turn(p, 1)] : [(p) => p, (p) => turn(p, 1), comp];
  const cells = [];
  for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) cells.push(quadrantsFig(shape, rowRule[r](patterns[c])));
  const answerSet = rowRule[2](patterns[2]);
  const answer = cells[8];
  cells[8] = null;
  const alts = [comp(answerSet), patterns[2], turn(patterns[2], 2), turn(patterns[2], 3), mirror(answerSet), rowRule[2](patterns[1]), rowRule[2](patterns[0]), comp(turn(patterns[2], 1))];
  const distractors = alts.filter((s) => s.length && s.length < 4 && !sameSet(s, answerSet)).map((s) => quadrantsFig(shape, s));
  return { cols: 3, cells, answer, distractors };
};

// A polyomino with a marked cell, turning a quarter each step; from level 4
// the marker also advances one cell; from level 7 turn and mirror alternate
// (LANRT K 19, 23).
FAMILIES.polyTurn = (rng, level) => {
  const name = rng.pick(Object.keys(POLYOMINOES));
  const style = level >= 4 ? "half" : "fill";
  let cells = normCells(POLYOMINOES[name]);
  let marker = rng.int(cells.length);
  const steps = 6;
  const seq = [];
  for (let i = 0; i < steps; i += 1) {
    seq.push({ cells, marker });
    if (level >= 7 && i % 2 === 1) {
      const flipped = flipCells(cells);
      // keep the marker on the same physical cell after the mirror
      const [mx, my] = cells[marker];
      const target = normCells(cells.map(([x, y]) => [-x, y]));
      marker = target.findIndex(([x, y]) => x === Math.max(...cells.map(([cx]) => cx)) - mx && y === my);
      cells = flipped;
      if (marker < 0) marker = 0;
    } else {
      const turned = cells.map(([x, y]) => [-y, x]);
      const [mx, my] = cells[marker];
      const normed = normCells(turned);
      const minX = Math.min(...turned.map(([x]) => x)); const minY = Math.min(...turned.map(([, y]) => y));
      marker = normed.findIndex(([x, y]) => x === -my - minX && y === mx - minY);
      cells = normed;
      if (level >= 4) marker = (marker + 1) % cells.length;
    }
  }
  const blankAt = level >= 7 ? 2 + rng.int(4) : 5;
  const figs = seq.map((s) => polyFig(s.cells, s.marker, style));
  const answer = figs[blankAt];
  const gridCells = figs.map((f, i) => (i === blankAt ? null : f));
  const a = seq[blankAt];
  const distractors = [
    polyFig(rotCells(a.cells), a.marker, style),
    polyFig(rotCells(rotCells(a.cells)), a.marker, style),
    polyFig(flipCells(a.cells), a.marker, style),
    polyFig(a.cells, (a.marker + 1) % a.cells.length, style),
    polyFig(a.cells, (a.marker + a.cells.length - 1) % a.cells.length, style),
    polyFig(rotCells(a.cells), (a.marker + 1) % a.cells.length, style)
  ];
  return { cols: 3, cells: gridCells, answer, distractors, prompt: "Which option completes the series?" };
};

// Two nested glyphs turning at their own rates (LANRT K 15, 17, 26).
FAMILIES.glyphTurn = (rng, level) => {
  const outerStep = rng.pick([90, -90, 180]);
  const innerStep = level >= 4 ? rng.pick([45, -45, 90, 135]) : 0;
  const outer0 = rng.int(4) * 90;
  const inner0 = rng.int(8) * 45;
  const outerGlyph = rng.pick(["cup", "ell", "tee"]);
  const outerFig = (deg) => {
    const base = outerGlyph === "cup"
      ? [line(0.18, 0.18, 0.18, 0.82), line(0.18, 0.82, 0.82, 0.82), line(0.82, 0.82, 0.82, 0.18)]
      : outerGlyph === "ell"
        ? [line(0.2, 0.15, 0.2, 0.85), line(0.2, 0.85, 0.85, 0.85)]
        : [line(0.15, 0.18, 0.85, 0.18), line(0.5, 0.18, 0.5, 0.85)];
    return rotFig(base, deg);
  };
  const innerFig = (deg) => (level >= 4 ? rotFig([line(0.5, 0.5, 0.5, 0.26), dot(0.5, 0.26, 0.04, 1)], deg) : []);
  const n = 6;
  const seq = [];
  for (let i = 0; i < n; i += 1) seq.push([...outerFig(outer0 + i * outerStep), ...innerFig(inner0 + i * innerStep)]);
  const blankAt = level >= 7 ? 2 + rng.int(3) : 5;
  const answer = seq[blankAt];
  const cells = seq.map((f, i) => (i === blankAt ? null : f));
  const oa = outer0 + blankAt * outerStep;
  const ia = inner0 + blankAt * innerStep;
  const distractors = [
    [...outerFig(oa + 90), ...innerFig(ia)],
    [...outerFig(oa - 90), ...innerFig(ia)],
    [...outerFig(oa + 180), ...innerFig(ia)],
    [...outerFig(oa), ...innerFig(ia + 45)],
    [...outerFig(oa), ...innerFig(ia - 45)],
    [...outerFig(oa), ...innerFig(ia + 90)],
    [...outerFig(oa + 90), ...innerFig(ia + 45)]
  ];
  return { cols: 3, cells, answer, distractors, prompt: "Which option completes the series?" };
};

// A marked point walks a lattice of hollow points with wrap-around; from
// level 7 a second, ringed point walks its own way (LANRT K 6, 41).
FAMILIES.dotWalk = (rng, level) => {
  const m = level >= 7 ? 4 : 3;
  const vec = () => {
    if (level < 4) return rng.pick([[1, 0], [0, 1], [-1, 0], [0, -1]]);
    return rng.pick([[1, 1], [1, -1], [-1, 1], [2, 1], [1, 2], [-1, 2], [2, -1]]);
  };
  const walkers = [{ x: rng.int(m), y: rng.int(m), v: vec(), style: "dot" }];
  if (level >= 7) walkers.push({ x: rng.int(m), y: rng.int(m), v: vec(), style: "ring" });
  const pos = (w, i) => [mod(w.x + w.v[0] * i, m), mod(w.y + w.v[1] * i, m)];
  const latticeFig = (marks) => {
    const fig = [];
    const step = 0.8 / (m - 1);
    for (let y = 0; y < m; y += 1) for (let x = 0; x < m; x += 1) fig.push(dot(0.1 + x * step, 0.1 + y * step, m === 3 ? 0.07 : 0.055, 0));
    for (const [x, y, style] of marks) {
      if (style === "dot") fig.push(dot(0.1 + x * step, 0.1 + y * step, m === 3 ? 0.07 : 0.055, 1));
      else fig.push(circ(0.1 + x * step, 0.1 + y * step, m === 3 ? 0.12 : 0.095, 0));
    }
    return fig;
  };
  const n = 6;
  const seq = [];
  for (let i = 0; i < n; i += 1) seq.push(walkers.map((w) => [...pos(w, i), w.style]));
  const blankAt = 5;
  const answerMarks = seq[blankAt];
  const cells = seq.map((marks, i) => (i === blankAt ? null : latticeFig(marks)));
  const w0 = walkers[0];
  const [ax, ay] = pos(w0, blankAt);
  const alt = (dx, dy, which = 0) => seq[blankAt].map((mk, i) => (i === which ? [mod(mk[0] + dx, m), mod(mk[1] + dy, m), mk[2]] : mk));
  const distractors = [
    alt(w0.v[0], w0.v[1]), alt(-w0.v[0], -w0.v[1]), alt(1, 0), alt(0, 1), alt(-1, 0), alt(0, -1), alt(1, 1),
    seq[blankAt].map((mk) => [mk[0], mk[1], mk[2] === "dot" ? "ring" : "dot"])
  ].filter((marks) => !(marks.length === 1 && marks[0][0] === ax && marks[0][1] === ay)).map(latticeFig);
  return { cols: 3, cells, answer: latticeFig(answerMarks), distractors, prompt: "Which option completes the series?" };
};

// Travellers moving round a square frame, each facing the way it moves; from
// level 4 two of them going opposite ways; from level 7 one accelerating
// (LANRT K 20).
FAMILIES.frameWalk = (rng, level) => {
  const slots = [];
  const along = [0.26, 0.5, 0.74];
  for (const x of along) slots.push({ x, y: 0.17, dir: 0 });          // top, moving east
  for (const y of along) slots.push({ x: 0.83, y, dir: 90 });         // right, moving south
  for (const x of [...along].reverse()) slots.push({ x, y: 0.83, dir: 180 }); // bottom, moving west
  for (const y of [...along].reverse()) slots.push({ x: 0.17, y, dir: 270 }); // left, moving north
  const frame = [poly([[0.06, 0.06], [0.94, 0.06], [0.94, 0.94], [0.06, 0.94]], 0)];
  const tri = (slot, reverse) => {
    const d = slot.dir + (reverse ? 180 : 0);
    const base = [[0.07, 0], [-0.05, -0.06], [-0.05, 0.06]].map(([x, y]) => rotPt([slot.x + x, slot.y + y], d, slot.x, slot.y));
    return poly(base, 1);
  };
  const travellers = [{ s: rng.int(12), speed: 1 + rng.int(2), reverse: false }];
  if (level >= 4 && level < 7) travellers.push({ s: rng.int(12), speed: 1 + rng.int(2), reverse: true });
  const posAt = (t, i) => {
    if (level >= 7) { let s = t.s; for (let k = 1; k <= i; k += 1) s += k; return mod(s, 12); }
    return mod(t.s + (t.reverse ? -1 : 1) * t.speed * i, 12);
  };
  const figAt = (i, override) => {
    const fig = [...frame];
    travellers.forEach((t, ti) => {
      const s = override && override.index === ti ? override.slot : posAt(t, i);
      const rev = override && override.index === ti && override.flip ? !t.reverse : t.reverse;
      fig.push(tri(slots[s], rev));
    });
    return fig;
  };
  const n = 6;
  const blankAt = 5;
  const cells = Array.from({ length: n }, (_, i) => (i === blankAt ? null : figAt(i)));
  const answer = figAt(blankAt);
  const a0 = posAt(travellers[0], blankAt);
  const distractors = [
    figAt(blankAt, { index: 0, slot: mod(a0 + 1, 12) }),
    figAt(blankAt, { index: 0, slot: mod(a0 - 1, 12) }),
    figAt(blankAt, { index: 0, slot: mod(a0 + 2, 12) }),
    figAt(blankAt, { index: 0, slot: a0, flip: true }),
    figAt(blankAt, { index: 0, slot: mod(a0 - 2, 12) }),
    figAt(blankAt, { index: 0, slot: mod(a0 + 3, 12) })
  ];
  if (travellers[1]) {
    const a1 = posAt(travellers[1], blankAt);
    distractors.push(figAt(blankAt, { index: 1, slot: mod(a1 + 1, 12) }), figAt(blankAt, { index: 1, slot: mod(a1 - 1, 12) }));
  }
  return { cols: 3, cells, answer, distractors, prompt: "Which option completes the series?" };
};

// Three shapes nested, their order cycling; from level 4 the innermost fill
// toggles; from level 7 the middle shape turns an eighth each step
// (LANRT K 10, 24).
FAMILIES.nestCycle = (rng, level) => {
  const trio = rng.shuffle(["circle", "square", "triangle", "diamond", "hexagon"]).slice(0, 3);
  const sizes = [1, 0.64, 0.34];
  const figOf = (order, innerFilled, midTurn) => {
    const fig = [];
    order.forEach((shape, i) => {
      let prim = i === 2 && innerFilled ? filled(shape, sizes[i]) : outline(shape, sizes[i]);
      if (i === 1 && midTurn) prim = rotFig([prim], midTurn)[0];
      fig.push(prim);
    });
    return fig;
  };
  const n = 6;
  const seq = [];
  for (let i = 0; i < n; i += 1) {
    const order = [trio[i % 3], trio[(i + 1) % 3], trio[(i + 2) % 3]];
    seq.push({ order, innerFilled: level >= 4 ? i % 2 === 1 : false, midTurn: level >= 7 ? (i * 45) % 360 : 0 });
  }
  const blankAt = level >= 4 ? 3 + rng.int(3) : 5;
  const figs = seq.map((s) => figOf(s.order, s.innerFilled, s.midTurn));
  const answer = figs[blankAt];
  const cells = figs.map((f, i) => (i === blankAt ? null : f));
  const a = seq[blankAt];
  const o = a.order;
  const distractors = [
    figOf([o[1], o[2], o[0]], a.innerFilled, a.midTurn),
    figOf([o[2], o[0], o[1]], a.innerFilled, a.midTurn),
    figOf(o, !a.innerFilled, a.midTurn),
    figOf([o[0], o[2], o[1]], a.innerFilled, a.midTurn),
    figOf([o[1], o[0], o[2]], a.innerFilled, a.midTurn),
    figOf(o, a.innerFilled, (a.midTurn + 45) % 360),
    figOf([o[1], o[2], o[0]], !a.innerFilled, a.midTurn)
  ];
  return { cols: 3, cells, answer, distractors, prompt: "Which option completes the series?" };
};

// A composite picture built from square tiles, shown whole, with its tiles
// listed in reading order and one tile missing (LANRT K 12).
FAMILIES.mosaic = (rng, level) => {
  const cols = level >= 7 ? 3 : 2;
  const rows = 2;
  const tileKinds = ["tl", "tr", "br", "bl", ...(level >= 4 ? ["full", "empty"] : [])];
  const tiles = [];
  for (let i = 0; i < cols * rows; i += 1) tiles.push(rng.pick(tileKinds));
  // the missing tile must be unlike at least one other tile, or any
  // orientation would read the same
  const tileFig = (kind, x0 = 0.08, y0 = 0.08, s = 0.84) => {
    const sq = [[x0, y0], [x0 + s, y0], [x0 + s, y0 + s], [x0, y0 + s]];
    const fig = [poly(sq, 0)];
    if (kind === "full") fig.push(poly(sq, 1));
    else if (kind !== "empty") {
      const tri = { tl: [sq[0], sq[1], sq[3]], tr: [sq[0], sq[1], sq[2]], br: [sq[1], sq[2], sq[3]], bl: [sq[0], sq[2], sq[3]] }[kind];
      fig.push(poly(tri, 1));
    }
    return fig;
  };
  const header = [];
  const w = 0.84 / Math.max(cols, rows);
  const ox = 0.5 - (cols * w) / 2; const oy = 0.5 - (rows * w) / 2;
  tiles.forEach((kind, i) => header.push(...tileFig(kind, ox + (i % cols) * w, oy + Math.floor(i / cols) * w, w)));
  const blankAt = level >= 4 ? rng.int(tiles.length) : tiles.length - 1;
  const cells = tiles.map((kind, i) => (i === blankAt ? null : tileFig(kind)));
  const answer = tileFig(tiles[blankAt]);
  const distractors = ["tl", "tr", "br", "bl", "full", "empty"].filter((k) => k !== tiles[blankAt]).map((k) => tileFig(k));
  return { cols: tiles.length, cells, header: { fig: header, scale: cols === 3 ? 2.6 : 2 }, answer, distractors, prompt: "Which tile is missing from the picture?" };
};

// Counted arcs: left arcs follow one rule, right arcs another (LANRT K 34).
FAMILIES.arcCount = (rng, level) => {
  const shifts = rng.shuffle([0, 1, 2]);
  const L = (r, c) => (level < 4 ? r + 1 : ((shifts[r] + c) % 3) + 1);
  const R = (r, c) => (level < 4 ? c + 1 : level < 7 ? 4 - L(r, c) : ((L(r, c) + c) % 3) + 1);
  const arcsFig = (l, r) => {
    const fig = [];
    for (let i = 0; i < l; i += 1) fig.push({ t: "arc", cx: 0.36 - i * 0.075, cy: 0.5, r: 0.17, a0: 110, a1: 250 });
    for (let i = 0; i < r; i += 1) fig.push({ t: "arc", cx: 0.64 + i * 0.075, cy: 0.5, r: 0.17, a0: -70, a1: 70 });
    return fig;
  };
  const cells = [];
  for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) cells.push(arcsFig(L(r, c), R(r, c)));
  const al = L(2, 2); const ar = R(2, 2);
  const answer = cells[8];
  cells[8] = null;
  const distractors = [[al + 1, ar], [al - 1, ar], [al, ar + 1], [al, ar - 1], [ar, al], [al + 1, ar + 1], [al - 1, ar - 1]]
    .filter(([l, r]) => l >= 0 && r >= 0 && l <= 4 && r <= 4 && !(l === al && r === ar))
    .map(([l, r]) => arcsFig(l, r));
  return { cols: 3, cells, answer, distractors };
};

// Marks on a 3x3 lattice: third cell = first OP second (LANRT K 31).
FAMILIES.markSets = (rng, level) => {
  const op = level < 4 ? "or" : level < 7 ? "minus" : "xor";
  const all = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const markFig = (set) => {
    const fig = [];
    for (const i of set) {
      const cx = 0.2 + (i % 3) * 0.3; const cy = 0.22 + Math.floor(i / 3) * 0.3;
      fig.push(poly([[cx, cy - 0.095], [cx + 0.09, cy + 0.07], [cx - 0.09, cy + 0.07]], 1));
    }
    return fig;
  };
  const rows = [];
  for (let r = 0; r < 3; r += 1) {
    let a; let b; let c; let tries = 0;
    do {
      a = rng.subset(all, 3 + rng.int(3));
      b = rng.subset(all, 2 + rng.int(3));
      c = setOps[op](a, b, 9);
      tries += 1;
    } while ((sameSet(a, b) || c.length < 1 || c.length > 7) && tries < 40);
    rows.push([a, b, c]);
  }
  const cells = rows.flatMap(([a, b, c]) => [markFig(a), markFig(b), markFig(c)]);
  const [a, b, answerSet] = rows[2];
  cells[8] = null;
  const alts = [setOps.or(a, b, 9), setOps.and(a, b, 9), setOps.xor(a, b, 9), setOps.minus(a, b, 9), setOps.minus(b, a, 9), a, b];
  const distractors = alts.filter((s) => s.length && !sameSet(s, answerSet)).map(markFig);
  return { cols: 3, cells, answer: markFig(answerSet), distractors };
};

// Chords through a shape, one dot per region; the shape is fixed in a row,
// the chord count steps across it (LANRT K 36).
FAMILIES.linesDots = (rng, level) => {
  const shapes = rng.shuffle(["circle", "square", "pentagon", "hexagon"]).slice(0, 3);
  const figOf = (shape, chords, dots, horizontal, hollowAlternate) => {
    const fig = [outline(shape)];
    const pts = SHAPES[shape];
    const positions = chords === 0 ? [] : chords === 1 ? [0.5] : chords === 2 ? [0.38, 0.62] : [0.32, 0.5, 0.68];
    for (const p of positions) {
      // the chord is the shape clipped to a thin strip, drawn as a line between its extremes
      const strip = clip(pts, horizontal ? [[0, 1, -(p - 0.002)], [0, -1, p + 0.002]] : [[1, 0, -(p - 0.002)], [-1, 0, p + 0.002]]);
      if (strip.length < 2) continue;
      const coord = horizontal ? strip.map(([x]) => x) : strip.map(([, y]) => y);
      const lo = Math.min(...coord); const hi = Math.max(...coord);
      fig.push(horizontal ? line(lo, p, hi, p) : line(p, lo, p, hi));
    }
    const bounds = [0, ...positions, 1];
    for (let i = 0; i < dots; i += 1) {
      const lo = bounds[i] ?? 0.5; const hi = bounds[i + 1] ?? 0.5;
      const mid = (lo + hi) / 2;
      fig.push(dot(horizontal ? 0.5 : mid, horizontal ? mid : 0.5, 0.04, hollowAlternate && i % 2 === 1 ? 0 : 1));
    }
    return fig;
  };
  const cells = [];
  for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) cells.push(figOf(shapes[r], c, c + 1, level >= 4 && r % 2 === 1, level >= 7));
  const answer = cells[8];
  cells[8] = null;
  const h = level >= 4 && 2 % 2 === 1;
  const distractors = [
    figOf(shapes[2], 2, 2, h, level >= 7), figOf(shapes[2], 2, 4, h, level >= 7), figOf(shapes[2], 1, 3, h, level >= 7),
    figOf(shapes[2], 3, 3, h, level >= 7), figOf(shapes[1], 2, 3, h, level >= 7), figOf(shapes[2], 2, 3, !h, level >= 7), figOf(shapes[0], 2, 3, h, level >= 7)
  ];
  return { cols: 3, cells, answer, distractors };
};

// Two-cell tiles counting in binary, step 1 to 3 (LANRT K 35).
FAMILIES.binaryTiles = (rng, level) => {
  const step = level < 4 ? 1 : 1 + rng.int(3);
  const v0 = rng.int(16);
  const n = 6;
  const tileFig = (v) => {
    const fig = [];
    const bits = [(v >> 3) & 1, (v >> 2) & 1, (v >> 1) & 1, v & 1];
    const w = 0.26; const h = 0.3;
    [[0.22, 0], [0.52, 2]].forEach(([x0, b]) => {
      for (let half = 0; half < 2; half += 1) {
        const y0 = 0.2 + half * h;
        const sq = [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]];
        fig.push(poly(sq, 0));
        if (bits[b + half]) fig.push(poly(sq, 1));
      }
    });
    return fig;
  };
  const vals = Array.from({ length: n }, (_, i) => mod(v0 + i * step, 16));
  const blankAt = 5;
  const cells = vals.map((v, i) => (i === blankAt ? null : tileFig(v)));
  const av = vals[blankAt];
  const distractors = [mod(av + 1, 16), mod(av - 1, 16), mod(av + step, 16), mod(av - step, 16), av ^ 1, av ^ 8, av ^ 4, vals[0]].filter((v) => v !== av).map(tileFig);
  return { cols: 3, cells, answer: tileFig(av), distractors, prompt: "Which option completes the series?" };
};

export const LANRT_FAMILIES = Object.keys(FAMILIES);

// Which families suit a level. Everything is available from level 4; the
// gentler ones carry the bottom of the scale.
function familiesFor(level) {
  // glyphTurn needs its inner glyph (level 4+) to have six distinct options.
  if (level <= 3) return ["sectorTurn", "fillStep", "polyTurn", "dotWalk", "nestCycle", "mosaic", "arcCount", "binaryTiles", "markSets"];
  return LANRT_FAMILIES;
}

export function buildLanrt(seed, level, { family = null } = {}) {
  const rng = rngFrom(`lx:${seed}:${level}`);
  const pool = family ? [family] : rng.shuffle(familiesFor(level));
  for (const name of pool) {
    const builder = FAMILIES[name];
    if (!builder) continue;
    const sub = rngFrom(`lx:${seed}:${level}:${name}`);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const built = assemble(sub, builder(sub, level), name);
      if (built) return built;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Domino series (LANRT D, after D48 / D70). Pips 0-9 on each half, wrapping
// at ten. A tile is { a, b }: a is the top or left half.
// ---------------------------------------------------------------------------
const DOMINO_RULES = {
  // each half its own arithmetic step
  arith: (rng, level) => {
    const sa = rng.pick(level < 4 ? [1, -1, 2] : [1, -1, 2, -2, 3, -3]);
    const sb = rng.pick(level < 4 ? [0, 1, -1] : [0, 1, -1, 2, -2, 3]);
    const a0 = rng.int(10); const b0 = rng.int(10);
    return { tile: (i) => ({ a: mod(a0 + i * sa, 10), b: mod(b0 + i * sb, 10) }), step: [sa, sb] };
  },
  // the halves sum to a constant while the top steps
  sum: (rng) => {
    const sa = rng.pick([1, -1, 2, -2, 3]);
    const a0 = rng.int(10); const k = rng.int(10);
    return { tile: (i) => { const a = mod(a0 + i * sa, 10); return { a, b: mod(k - a, 10) }; }, step: [sa, -sa] };
  },
  // a chain: the bottom of one tile becomes the top of the next
  chain: (rng) => {
    const s = rng.pick([1, -1, 2, 3, -2]);
    const a0 = rng.int(10);
    return { tile: (i) => ({ a: mod(a0 + i * s, 10), b: mod(a0 + (i + 1) * s, 10) }), step: [s, s] };
  },
  // each tile is the previous one flipped, plus a step on the new top
  mirror: (rng) => {
    const s = rng.pick([1, -1, 2, -2]);
    const a0 = rng.int(10); const b0 = rng.int(10);
    const tiles = [{ a: a0, b: b0 }];
    for (let i = 1; i < 12; i += 1) tiles.push({ a: mod(tiles[i - 1].b + s, 10), b: tiles[i - 1].a });
    return { tile: (i) => tiles[i], step: [s, s] };
  },
  // odd and even positions follow different progressions
  interleave: (rng) => {
    const p = { a0: rng.int(10), b0: rng.int(10), sa: rng.pick([1, 2, -1]), sb: rng.pick([1, -1, 2]) };
    const q = { a0: rng.int(10), b0: rng.int(10), sa: rng.pick([-1, 2, 3]), sb: rng.pick([0, 1, -2]) };
    return { tile: (i) => { const g = i % 2 ? q : p; const j = Math.floor(i / 2); return { a: mod(g.a0 + j * g.sa, 10), b: mod(g.b0 + j * g.sb, 10) }; }, step: [p.sa, p.sb] };
  },
  // Fibonacci on each half
  fib: (rng) => {
    const seqs = [0, 1].map(() => { const s = [rng.int(10), rng.int(10)]; for (let i = 2; i < 12; i += 1) s.push(mod(s[i - 1] + s[i - 2], 10)); return s; });
    return { tile: (i) => ({ a: seqs[0][i], b: seqs[1][i] }), step: [1, 1] };
  },
  // alternating steps on the top, steady on the bottom
  altstep: (rng) => {
    const s1 = rng.pick([1, 2, 3]); const s2 = rng.pick([-1, 4, 5]);
    const sb = rng.pick([1, -1, 2]);
    const a0 = rng.int(10); const b0 = rng.int(10);
    const tops = [a0];
    for (let i = 1; i < 12; i += 1) tops.push(mod(tops[i - 1] + (i % 2 ? s1 : s2), 10));
    return { tile: (i) => ({ a: tops[i], b: mod(b0 + i * sb, 10) }), step: [s1, sb] };
  }
};

const DOMINO_LAYOUTS = {
  // six upright tiles in a line
  row: { count: 6, slots: Array.from({ length: 6 }, (_, i) => ({ x: i * 1.5, y: 0, o: "v" })), w: 8.5, h: 2 },
  // seven upright tiles
  row7: { count: 7, slots: Array.from({ length: 7 }, (_, i) => ({ x: i * 1.5, y: 0, o: "v" })), w: 10, h: 2 },
  // three rows of three flat tiles
  grid: { count: 9, slots: Array.from({ length: 9 }, (_, i) => ({ x: (i % 3) * 2.5, y: Math.floor(i / 3) * 1.5, o: "h" })), w: 7, h: 4 },
  // a cross: top, left, centre, right, bottom
  cross: { count: 5, slots: [{ x: 2.5, y: 0, o: "v" }, { x: 0, y: 2.5, o: "h" }, { x: 2.5, y: 2.5, o: "h" }, { x: 5, y: 2.5, o: "h" }, { x: 2.5, y: 4, o: "v" }], w: 7, h: 6 },
  // a column of five flat tiles
  column: { count: 5, slots: Array.from({ length: 5 }, (_, i) => ({ x: 0, y: i * 1.5, o: "h" })), w: 2, h: 7 },
  // eight tiles round a square, read clockwise from the top left
  ring: { count: 8, slots: [{ x: 0, y: 0, o: "h" }, { x: 2.5, y: 0, o: "h" }, { x: 5, y: 0, o: "v" }, { x: 5, y: 2.5, o: "v" }, { x: 2.5, y: 5, o: "h" }, { x: 0, y: 5, o: "h" }, { x: -1.5, y: 2.5, o: "v" }, { x: -1.5, y: 0, o: "v" }], w: 7.5, h: 6, ox: 1.5 }
};

function dominoKey(t) { return `${t.a}-${t.b}`; }

export function buildDomino(seed, level) {
  const rng = rngFrom(`dm:${seed}:${level}`);
  const ruleName = level < 4 ? rng.pick(["arith", "chain", "sum"]) : level < 7 ? rng.pick(["arith", "sum", "chain", "mirror", "interleave"]) : rng.pick(["mirror", "interleave", "fib", "altstep", "arith"]);
  const layoutName = level < 4 ? rng.pick(["row", "column", "cross"]) : rng.pick(["row", "row7", "grid", "cross", "column", "ring"]);
  const rule = DOMINO_RULES[ruleName](rng, level);
  const layout = DOMINO_LAYOUTS[layoutName];
  const tiles = Array.from({ length: layout.count }, (_, i) => rule.tile(i));
  // the series must not be flat, or there is nothing to find
  if (tiles.every((t) => t.a === tiles[0].a && t.b === tiles[0].b)) return null;
  const blankAt = level < 4 ? layout.count - 1 : rng.int(layout.count);
  const answer = tiles[blankAt];
  const seen = new Set([dominoKey(answer)]);
  const options = [answer];
  const consider = (t) => {
    if (!t || options.length >= 6) return;
    const k = dominoKey(t);
    if (seen.has(k)) return;
    seen.add(k);
    options.push(t);
  };
  const [sa, sb] = rule.step;
  const candidates = [
    { a: answer.b, b: answer.a },
    { a: mod(answer.a + 1, 10), b: answer.b }, { a: mod(answer.a - 1, 10), b: answer.b },
    { a: answer.a, b: mod(answer.b + 1, 10) }, { a: answer.a, b: mod(answer.b - 1, 10) },
    { a: mod(answer.a + sa, 10), b: mod(answer.b + sb, 10) }, { a: mod(answer.a - sa, 10), b: mod(answer.b - sb, 10) },
    tiles[mod(blankAt - 1, tiles.length)], tiles[mod(blankAt + 1, tiles.length)],
    { a: mod(answer.a + 2, 10), b: mod(answer.b - 1, 10) }, { a: mod(answer.a - 2, 10), b: mod(answer.b + 2, 10) }
  ];
  for (const c of candidates) consider(c);
  let guard = 0;
  while (options.length < 6 && guard < 50) { consider({ a: rng.int(10), b: rng.int(10) }); guard += 1; }
  if (options.length < 6) return null;
  const order = rng.shuffle(options.map((_, i) => i));
  const optionTiles = order.map((i) => options[i]);
  return {
    kind: "domino",
    domain: "domino",
    family: ruleName,
    tag: `domino · ${ruleName} · ${layoutName}`,
    prompt: "Which domino completes the series?",
    domino: {
      layout: layoutName,
      w: layout.w, h: layout.h, ox: layout.ox ?? 0,
      tiles: layout.slots.map((slot, i) => ({ ...slot, ...(i === blankAt ? { blank: true } : tiles[i]) })),
      optionTiles
    },
    options: optionTiles.map((_, i) => `Option ${i + 1}`),
    answerIndex: order.indexOf(0)
  };
}

export const DOMINO_RULE_NAMES = Object.keys(DOMINO_RULES);
