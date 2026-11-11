// Procedural item generator for the visual reasoning formats.
//
// Every item is built from a seed string, so an id like
//   gen-mx-k3f9a2-7-6
// (format, seed, slot, level) regenerates the identical item anywhere: on a
// retake months later, on the other side of a battle, in a saved session. The
// hand-written bank in catItemBank.js stays as the calibrated core; this file
// makes it close to impossible to meet the same puzzle twice.
//
// Formats
//   mx   3x3 matrices. Each item stacks one to four independent rules over
//        separate attributes (shape, count, fill, rotation, size, position,
//        dot sets). Distractors are the answer with exactly one attribute
//        wrong, so they cannot be eliminated by looking "different".
//   rot  mental rotation over a random chiral polyomino.
//   fw   figure weights with hidden integer values, verified to have exactly
//        one balancing option.

// ---------------------------------------------------------------------------
// Deterministic RNG
// ---------------------------------------------------------------------------
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
  return next;
}

function g(s, { x = 0.5, y = 0.5, sz = 0.55, r = 0, f = 1 } = {}) {
  return { s, x, y, sz, r, f };
}

function cellKey(cell) {
  if (!cell) return "none";
  return cell
    .map((glyph) => `${glyph.s}:${glyph.x.toFixed(2)},${glyph.y.toFixed(2)},${glyph.sz.toFixed(2)},${Math.round(glyph.r) % 360},${glyph.f}`)
    .sort()
    .join("|");
}

// ---------------------------------------------------------------------------
// Matrices
// ---------------------------------------------------------------------------
const SHAPES = ["circle", "square", "triangle", "diamond", "cross", "pentagon", "hexagon", "star"];
// Shapes whose rotation is visible at the steps used below.
const ROTATABLE = ["triangle", "bar", "arrow", "ell", "tee", "pentagon"];
const SIZES = [0.28, 0.46, 0.66];
const CORNERS = { tl: { x: 0.24, y: 0.24 }, tr: { x: 0.76, y: 0.24 }, bl: { x: 0.24, y: 0.76 }, br: { x: 0.76, y: 0.76 } };
const CORNER_KEYS = Object.keys(CORNERS);

// A rule maps (row, col) -> value, over a 3-cycle of candidate values.
// "latin" gives each row every value once (the order differs per row),
// "rowConst" keeps a value per row, "colConst" per column, "diag" ties the
// value to (row + col) mod 3, "progress" walks the values along the row.
function makeRule(rng, values, allowed = ["latin", "rowConst", "colConst", "diag", "progress"]) {
  const type = rng.pick(allowed);
  const order = rng.shuffle([0, 1, 2]);
  const rowShift = rng.shuffle([0, 1, 2]);
  const at = (row, col) => {
    if (type === "rowConst") return values[order[row]];
    if (type === "colConst") return values[order[col]];
    if (type === "diag") return values[order[(row + col) % 3]];
    if (type === "progress") return values[order[(rowShift[row] + col) % 3]];
    return values[order[(rowShift[row] + col) % 3]]; // latin
  };
  return { type, at, values, order };
}

const MATRIX_ATTRIBUTES = ["shape", "count", "fill", "rotation", "size", "position"];

// Level 1..9 decides how many rules stack and which attribute families are
// allowed; harder levels pull in the operations people find least obvious.
function matrixPlan(level, rng) {
  const ruleCount = level <= 2 ? 1 : level <= 5 ? 2 : level <= 7 ? 3 : 4;
  const hardFamilies = level >= 6 ? ["dots"] : [];
  const families = rng.shuffle([...MATRIX_ATTRIBUTES, ...hardFamilies]).slice(0, ruleCount);
  // Position and dots both compete for the outer corners; keep one.
  if (families.includes("position") && families.includes("dots")) families.splice(families.indexOf("position"), 1);
  // Several glyphs fill the cell width, which hides position and flattens size.
  if (families.includes("count") && families.includes("position")) families.splice(families.indexOf("position"), 1);
  if (families.includes("count") && families.includes("size")) families.splice(families.indexOf("size"), 1);
  // A one-rule item that only varies count/fill of a fixed shape still needs a shape.
  return { ruleCount: families.length, families, useOps: level >= 6 };
}

function buildMatrix(seed, level) {
  const rng = rngFrom(`mx:${seed}:${level}`);
  const plan = matrixPlan(level, rng);
  const rules = {};
  const hasRotation = plan.families.includes("rotation");
  const shapePool = hasRotation ? ROTATABLE : SHAPES;

  // Fixed attributes (constant across the grid) when a family isn't in play.
  const fixed = {
    shape: rng.pick(shapePool),
    count: 1,
    fill: 1,
    rotation: 0,
    size: 0.5,
    position: null
  };

  for (const family of plan.families) {
    if (family === "shape") rules.shape = makeRule(rng, rng.shuffle(shapePool).slice(0, 3));
    if (family === "count") rules.count = makeRule(rng, rng.pick([[1, 2, 3], [2, 3, 4], [1, 3, 5]]), level >= 4 ? ["latin", "diag", "progress"] : ["progress", "rowConst", "latin"]);
    if (family === "fill") rules.fill = makeRule(rng, [1, 0, 2]);
    if (family === "rotation") {
      const step = rng.pick([30, 45, 60, 90]);
      rules.rotation = makeRule(rng, [0, step, step * 2], ["progress", "latin", "diag"]);
    }
    if (family === "size") rules.size = makeRule(rng, SIZES, ["progress", "latin", "rowConst", "colConst"]);
    if (family === "position") {
      const positions = rng.shuffle([
        { x: 0.3, y: 0.3 }, { x: 0.7, y: 0.3 }, { x: 0.3, y: 0.7 }, { x: 0.7, y: 0.7 }, { x: 0.5, y: 0.5 }
      ]).slice(0, 3);
      rules.position = makeRule(rng, positions, ["latin", "diag", "colConst"]);
    }
    if (family === "dots") {
      // Row operation over corner-dot sets: third column = op(first, second).
      const op = rng.pick(["xor", "and", "or", "minus"]);
      const sets = [];
      for (let row = 0; row < 3; row += 1) {
        let a; let b; let out;
        for (let tries = 0; tries < 20; tries += 1) {
          a = CORNER_KEYS.filter(() => rng() < 0.6);
          b = CORNER_KEYS.filter(() => rng() < 0.6);
          out = dotOp(op, a, b);
          // Each row should have a non-trivial result and distinct operands.
          if (a.length && b.length && a.join() !== b.join() && out.length >= 1 && out.length <= 3) break;
        }
        sets.push([a, b, out]);
      }
      rules.dots = { type: op, at: (row, col) => sets[row][col] };
    }
  }

  const cellAt = (row, col) => {
    const shape = rules.shape ? rules.shape.at(row, col) : fixed.shape;
    const count = rules.count ? rules.count.at(row, col) : fixed.count;
    const fill = rules.fill ? rules.fill.at(row, col) : fixed.fill;
    const rotation = rules.rotation ? rules.rotation.at(row, col) : fixed.rotation;
    const size = rules.size ? rules.size.at(row, col) : fixed.size;
    const position = rules.position ? rules.position.at(row, col) : fixed.position;
    const dots = rules.dots ? rules.dots.at(row, col) : null;
    return composeCell({ shape, count, fill, rotation, size, position, dots, hasDots: Boolean(rules.dots) });
  };

  const cells = [];
  for (let row = 0; row < 3; row += 1) for (let col = 0; col < 3; col += 1) cells.push(cellAt(row, col));
  const answer = cells[8];
  cells[8] = null;

  // Distractors: the answer with exactly one attribute swapped to another
  // value that rule could have produced (or a near value for fixed ones).
  const answerAttrs = {
    shape: rules.shape ? rules.shape.at(2, 2) : fixed.shape,
    count: rules.count ? rules.count.at(2, 2) : fixed.count,
    fill: rules.fill ? rules.fill.at(2, 2) : fixed.fill,
    rotation: rules.rotation ? rules.rotation.at(2, 2) : fixed.rotation,
    size: rules.size ? rules.size.at(2, 2) : fixed.size,
    position: rules.position ? rules.position.at(2, 2) : fixed.position,
    dots: rules.dots ? rules.dots.at(2, 2) : null,
    hasDots: Boolean(rules.dots)
  };
  const variants = [];
  const push = (attrs) => variants.push(composeCell(attrs));
  if (rules.shape) for (const v of rules.shape.values) if (v !== answerAttrs.shape) push({ ...answerAttrs, shape: v });
  if (rules.count) for (const v of rules.count.values) if (v !== answerAttrs.count) push({ ...answerAttrs, count: v });
  if (rules.fill) for (const v of rules.fill.values) if (v !== answerAttrs.fill) push({ ...answerAttrs, fill: v });
  if (rules.rotation) for (const v of rules.rotation.values) if (v !== answerAttrs.rotation) push({ ...answerAttrs, rotation: v });
  if (rules.size) for (const v of rules.size.values) if (v !== answerAttrs.size) push({ ...answerAttrs, size: v });
  if (rules.position) for (const v of rules.position.values) if (v !== answerAttrs.position) push({ ...answerAttrs, position: v });
  if (rules.dots) {
    const a = rules.dots.at(2, 0); const b = rules.dots.at(2, 1);
    for (const alt of [dotOp("xor", a, b), dotOp("and", a, b), dotOp("or", a, b), dotOp("minus", a, b), a, b]) {
      if (alt.join() !== answerAttrs.dots.join()) push({ ...answerAttrs, dots: alt });
    }
  }
  // Spares that break the whole frame, for when the rules yield few variants.
  push({ ...answerAttrs, count: answerAttrs.count + 1 });
  push({ ...answerAttrs, fill: answerAttrs.fill === 1 ? 0 : 1 });
  push({ ...answerAttrs, shape: SHAPES.find((s) => s !== answerAttrs.shape) });
  push({ ...answerAttrs, size: answerAttrs.size > 0.4 ? 0.3 : 0.66 });

  const seen = new Set([cellKey(answer)]);
  const options = [answer];
  for (const cell of rng.shuffle(variants)) {
    const key = cellKey(cell);
    if (seen.has(key)) continue;
    seen.add(key);
    options.push(cell);
    if (options.length === 5) break;
  }
  // Shuffle so the answer is not at index 0 by construction.
  const order = rng.shuffle(options.map((_, i) => i));
  const optionCells = order.map((i) => options[i]);
  const answerIndex = order.indexOf(0);

  return {
    kind: "matrix",
    domain: "fluid",
    prompt: "Which option completes the pattern?",
    matrix: { cells, optionCells },
    options: optionCells.map((_, index) => `Option ${index + 1}`),
    answerIndex,
    rules: Object.keys(rules)
  };
}

function dotOp(op, a, b) {
  if (op === "and") return CORNER_KEYS.filter((k) => a.includes(k) && b.includes(k));
  if (op === "or") return CORNER_KEYS.filter((k) => a.includes(k) || b.includes(k));
  if (op === "minus") return CORNER_KEYS.filter((k) => a.includes(k) && !b.includes(k));
  return CORNER_KEYS.filter((k) => a.includes(k) !== b.includes(k)); // xor
}

function composeCell({ shape, count, fill, rotation, size, position, dots, hasDots }) {
  const glyphs = [];
  if (hasDots) {
    // Dot items draw the operands/results as corner dots plus a small centre
    // glyph that carries the other attributes.
    for (const key of dots ?? []) glyphs.push(g("circle", { ...CORNERS[key], sz: 0.16 }));
    glyphs.push(g(shape, { sz: Math.min(size, 0.34), r: rotation, f: fill === 2 ? 0 : fill }));
    if (fill === 2) glyphs.push(g("circle", { sz: 0.08 }));
    return glyphs;
  }
  const cx = position?.x ?? 0.5;
  const cy = position?.y ?? 0.5;
  // Several glyphs stay countable: each gets a clear gap of a third of its width.
  const sz = count > 1 ? Math.min(size, 0.72 / count) : size;
  const spacing = count > 1 ? sz * 1.3 : 0;
  for (let i = 0; i < count; i += 1) {
    const x = count === 1 ? cx : 0.5 + (i - (count - 1) / 2) * spacing;
    const y = count === 1 ? cy : cy;
    glyphs.push(g(shape, { x, y, sz, r: rotation, f: fill === 2 ? 0 : fill }));
    if (fill === 2) glyphs.push(g("circle", { x, y, sz: sz * 0.22 }));
  }
  return glyphs;
}

// ---------------------------------------------------------------------------
// Mental rotation over random chiral polyominoes
// ---------------------------------------------------------------------------
function normalizeCells(cells) {
  const minX = Math.min(...cells.map(([x]) => x));
  const minY = Math.min(...cells.map(([, y]) => y));
  return cells.map(([x, y]) => [x - minX, y - minY]).sort((a, b) => (a[1] - b[1]) || (a[0] - b[0]));
}
function rotateCells(cells, turns) {
  let out = cells.map(([x, y]) => [x, y]);
  for (let t = 0; t < ((turns % 4) + 4) % 4; t += 1) out = out.map(([x, y]) => [-y, x]);
  return normalizeCells(out);
}
function mirrorCells(cells) { return normalizeCells(cells.map(([x, y]) => [-x, y])); }
function sig(cells) { return normalizeCells(cells).map(([x, y]) => `${x},${y}`).join(" "); }
function rotationClass(cells) { return [0, 1, 2, 3].map((t) => sig(rotateCells(cells, t))).sort().join("|"); }

function randomPolyomino(rng, size) {
  const cells = [[0, 0]];
  const has = (x, y) => cells.some(([cx, cy]) => cx === x && cy === y);
  let guard = 0;
  while (cells.length < size && guard < 200) {
    guard += 1;
    const [bx, by] = rng.pick(cells);
    const [dx, dy] = rng.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
    if (!has(bx + dx, by + dy)) cells.push([bx + dx, by + dy]);
  }
  return normalizeCells(cells);
}

function figureGlyphs(cells) {
  const width = Math.max(...cells.map(([x]) => x)) + 1;
  const height = Math.max(...cells.map(([, y]) => y)) + 1;
  const extent = Math.max(width, height);
  const step = 0.82 / extent;
  const offsetX = 0.5 - (width * step) / 2;
  const offsetY = 0.5 - (height * step) / 2;
  return cells.map(([x, y]) => g("square", { x: offsetX + step * (x + 0.5), y: offsetY + step * (y + 0.5), sz: step * 0.92, f: 1 }));
}

function buildRotation(seed, level) {
  const rng = rngFrom(`rot:${seed}:${level}`);
  const size = level <= 3 ? 4 : level <= 6 ? 5 : 6;
  let target = null;
  let distractors = [];
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const candidate = randomPolyomino(rng, size);
    const cls = rotationClass(candidate);
    const mirrored = mirrorCells(candidate);
    if (rotationClass(mirrored) === cls) continue; // achiral
    const seen = new Set();
    distractors = [];
    for (const t of [0, 1, 2, 3]) {
      const d = rotateCells(mirrored, t);
      const s = sig(d);
      if (seen.has(s)) continue;
      seen.add(s);
      distractors.push(d);
    }
    if (distractors.length >= 3) { target = candidate; break; }
  }
  if (!target) return null;
  const turn = 1 + rng.int(3);
  const answer = rotateCells(target, turn);
  const sets = [answer, ...rng.shuffle(distractors).slice(0, 3)];
  const order = rng.shuffle(sets.map((_, i) => i));
  const optionSets = order.map((i) => sets[i]);
  return {
    kind: "mental-rotation",
    domain: "spatial",
    prompt: "Which option is the figure above, rotated?",
    figure: { target: figureGlyphs(target), optionCells: optionSets.map(figureGlyphs) },
    options: optionSets.map((_, index) => `Option ${index + 1}`),
    answerIndex: order.indexOf(0)
  };
}

// ---------------------------------------------------------------------------
// Figure weights
// ---------------------------------------------------------------------------
const WEIGHT_SHAPES = { unit: "circle", mid: "square", big: "triangle" };

function pan(counts) {
  const glyphs = [];
  const total = (counts.unit ?? 0) + (counts.mid ?? 0) + (counts.big ?? 0);
  const spacing = 0.9 / Math.max(total, 1);
  const size = Math.min(0.3, spacing * 0.62);
  let placed = 0;
  const place = (shape, n) => {
    for (let i = 0; i < n; i += 1) {
      const x = total === 1 ? 0.5 : 0.5 + (placed - (total - 1) / 2) * spacing;
      glyphs.push(g(shape, { x, sz: size }));
      placed += 1;
    }
  };
  place(WEIGHT_SHAPES.big, counts.big ?? 0);
  place(WEIGHT_SHAPES.mid, counts.mid ?? 0);
  place(WEIGHT_SHAPES.unit, counts.unit ?? 0);
  return glyphs;
}
function panWeight(c, midValue, bigValue) { return (c.unit ?? 0) + (c.mid ?? 0) * midValue + (c.big ?? 0) * bigValue; }

function buildWeights(seed, level) {
  const rng = rngFrom(`fw:${seed}:${level}`);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const midValue = rng.pick(level <= 3 ? [2, 3] : [2, 3, 4]);
    const bigMultiple = rng.pick(level <= 4 ? [2] : [2, 3]);
    const bigValue = midValue * bigMultiple;
    const question = level <= 3
      ? { big: 1, unit: rng.int(3) }
      : { big: 1, mid: rng.int(level >= 7 ? 3 : 2), unit: 1 + rng.int(2) };
    const target = panWeight(question, midValue, bigValue);
    const mids = Math.min(4, Math.floor(target / midValue));
    const units = target - mids * midValue;
    if (units > 4 || mids + units < 1 || mids + units > 5) continue;
    const answer = { mid: mids, unit: units };
    const candidates = [
      { mid: mids, unit: units + 1 }, { mid: mids, unit: Math.max(0, units - 1) },
      { mid: mids + 1, unit: units }, { mid: Math.max(0, mids - 1), unit: units + 1 },
      { mid: mids + 1, unit: Math.max(0, units - 1) }, { mid: Math.max(0, mids - 1), unit: units + 2 }
    ];
    const seen = new Set([`${answer.mid}:${answer.unit}`]);
    const kept = [answer];
    for (const c of rng.shuffle(candidates)) {
      const key = `${c.mid}:${c.unit}`;
      if (seen.has(key)) continue;
      const n = c.mid + c.unit;
      if (n < 1 || n > 5) continue;
      if (panWeight(c, midValue, bigValue) === target) continue;
      seen.add(key);
      kept.push(c);
      if (kept.length === 4) break;
    }
    if (kept.length < 4) continue;
    const order = rng.shuffle([0, 1, 2, 3]);
    const options = order.map((i) => kept[i]);
    return {
      kind: "figure-weights",
      domain: "weights",
      prompt: "Which option balances the last scale?",
      weights: {
        scales: [
          { left: pan({ mid: 1 }), right: pan({ unit: midValue }) },
          { left: pan({ big: 1 }), right: pan({ mid: bigMultiple }) },
          { left: pan(question), right: null }
        ],
        optionCells: options.map(pan)
      },
      options: options.map((_, index) => `Option ${index + 1}`),
      answerIndex: order.indexOf(0)
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
const BUILDERS = { mx: buildMatrix, rot: buildRotation, fw: buildWeights };
const KIND_TO_FORMAT = { matrix: "mx", "mental-rotation": "rot", "figure-weights": "fw" };
const LEVEL_MIN = 1;
const LEVEL_MAX = 9;

// Level 1..9 maps onto the same b scale the bank uses (-2.5 .. +2.5).
export function levelToB(level) {
  return Math.round((-2.5 + (5 * (level - 1)) / (LEVEL_MAX - 1)) * 100) / 100;
}
export function bToLevel(b) {
  return Math.max(LEVEL_MIN, Math.min(LEVEL_MAX, Math.round(1 + ((b + 2.5) / 5) * (LEVEL_MAX - 1))));
}

const DISCRIMINATION = { mx: 1.4, rot: 1.2, fw: 1.5 };

export function generatedItemId(format, seed, slot, level) {
  return `gen-${format}-${String(seed).replace(/[^A-Za-z0-9]/g, "")}-${slot}-${level}`;
}

export function isGeneratedId(id) {
  return typeof id === "string" && id.startsWith("gen-");
}

const cache = new Map();

// Rebuilds the item an id describes. Returns null for ids this module does not
// understand so callers can fall back to the hand-written bank.
export function resolveGeneratedItem(id) {
  if (!isGeneratedId(id)) return null;
  if (cache.has(id)) return cache.get(id);
  const m = /^gen-(mx|rot|fw)-([A-Za-z0-9]+)-(\d+)-(\d)$/.exec(id);
  if (!m) return null;
  const [, format, seed, slot, levelText] = m;
  const level = Number(levelText);
  const built = BUILDERS[format](`${seed}-${slot}`, level);
  if (!built) return null;
  const item = { ...built, id, a: DISCRIMINATION[format], b: levelToB(level), generated: true, provisional: true };
  cache.set(id, item);
  return item;
}

// A fresh set of candidate items for a kind, spread around a target ability.
// Used by the adaptive test alongside the bank, so selection still runs on
// information at theta but the pool is new every sitting.
export function generateCandidates(kind, { seed, slot, theta = 0, count = 8 }) {
  const format = KIND_TO_FORMAT[kind];
  if (!format) return [];
  const centre = bToLevel(theta);
  const items = [];
  for (let i = 0; i < count; i += 1) {
    const level = Math.max(LEVEL_MIN, Math.min(LEVEL_MAX, centre + ((i % 5) - 2)));
    const item = resolveGeneratedItem(generatedItemId(format, seed, `${slot}${i}`, level));
    if (item) items.push(item);
  }
  return items;
}

export const GENERATED_FORMATS = { ...KIND_TO_FORMAT };
