// ---------------------------------------------------------------------------
// Curated matrix reasoning items for the IQ test.
//
// Every item here is authored by hand: its rules, the values those rules take,
// its distractors and its place on the difficulty ladder are decisions, not
// draws. The procedural generator (catGenerator.js) stays for battles, where
// a puzzle must never come round twice; a measurement wants the opposite — a
// fixed, graded set whose every item has been looked at.
//
// Difficulty follows the analysis of Raven's matrices by Carpenter, Just and
// Shell (1990): items get harder with more rules to hold at once, with less
// salient attributes (shape and size are seen at a glance; fill, rotation and
// position are not), and with rule types in roughly this order —
//   constant in a row  <  pairwise progression  <  figure addition/subtraction
//   <  distribution of three  <  distribution of two (XOR / "appears twice").
// Distractors are built the way a strong test builds them: the correct answer
// with exactly one rule broken, a cell copied from the matrix, and the result
// of the wrong operation (union instead of XOR, and so on).
//
// `b` is the item's authored difficulty on the logit scale the CAT estimates
// ability on (0 = average adult); `a` its discrimination. Both are provisional
// until calibrated on real responses, but they are placed, not spread.
// ---------------------------------------------------------------------------

const C = "circle";
const S = "square";
const T = "triangle";
const D = "diamond";
const P = "pentagon";
const H = "hexagon";
const X = "cross";
const R = "ring";
const A = "arrow";
const L = "ell";
const TE = "tee";
const B = "bar";

function g(s, { x = 0.5, y = 0.5, sz = 0.55, r = 0, f = 1 } = {}) {
  return { s, x, y, sz, r, f };
}

const CORNER = {
  tl: { x: 0.26, y: 0.26 },
  tr: { x: 0.74, y: 0.26 },
  bl: { x: 0.26, y: 0.74 },
  br: { x: 0.74, y: 0.74 }
};
const SLOT = {
  left: { x: 0.24, y: 0.5 },
  mid: { x: 0.5, y: 0.5 },
  right: { x: 0.76, y: 0.5 }
};

// One visual grammar for the whole set, so the eye learns it once.
//   fill: 1 solid, 0 outline, 2 outline with a centre dot
//   dots: corner keys (tl/tr/bl/br) drawn as small discs
//   inner: a small solid marker drawn inside an outline outer shape
//   parts: explicit corner glyphs [{ s, at, f }] for addition-style items
//   stack: { top: n, bottom: m } — n squares above m circles (two-count items)
function cell({ shape = null, count = 1, fill = 1, rot = 0, size = 0.5, at = null, dots = null, inner = null, parts = null, stack = null } = {}) {
  const glyphs = [];
  if (stack) {
    const place = (s, n, y) => {
      const sz = 0.18;
      const spacing = 0.26;
      for (let i = 0; i < n; i += 1) glyphs.push(g(s, { x: 0.5 + (i - (n - 1) / 2) * spacing, y, sz }));
    };
    place(S, stack.top, 0.33);
    place(C, stack.bottom, 0.67);
    return glyphs;
  }
  if (parts) {
    for (const part of parts) glyphs.push(g(part.s, { ...CORNER[part.at], sz: part.sz ?? 0.3, f: part.f ?? 1 }));
    return glyphs;
  }
  if (dots) {
    for (const key of dots) glyphs.push(g(C, { ...CORNER[key], sz: 0.18 }));
    if (shape) {
      const sz = Math.min(size, 0.32);
      glyphs.push(g(shape, { sz, r: rot, f: fill === 2 ? 0 : fill }));
      if (fill === 2) glyphs.push(g(C, { sz: Math.max(0.06, sz * 0.22) }));
    }
    return glyphs;
  }
  if (inner) {
    glyphs.push(g(shape, { sz: size, r: rot, f: 0 }));
    glyphs.push(g(inner.s, { sz: inner.sz ?? 0.2, f: inner.f ?? 1 }));
    return glyphs;
  }
  const cx = at ? SLOT[at].x : 0.5;
  const cy = at ? SLOT[at].y : 0.5;
  const sz = count > 1 ? Math.min(size, 0.72 / count) : size;
  const spacing = count > 1 ? sz * 1.3 : 0;
  for (let i = 0; i < count; i += 1) {
    const x = count === 1 ? cx : 0.5 + (i - (count - 1) / 2) * spacing;
    glyphs.push(g(shape, { x, y: cy, sz, r: rot, f: fill === 2 ? 0 : fill }));
    if (fill === 2) glyphs.push(g(C, { x, y: cy, sz: Math.max(0.06, sz * 0.22) }));
  }
  return glyphs;
}

// Rule helpers over (row, col). A Latin rule with distinct row shifts puts
// every value once in every row and once in every column.
const rowConst = (values) => (r) => values[r];
const colConst = (values) => (_, c) => values[c];
const latin = (values, shifts = [0, 1, 2]) => (r, c) => values[(shifts[r] + c) % 3];

const curated = [];

// An item built from attribute rules: cell (r, c) = cell(rules(r, c)).
function ruleItem({ id, b, a, tag, note, rules, distractors }) {
  const cells = [];
  for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) cells.push(cell(rules(r, c)));
  const answer = cells[8];
  cells[8] = null;
  push({ id, b, a, tag, note, cells, answer, distractors: distractors.map((attrs) => cell(attrs)) });
}

// An item whose rows are written out cell by cell (operations over rows).
function rowItem({ id, b, a, tag, note, rows, answer, distractors }) {
  const cells = rows.flat().map((attrs) => (attrs ? cell(attrs) : null));
  cells[8] = null;
  push({ id, b, a, tag, note, cells, answer: cell(answer), distractors: distractors.map((attrs) => cell(attrs)) });
}

function glyphKey(cellGlyphs) {
  return (cellGlyphs ?? []).map((gl) => `${gl.s}:${gl.x.toFixed(2)},${gl.y.toFixed(2)},${gl.sz.toFixed(2)},${gl.r},${gl.f}`).sort().join("|");
}

function push({ id, b, a, tag, note, cells, answer, distractors }) {
  const seen = new Set([glyphKey(answer)]);
  for (const distractor of distractors) {
    const key = glyphKey(distractor);
    if (seen.has(key)) throw new Error(`curated matrix ${id}: a distractor repeats another option`);
    seen.add(key);
  }
  if (distractors.length !== 4) throw new Error(`curated matrix ${id}: needs exactly four distractors`);
  const optionCells = [answer, ...distractors];
  curated.push({
    id,
    kind: "matrix",
    domain: "fluid",
    curated: true,
    tag,
    note,
    a,
    b,
    dRank: b,
    prompt: "Which option completes the pattern?",
    matrix: { cells, optionCells },
    options: optionCells.map((_, index) => `Option ${index + 1}`),
    answerIndex: 0
  });
}

// ---------------------------------------------------------------------------
// Tier 1 — one rule on a salient attribute. Anyone who understands the task
// format should get these; they anchor the bottom of the scale.
// ---------------------------------------------------------------------------

ruleItem({
  id: "mx-c01", b: -2.6, a: 1.2, tag: "constant shape per row",
  note: "Each row repeats one shape. The answer is a copy of its neighbours.",
  rules: (r) => ({ shape: rowConst([C, S, T])(r) }),
  distractors: [{ shape: C }, { shape: S }, { shape: T, fill: 0 }, { shape: D }]
});

ruleItem({
  id: "mx-c02", b: -2.3, a: 1.3, tag: "count 1-2-3 across the row",
  note: "Shape is constant in a row; the number of copies climbs by one per column.",
  rules: (r, c) => ({ shape: rowConst([D, C, S])(r), count: c + 1, size: 0.2 }),
  distractors: [{ shape: S, count: 2, size: 0.2 }, { shape: S, count: 4, size: 0.2 }, { shape: C, count: 3, size: 0.2 }, { shape: D, count: 3, size: 0.2 }]
});

ruleItem({
  id: "mx-c03", b: -2.0, a: 1.2, tag: "size grows across the row",
  note: "One shape throughout; size steps up left to right in every row.",
  rules: (_, c) => ({ shape: C, size: [0.28, 0.46, 0.66][c] }),
  distractors: [{ shape: C, size: 0.28 }, { shape: C, size: 0.46 }, { shape: C, size: 0.66, fill: 0 }, { shape: S, size: 0.66 }]
});

ruleItem({
  id: "mx-c04", b: -1.8, a: 1.4, tag: "distribution of three shapes",
  note: "Every row and column holds circle, square and triangle once each.",
  rules: (r, c) => ({ shape: latin([C, S, T])(r, c) }),
  distractors: [{ shape: T }, { shape: C }, { shape: S, fill: 0 }, { shape: D }]
});

ruleItem({
  id: "mx-c05", b: -1.6, a: 1.3, tag: "shape by row, fill by column",
  note: "Two constants at once: the row fixes the shape, the column fixes solid / outline / dotted.",
  rules: (r, c) => ({ shape: rowConst([C, S, T])(r), fill: colConst([1, 0, 2])(r, c) }),
  distractors: [{ shape: T, fill: 1 }, { shape: T, fill: 0 }, { shape: S, fill: 2 }, { shape: C, fill: 2 }]
});

// ---------------------------------------------------------------------------
// Tier 2 — one rule on a less salient attribute, or two easy rules together.
// ---------------------------------------------------------------------------

ruleItem({
  id: "mx-c06", b: -1.4, a: 1.3, tag: "rotation progresses, rows offset",
  note: "The arrow turns a quarter per column; each row starts 30° further round.",
  rules: (r, c) => ({ shape: A, size: 0.6, rot: 30 * r + 90 * c }),
  distractors: [{ shape: A, size: 0.6, rot: 150 }, { shape: A, size: 0.6, rot: 330 }, { shape: A, size: 0.6, rot: 60 }, { shape: A, size: 0.6, rot: 240, fill: 0 }]
});

ruleItem({
  id: "mx-c07", b: -1.2, a: 1.3, tag: "distribution of three counts",
  note: "Counts 1, 2, 3 are distributed, not progressed — the last row runs 3, 1, 2.",
  rules: (r, c) => ({ shape: S, count: latin([1, 2, 3])(r, c), size: 0.2 }),
  distractors: [{ shape: S, count: 1, size: 0.2 }, { shape: S, count: 3, size: 0.2 }, { shape: S, count: 4, size: 0.2 }, { shape: C, count: 2, size: 0.2 }]
});

ruleItem({
  id: "mx-c08", b: -1.0, a: 1.4, tag: "shape distributed, size progresses",
  note: "Two rules on the two most visible attributes.",
  rules: (r, c) => ({ shape: latin([C, S, T], [0, 2, 1])(r, c), size: [0.28, 0.46, 0.66][c] }),
  distractors: [{ shape: C, size: 0.46 }, { shape: S, size: 0.66 }, { shape: T, size: 0.66 }, { shape: C, size: 0.66, fill: 0 }]
});

rowItem({
  id: "mx-c09", b: -0.8, a: 1.5, tag: "figure addition",
  note: "The third cell is the first two laid on top of each other.",
  rows: [
    [{ parts: [{ s: S, at: "tl" }] }, { parts: [{ s: C, at: "br" }] }, { parts: [{ s: S, at: "tl" }, { s: C, at: "br" }] }],
    [{ parts: [{ s: T, at: "tr" }] }, { parts: [{ s: D, at: "bl" }] }, { parts: [{ s: T, at: "tr" }, { s: D, at: "bl" }] }],
    [{ parts: [{ s: R, at: "tl" }] }, { parts: [{ s: X, at: "tr" }] }, null]
  ],
  answer: { parts: [{ s: R, at: "tl" }, { s: X, at: "tr" }] },
  distractors: [
    { parts: [{ s: R, at: "tl" }] },
    { parts: [{ s: X, at: "tr" }] },
    { parts: [{ s: R, at: "tl" }, { s: X, at: "br" }] },
    { parts: [{ s: R, at: "tl" }, { s: X, at: "tr" }, { s: S, at: "bl" }] }
  ]
});

ruleItem({
  id: "mx-c10", b: -0.6, a: 1.4, tag: "shape by column, fill distributed",
  note: "Fill is the Latin square here, which is harder to see than shape.",
  rules: (r, c) => ({ shape: colConst([C, S, T])(r, c), fill: latin([1, 0, 2])(r, c) }),
  distractors: [{ shape: T, fill: 1 }, { shape: T, fill: 2 }, { shape: S, fill: 0 }, { shape: C, fill: 0 }]
});

rowItem({
  id: "mx-c11", b: -0.4, a: 1.5, tag: "count subtraction",
  note: "Third cell = first count minus second. It reads like a count rule but is not a progression.",
  rows: [
    [{ shape: C, count: 3, size: 0.2 }, { shape: C, count: 1, size: 0.2 }, { shape: C, count: 2, size: 0.2 }],
    [{ shape: S, count: 4, size: 0.2 }, { shape: S, count: 1, size: 0.2 }, { shape: S, count: 3, size: 0.2 }],
    [{ shape: D, count: 4, size: 0.2 }, { shape: D, count: 3, size: 0.2 }, null]
  ],
  answer: { shape: D, count: 1, size: 0.2 },
  distractors: [{ shape: D, count: 2, size: 0.2 }, { shape: D, count: 3, size: 0.2 }, { shape: D, count: 4, size: 0.2 }, { shape: D, count: 1, fill: 0, size: 0.2 }]
});

// ---------------------------------------------------------------------------
// Tier 3 — two rules with a non-salient attribute, and the row operations.
// ---------------------------------------------------------------------------

ruleItem({
  id: "mx-c12", b: -0.2, a: 1.4, tag: "shape by row, rotation distributed",
  note: "Three orientations distributed across each row; the row fixes the figure.",
  rules: (r, c) => ({ shape: rowConst([L, TE, A])(r), size: 0.55, rot: latin([0, 90, 180])(r, c) }),
  distractors: [{ shape: A, size: 0.55, rot: 0 }, { shape: A, size: 0.55, rot: 180 }, { shape: TE, size: 0.55, rot: 90 }, { shape: A, size: 0.55, rot: 270 }]
});

ruleItem({
  id: "mx-c13", b: 0.0, a: 1.5, tag: "count progresses, fill distributed",
  note: "Count is the loud rule; the dotted / outline / solid cycle is the quiet one.",
  rules: (r, c) => ({ shape: T, count: c + 1, fill: latin([1, 0, 2], [1, 2, 0])(r, c), size: 0.2 }),
  distractors: [{ shape: T, count: 3, fill: 1, size: 0.2 }, { shape: T, count: 3, fill: 0, size: 0.2 }, { shape: T, count: 2, fill: 2, size: 0.2 }, { shape: T, count: 4, fill: 2, size: 0.2 }]
});

ruleItem({
  id: "mx-c15", b: 0.2, a: 1.4, tag: "shape and position both distributed",
  note: "A small figure sits left, centre or right; both where it sits and what it is rotate through the row.",
  rules: (r, c) => ({ shape: latin([C, S, T])(r, c), size: 0.3, at: latin(["left", "mid", "right"], [0, 2, 1])(r, c) }),
  distractors: [{ shape: S, size: 0.3, at: "mid" }, { shape: S, size: 0.3, at: "right" }, { shape: C, size: 0.3, at: "left" }, { shape: T, size: 0.3, at: "left" }]
});

rowItem({
  id: "mx-c14", b: 0.4, a: 1.6, tag: "XOR of corner dots",
  note: "The third cell keeps the dots that appear in exactly one of the first two — a distribution of two.",
  rows: [
    [{ dots: ["tl", "tr"] }, { dots: ["tr", "bl"] }, { dots: ["tl", "bl"] }],
    [{ dots: ["tl", "br"] }, { dots: ["tl", "tr", "bl"] }, { dots: ["br", "tr", "bl"] }],
    [{ dots: ["tr", "bl", "br"] }, { dots: ["bl"] }, null]
  ],
  answer: { dots: ["tr", "br"] },
  distractors: [{ dots: ["tr", "bl", "br"] }, { dots: ["bl"] }, { dots: ["tl", "tr"] }, { dots: ["tl", "br"] }]
});

rowItem({
  id: "mx-c16", b: 0.6, a: 1.6, tag: "subtraction of corner dots",
  note: "Third = first minus second. Row two separates it from XOR: the middle cell has a dot the first lacks.",
  rows: [
    [{ dots: ["tl", "tr", "bl"] }, { dots: ["tr"] }, { dots: ["tl", "bl"] }],
    [{ dots: ["tl", "tr"] }, { dots: ["tr", "bl"] }, { dots: ["tl"] }],
    [{ dots: ["tl", "bl", "br"] }, { dots: ["bl", "tr"] }, null]
  ],
  answer: { dots: ["tl", "br"] },
  distractors: [{ dots: ["tl", "br", "tr"] }, { dots: ["tl", "bl", "br", "tr"] }, { dots: ["bl"] }, { dots: ["tl", "bl", "br"] }]
});

ruleItem({
  id: "mx-c17", b: 0.8, a: 1.6, tag: "three rules: shape distributed, count progresses, fill by column",
  note: "The first item that needs three things held at once.",
  rules: (r, c) => ({ shape: latin([C, S, D])(r, c), count: c + 1, fill: colConst([1, 2, 0])(r, c), size: 0.24 }),
  distractors: [{ shape: C, count: 3, fill: 0, size: 0.24 }, { shape: S, count: 2, fill: 0, size: 0.24 }, { shape: S, count: 3, fill: 1, size: 0.24 }, { shape: D, count: 3, fill: 2, size: 0.24 }]
});

ruleItem({
  id: "mx-c18", b: 1.0, a: 1.5, tag: "shape distributed, rotation progresses, size by row",
  note: "Rotation with offset rows plus two more rules; size is the easy one to miss.",
  rules: (r, c) => ({ shape: latin([A, TE, L])(r, c), rot: 45 * r + 90 * c, size: rowConst([0.42, 0.52, 0.62])(r) }),
  distractors: [{ shape: TE, rot: 180, size: 0.62 }, { shape: A, rot: 270, size: 0.62 }, { shape: TE, rot: 270, size: 0.42 }, { shape: L, rot: 270, size: 0.62 }]
});

// ---------------------------------------------------------------------------
// Tier 4 — three rules including an operation or a distribution of two.
// ---------------------------------------------------------------------------

rowItem({
  id: "mx-c19", b: 1.2, a: 1.7, tag: "XOR dots with a distributed centre shape",
  note: "Two systems in one cell: the corners follow XOR, the centre follows a Latin square.",
  rows: [
    [{ dots: ["tl", "tr"], shape: C, size: 0.3 }, { dots: ["tl", "bl"], shape: S, size: 0.3 }, { dots: ["tr", "bl"], shape: T, size: 0.3 }],
    [{ dots: ["tr", "br"], shape: S, size: 0.3 }, { dots: ["tl", "tr", "bl"], shape: T, size: 0.3 }, { dots: ["br", "tl", "bl"], shape: C, size: 0.3 }],
    [{ dots: ["tl", "bl", "br"], shape: T, size: 0.3 }, { dots: ["bl", "br"], shape: C, size: 0.3 }, null]
  ],
  answer: { dots: ["tl"], shape: S, size: 0.3 },
  distractors: [
    { dots: ["tl"], shape: C, size: 0.3 },
    { dots: ["tl"], shape: T, size: 0.3 },
    { dots: ["tl", "bl", "br"], shape: S, size: 0.3 },
    { dots: ["bl", "br"], shape: S, size: 0.3 }
  ]
});

ruleItem({
  id: "mx-c20", b: 1.4, a: 1.6, tag: "count and fill both distributed, shape by row",
  note: "Two Latin squares over quiet attributes, with a constant to anchor on.",
  rules: (r, c) => ({ shape: rowConst([P, H, C])(r), count: latin([1, 2, 3])(r, c), fill: latin([1, 0, 2], [2, 0, 1])(r, c), size: 0.24 }),
  distractors: [{ shape: C, count: 1, fill: 1, size: 0.24 }, { shape: C, count: 3, fill: 1, size: 0.24 }, { shape: C, count: 2, fill: 0, size: 0.24 }, { shape: C, count: 2, fill: 2, size: 0.24 }]
});

rowItem({
  id: "mx-c21", b: 1.6, a: 1.7, tag: "AND of dots with a distributed marker",
  note: "Looks exactly like the XOR items; only the operation differs, so it has to be identified, not recognised.",
  rows: [
    [{ dots: ["tl", "tr", "bl"], shape: T, size: 0.26 }, { dots: ["tr", "bl", "br"], shape: D, size: 0.26 }, { dots: ["tr", "bl"], shape: X, size: 0.26 }],
    [{ dots: ["tl", "br"], shape: D, size: 0.26 }, { dots: ["tl", "tr", "br"], shape: X, size: 0.26 }, { dots: ["tl", "br"], shape: T, size: 0.26 }],
    [{ dots: ["tl", "tr", "br"], shape: X, size: 0.26 }, { dots: ["tl", "bl"], shape: T, size: 0.26 }, null]
  ],
  answer: { dots: ["tl"], shape: D, size: 0.26 },
  distractors: [
    { dots: ["tr", "br", "bl"], shape: D, size: 0.26 },
    { dots: ["tl", "tr", "br", "bl"], shape: D, size: 0.26 },
    { dots: ["tl"], shape: T, size: 0.26 },
    { dots: ["tl"], shape: X, size: 0.26 }
  ]
});

ruleItem({
  id: "mx-c22", b: 1.7, a: 1.6, tag: "outer by row, inner by column, fill on a checkerboard",
  note: "Two independent axes plus an alternation that is neither row nor column.",
  rules: (r, c) => ({ shape: rowConst([S, C, D])(r), size: 0.62, inner: { s: colConst([C, S, T])(r, c), f: (r + c) % 2 === 0 ? 1 : 0 } }),
  distractors: [
    { shape: D, size: 0.62, inner: { s: T, f: 0 } },
    { shape: D, size: 0.62, inner: { s: S, f: 1 } },
    { shape: C, size: 0.62, inner: { s: T, f: 1 } },
    { shape: D, size: 0.62, inner: { s: C, f: 1 } }
  ]
});

rowItem({
  id: "mx-c23", b: 1.8, a: 1.7, tag: "arrow turns while the dots XOR",
  note: "Progression with offset rows in the centre, distribution of two in the corners.",
  rows: [
    [{ dots: ["tl", "bl"], shape: A, size: 0.3, rot: 0 }, { dots: ["bl", "br"], shape: A, size: 0.3, rot: 90 }, { dots: ["tl", "br"], shape: A, size: 0.3, rot: 180 }],
    [{ dots: ["tr"], shape: A, size: 0.3, rot: 45 }, { dots: ["tl", "tr", "bl"], shape: A, size: 0.3, rot: 135 }, { dots: ["tl", "bl"], shape: A, size: 0.3, rot: 225 }],
    [{ dots: ["tl", "tr", "br"], shape: A, size: 0.3, rot: 90 }, { dots: ["tr", "bl"], shape: A, size: 0.3, rot: 180 }, null]
  ],
  answer: { dots: ["tl", "br", "bl"], shape: A, size: 0.3, rot: 270 },
  distractors: [
    { dots: ["tl", "br", "bl"], shape: A, size: 0.3, rot: 180 },
    { dots: ["tl", "tr", "br", "bl"], shape: A, size: 0.3, rot: 270 },
    { dots: ["tr"], shape: A, size: 0.3, rot: 270 },
    { dots: ["tl", "br", "bl"], shape: A, size: 0.3, rot: 0 }
  ]
});

rowItem({
  id: "mx-c24", b: 1.9, a: 1.8, tag: "distribution of two: each figure appears in two cells of a row",
  note: "Three figures, three cells, each figure exactly twice per row. The missing cell is whatever is still owed.",
  rows: [
    [{ parts: [{ s: S, at: "tl" }, { s: C, at: "tr" }] }, { parts: [{ s: C, at: "tr" }, { s: T, at: "bl" }] }, { parts: [{ s: S, at: "tl" }, { s: T, at: "bl" }] }],
    [{ parts: [{ s: C, at: "tr" }, { s: T, at: "bl" }] }, { parts: [{ s: S, at: "tl" }, { s: T, at: "bl" }] }, { parts: [{ s: S, at: "tl" }, { s: C, at: "tr" }] }],
    [{ parts: [{ s: S, at: "tl" }, { s: T, at: "bl" }] }, { parts: [{ s: S, at: "tl" }, { s: C, at: "tr" }] }, null]
  ],
  answer: { parts: [{ s: C, at: "tr" }, { s: T, at: "bl" }] },
  distractors: [
    { parts: [{ s: S, at: "tl" }, { s: C, at: "tr" }] },
    { parts: [{ s: S, at: "tl" }, { s: T, at: "bl" }] },
    { parts: [{ s: S, at: "tl" }, { s: C, at: "tr" }, { s: T, at: "bl" }] },
    { parts: [{ s: C, at: "tr" }] }
  ]
});

ruleItem({
  id: "mx-c25", b: 2.0, a: 1.7, tag: "shape distributed, count by column, rotation by row",
  note: "Three rules on three different axes: what, how many, which way.",
  rules: (r, c) => ({ shape: latin([B, A, TE])(r, c), count: c + 1, rot: rowConst([0, 45, 90])(r), size: 0.24 }),
  distractors: [{ shape: A, count: 3, rot: 45, size: 0.24 }, { shape: A, count: 2, rot: 90, size: 0.24 }, { shape: TE, count: 3, rot: 90, size: 0.24 }, { shape: A, count: 3, rot: 0, size: 0.24 }]
});

// ---------------------------------------------------------------------------
// Tier 5 — four rules, or operations stacked with distributions. These are
// meant to separate the top few percent.
// ---------------------------------------------------------------------------

rowItem({
  id: "mx-c26", b: 2.2, a: 1.8, tag: "dots subtract, centre shape and fill distributed",
  note: "An operation in the corners and two Latin squares in the centre.",
  rows: [
    [{ dots: ["tl", "tr", "br"], shape: C, size: 0.3, fill: 1 }, { dots: ["tr"], shape: S, size: 0.3, fill: 0 }, { dots: ["tl", "br"], shape: T, size: 0.3, fill: 2 }],
    [{ dots: ["tl", "bl"], shape: T, size: 0.3, fill: 2 }, { dots: ["bl", "br"], shape: C, size: 0.3, fill: 1 }, { dots: ["tl"], shape: S, size: 0.3, fill: 0 }],
    [{ dots: ["tr", "bl", "br"], shape: S, size: 0.3, fill: 0 }, { dots: ["tl", "br"], shape: T, size: 0.3, fill: 2 }, null]
  ],
  answer: { dots: ["tr", "bl"], shape: C, size: 0.3, fill: 1 },
  distractors: [
    { dots: ["tr", "bl", "tl"], shape: C, size: 0.3, fill: 1 },
    { dots: ["tr", "bl"], shape: S, size: 0.3, fill: 1 },
    { dots: ["tr", "bl"], shape: C, size: 0.3, fill: 0 },
    { dots: ["br"], shape: C, size: 0.3, fill: 1 }
  ]
});

ruleItem({
  id: "mx-c27", b: 2.4, a: 1.8, tag: "four rules: shape, count and fill distributed, rotation progresses",
  note: "Every attribute moves. Nothing in the cell is constant to lean on.",
  // Answer: two dotted triangles turned 60°.
  rules: (r, c) => ({ shape: latin([T, A, L], [2, 0, 1])(r, c), count: latin([1, 2, 3], [0, 1, 2])(r, c), fill: latin([1, 0, 2], [1, 2, 0])(r, c), rot: 30 * c, size: 0.24 }),
  distractors: [
    { shape: T, count: 2, fill: 2, rot: 30, size: 0.24 },
    { shape: T, count: 3, fill: 2, rot: 60, size: 0.24 },
    { shape: T, count: 2, fill: 1, rot: 60, size: 0.24 },
    { shape: A, count: 2, fill: 2, rot: 60, size: 0.24 }
  ]
});

rowItem({
  id: "mx-c28", b: 2.5, a: 1.8, tag: "distribution of two over four figures",
  note: "Four figures, each exactly twice per row, in cells of two or three. The answer is the set still owed.",
  rows: [
    [{ parts: [{ s: S, at: "tl", sz: 0.26 }, { s: C, at: "tr", sz: 0.26 }, { s: T, at: "bl", sz: 0.26 }] }, { parts: [{ s: S, at: "tl", sz: 0.26 }, { s: D, at: "br", sz: 0.26 }] }, { parts: [{ s: C, at: "tr", sz: 0.26 }, { s: T, at: "bl", sz: 0.26 }, { s: D, at: "br", sz: 0.26 }] }],
    [{ parts: [{ s: C, at: "tr", sz: 0.26 }, { s: D, at: "br", sz: 0.26 }] }, { parts: [{ s: S, at: "tl", sz: 0.26 }, { s: T, at: "bl", sz: 0.26 }, { s: D, at: "br", sz: 0.26 }] }, { parts: [{ s: S, at: "tl", sz: 0.26 }, { s: C, at: "tr", sz: 0.26 }, { s: T, at: "bl", sz: 0.26 }] }],
    [{ parts: [{ s: S, at: "tl", sz: 0.26 }, { s: T, at: "bl", sz: 0.26 }] }, { parts: [{ s: C, at: "tr", sz: 0.26 }, { s: T, at: "bl", sz: 0.26 }, { s: D, at: "br", sz: 0.26 }] }, null]
  ],
  answer: { parts: [{ s: S, at: "tl", sz: 0.26 }, { s: C, at: "tr", sz: 0.26 }, { s: D, at: "br", sz: 0.26 }] },
  distractors: [
    { parts: [{ s: S, at: "tl", sz: 0.26 }, { s: C, at: "tr", sz: 0.26 }] },
    { parts: [{ s: S, at: "tl", sz: 0.26 }, { s: C, at: "tr", sz: 0.26 }, { s: T, at: "bl", sz: 0.26 }, { s: D, at: "br", sz: 0.26 }] },
    { parts: [{ s: C, at: "tr", sz: 0.26 }, { s: D, at: "br", sz: 0.26 }] },
    { parts: [{ s: S, at: "tl", sz: 0.26 }, { s: T, at: "bl", sz: 0.26 }, { s: D, at: "br", sz: 0.26 }] }
  ]
});

rowItem({
  id: "mx-c29", b: 2.6, a: 1.9, tag: "two counts add separately",
  note: "Squares above, circles below. Third cell = first + second, kept as two separate sums.",
  rows: [
    [{ stack: { top: 1, bottom: 2 } }, { stack: { top: 1, bottom: 0 } }, { stack: { top: 2, bottom: 2 } }],
    [{ stack: { top: 2, bottom: 1 } }, { stack: { top: 0, bottom: 2 } }, { stack: { top: 2, bottom: 3 } }],
    [{ stack: { top: 1, bottom: 1 } }, { stack: { top: 2, bottom: 1 } }, null]
  ],
  answer: { stack: { top: 3, bottom: 2 } },
  distractors: [{ stack: { top: 2, bottom: 3 } }, { stack: { top: 3, bottom: 3 } }, { stack: { top: 2, bottom: 2 } }, { stack: { top: 3, bottom: 1 } }]
});

rowItem({
  id: "mx-c30", b: 2.8, a: 1.9, tag: "XOR dots, centre shape and fill distributed, rotation progresses",
  note: "Four rules across two systems. The hardest item in the set.",
  rows: [
    [{ dots: ["tl", "tr"], shape: A, size: 0.3, rot: 0, fill: 0 }, { dots: ["tr", "br"], shape: TE, size: 0.3, rot: 90, fill: 2 }, { dots: ["tl", "br"], shape: L, size: 0.3, rot: 180, fill: 1 }],
    [{ dots: ["tl", "bl", "br"], shape: TE, size: 0.3, rot: 45, fill: 1 }, { dots: ["tl", "tr"], shape: L, size: 0.3, rot: 135, fill: 0 }, { dots: ["bl", "br", "tr"], shape: A, size: 0.3, rot: 225, fill: 2 }],
    [{ dots: ["tr", "bl"], shape: L, size: 0.3, rot: 90, fill: 2 }, { dots: ["tl", "tr", "br"], shape: A, size: 0.3, rot: 180, fill: 1 }, null]
  ],
  answer: { dots: ["bl", "tl", "br"], shape: TE, size: 0.3, rot: 270, fill: 0 },
  distractors: [
    { dots: ["bl", "tl", "br"], shape: TE, size: 0.3, rot: 270, fill: 1 },
    { dots: ["bl", "tl", "br"], shape: A, size: 0.3, rot: 270, fill: 0 },
    { dots: ["bl", "tl", "br"], shape: TE, size: 0.3, rot: 180, fill: 0 },
    { dots: ["tl", "tr", "bl", "br"], shape: TE, size: 0.3, rot: 270, fill: 0 }
  ]
});

export const curatedMatrixItems = curated;
