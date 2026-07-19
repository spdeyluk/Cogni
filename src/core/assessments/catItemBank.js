// Original item bank for the adaptive cognitive assessment.
// All content is written for Mindcare — no items are reproduced from any
// published test. Difficulty (b) and discrimination (a) parameters are
// PROVISIONAL author estimates: every item carries provisional: true and the
// bank is meant to be re-fit from real response data via
// reestimateItemParameters() in irt.js once enough sessions accumulate.
//
// Item shape:
//   { id, domain: "fluid"|"verbal"|"quant", kind, prompt, options[],
//     answerIndex, a, b, provisional, matrix? }
// Matrix items additionally carry { matrix: { cells: [9 cell specs, last
// null], optionCells: [...] } } where a cell spec is an array of glyphs
// { s: shape, x, y, sz, r, f } rendered by the UI's SVG renderer.

export const CAT_DOMAIN_TIME_LIMITS_MS = {
  verbal: 45000,
  quant: 60000,
  fluid: 75000
};

export const CAT_DOMAIN_LABELS = {
  fluid: "Fluid reasoning",
  verbal: "Verbal comprehension",
  quant: "Quantitative reasoning"
};

function g(s, { x = 0.5, y = 0.5, sz = 0.55, r = 0, f = 1 } = {}) {
  return { s, x, y, sz, r, f };
}

function row(shape, count, options = {}) {
  const glyphs = [];
  for (let index = 0; index < count; index += 1) {
    const x = count === 1 ? 0.5 : 0.2 + (0.6 * index) / (count - 1);
    glyphs.push(g(shape, { ...options, x, sz: options.sz ?? 0.3 }));
  }
  return glyphs;
}

// ---------------------------------------------------------------------------
// Fluid: procedural matrix items (original rules, deterministic construction)
// ---------------------------------------------------------------------------

const matrixItems = [];

function pushMatrix(kindTag, dRank, cells, optionCells, answerIndex) {
  matrixItems.push({
    kind: "matrix",
    dRank,
    prompt: "Which option completes the pattern?",
    matrix: { cells: [...cells.slice(0, 8), null], optionCells },
    options: optionCells.map((_, index) => `Option ${index + 1}`),
    answerIndex
  });
}

// Rule 1: distribution of three — each row contains each shape exactly once.
for (const shapes of [
  ["circle", "square", "triangle"],
  ["diamond", "circle", "cross"],
  ["triangle", "diamond", "square"],
  ["square", "cross", "circle"]
]) {
  const latin = [
    [shapes[0], shapes[1], shapes[2]],
    [shapes[1], shapes[2], shapes[0]],
    [shapes[2], shapes[0], shapes[1]]
  ];
  const cells = latin.flat().map((shape) => [g(shape)]);
  const answerShape = latin[2][2];
  const optionCells = [
    [g(answerShape)],
    [g(latin[2][0])],
    [g(latin[2][1])],
    [g(answerShape, { f: 0 })],
    [g("bar")]
  ];
  pushMatrix("distribution", 2, cells, optionCells, 0);
}

// Rule 2: count progression — 1, 2, 3 glyphs across each row.
for (const [shapeA, shapeB, shapeC] of [
  ["circle", "triangle", "square"],
  ["square", "diamond", "circle"],
  ["triangle", "circle", "diamond"],
  ["diamond", "square", "cross"]
]) {
  const rows = [shapeA, shapeB, shapeC];
  const cells = [];
  for (const shape of rows) {
    for (let count = 1; count <= 3; count += 1) cells.push(row(shape, count));
  }
  const optionCells = [
    row(shapeC, 3),
    row(shapeC, 2),
    row(shapeC, 4),
    row(shapeB, 3),
    row(shapeC, 3, { f: 0 })
  ];
  pushMatrix("count", 3, cells, optionCells, 0);
}

// Rule 3: size progression — glyphs grow across each row.
for (const [shapeA, shapeB, shapeC] of [
  ["square", "circle", "triangle"],
  ["circle", "diamond", "square"],
  ["diamond", "triangle", "circle"],
  ["cross", "square", "diamond"]
]) {
  const sizes = [0.3, 0.5, 0.72];
  const rows = [shapeA, shapeB, shapeC];
  const cells = [];
  for (const shape of rows) {
    for (const sz of sizes) cells.push([g(shape, { sz })]);
  }
  const optionCells = [
    [g(shapeC, { sz: 0.72 })],
    [g(shapeC, { sz: 0.3 })],
    [g(shapeC, { sz: 0.5 })],
    [g(shapeB, { sz: 0.72 })],
    [g(shapeC, { sz: 0.72, f: 0 })]
  ];
  pushMatrix("size", 3, cells, optionCells, 0);
}

// Rule 4: rotation series — glyph rotates by a fixed step across each row,
// and the row's starting angle also progresses. Steps are chosen so the
// answer angle never aliases with 0 degrees under the glyph's symmetry
// (bars repeat every 180, so 4 * step must stay clear of that).
for (const [shape, step] of [
  ["bar", 30],
  ["triangle", 45],
  ["bar", 20],
  ["triangle", 40]
]) {
  const cells = [];
  for (let rowIndex = 0; rowIndex < 3; rowIndex += 1) {
    for (let column = 0; column < 3; column += 1) {
      cells.push([g(shape, { r: rowIndex * step + column * step })]);
    }
  }
  const answer = 2 * step + 2 * step;
  const optionCells = [
    [g(shape, { r: answer })],
    [g(shape, { r: answer - step })],
    [g(shape, { r: answer + step })],
    [g(shape, { r: 0 })],
    [g(shape === "bar" ? "triangle" : "bar", { r: answer })]
  ];
  pushMatrix("rotation", 5, cells, optionCells, 0);
}

// Rule 5: fill state Latin square — filled / outline / dotted center.
const fillStates = [
  (shape) => [g(shape, { f: 1 })],
  (shape) => [g(shape, { f: 0 })],
  (shape) => [g(shape, { f: 0 }), g("circle", { sz: 0.14 })]
];
for (const shape of ["circle", "square", "triangle", "diamond"]) {
  const latin = [
    [0, 1, 2],
    [1, 2, 0],
    [2, 0, 1]
  ];
  const cells = latin.flat().map((state) => fillStates[state](shape));
  const answerState = latin[2][2];
  const optionCells = [
    fillStates[answerState](shape),
    fillStates[(answerState + 1) % 3](shape),
    fillStates[(answerState + 2) % 3](shape),
    fillStates[answerState](shape === "circle" ? "square" : "circle"),
    [g(shape, { f: 1, sz: 0.3 })]
  ];
  pushMatrix("fill", 6, cells, optionCells, 0);
}

// Rule 6: XOR of corner dots — third cell in each row shows the dots that
// appear in exactly one of the first two cells.
const cornerPositions = {
  tl: { x: 0.26, y: 0.26 },
  tr: { x: 0.74, y: 0.26 },
  bl: { x: 0.26, y: 0.74 },
  br: { x: 0.74, y: 0.74 }
};
function dots(keys) {
  return keys.map((key) => g("circle", { ...cornerPositions[key], sz: 0.2 }));
}
function xorKeys(left, right) {
  const all = ["tl", "tr", "bl", "br"];
  return all.filter((key) => left.includes(key) !== right.includes(key));
}
for (const [setA, setB] of [
  [["tl", "tr"], ["tr", "bl"]],
  [["tl", "br"], ["tl", "tr", "bl"]],
  [["tr", "bl", "br"], ["bl"]],
  [["tl", "tr", "br"], ["tr", "bl", "br"]]
]) {
  const rows = [
    [setA, setB],
    [setB, ["tl", ...setA.filter((key) => key !== "tl")]],
    [["tr", "br"], setA]
  ];
  const cells = [];
  for (const [left, right] of rows) {
    cells.push(dots(left), dots(right), dots(xorKeys(left, right)));
  }
  const answer = xorKeys(rows[2][0], rows[2][1]);
  const wrongUnion = [...new Set([...rows[2][0], ...rows[2][1]])];
  const wrongIntersect = rows[2][0].filter((key) => rows[2][1].includes(key));
  // Distractors can collide (e.g. an operand equal to the intersection), so
  // dedupe by dot-set key and top up from spare corner sets.
  const spares = [["tl"], ["tr"], ["bl"], ["br"], ["tl", "bl"], ["tr", "br"], ["tl", "tr", "bl", "br"]];
  const seen = new Set();
  const optionSets = [];
  for (const keys of [answer, wrongUnion, wrongIntersect, rows[2][0], rows[2][1], ...spares]) {
    const key = [...keys].sort().join("+") || "none";
    if (seen.has(key)) continue;
    seen.add(key);
    optionSets.push(keys);
    if (optionSets.length === 5) break;
  }
  const optionCells = optionSets.map((keys) => dots(keys));
  // The third row's XOR cell is the hidden one, so drop the last cell we
  // pushed (it revealed the answer) before registering the item.
  cells.pop();
  cells.push(null);
  pushMatrix("xor", 8, cells.slice(0, 9), optionCells, 0);
}

// ---------------------------------------------------------------------------
// Fluid: number series and abstract letter analogies
// ---------------------------------------------------------------------------

const numberSeries = [
  [1, "2, 4, 6, 8, …", ["10", "12", "9", "11"], 0],
  [1, "5, 10, 15, 20, …", ["25", "30", "24", "22"], 0],
  [2, "21, 18, 15, 12, …", ["9", "10", "8", "6"], 0],
  [2, "3, 6, 12, 24, …", ["48", "36", "30", "44"], 0],
  [3, "1, 4, 9, 16, …", ["25", "20", "24", "21"], 0],
  [3, "1, 1, 2, 3, 5, …", ["8", "7", "9", "6"], 0],
  [3, "64, 32, 16, 8, …", ["4", "2", "6", "3"], 0],
  [4, "2, 5, 11, 23, …", ["47", "46", "35", "44"], 0],
  [4, "7, 10, 16, 25, …", ["37", "34", "31", "40"], 0],
  [5, "100, 81, 64, 49, …", ["36", "32", "25", "40"], 0],
  [5, "2, 3, 5, 7, 11, …", ["13", "12", "15", "14"], 0],
  [5, "4, 9, 19, 39, …", ["79", "78", "59", "69"], 0],
  [6, "1, 2, 6, 24, …", ["120", "96", "48", "60"], 0],
  [6, "3, 4, 7, 11, 18, …", ["29", "25", "22", "27"], 0],
  [7, "2, 6, 12, 20, 30, …", ["42", "40", "36", "44"], 0],
  [7, "5, 6, 10, 19, 35, …", ["60", "51", "54", "70"], 0],
  [8, "1, 3, 2, 6, 5, 15, …", ["14", "16", "18", "12"], 0],
  [8, "8, 5, 9, 6, 10, 7, …", ["11", "8", "12", "14"], 0],
  [9, "6, 11, 21, 41, …", ["81", "82", "61", "80"], 0],
  [9, "4, 6, 10, 18, 34, …", ["66", "68", "64", "62"], 0]
];

const letterAnalogies = [
  [2, "A is to C as F is to …", ["H", "G", "I", "E"], 0],
  [2, "KLM is to LMN as RST is to …", ["STU", "QRS", "RSU", "TUV"], 0],
  [3, "ABC is to CBA as DEF is to …", ["FED", "DEF", "EFD", "FDE"], 0],
  [3, "CAT is to TAC as DOG is to …", ["GOD", "ODG", "DGO", "OGD"], 0],
  [4, "AZ is to BY as CX is to …", ["DW", "DV", "EW", "CW"], 0],
  [4, "AB is to ABB as CD is to …", ["CDD", "CCD", "CDC", "DCC"], 0],
  [4, "AA is to AB as BA is to …", ["BB", "AB", "CA", "BC"], 0],
  [5, "HAT is to IBU as DOG is to …", ["EPH", "EPG", "DPH", "CNF"], 0],
  [5, "ABCD is to ABDC as WXYZ is to …", ["WXZY", "WYXZ", "XWYZ", "WZYX"], 0],
  [6, "AEI is to BFJ as OUA is to …", ["PVB", "PUB", "OVB", "PVA"], 0],
  [6, "A1 is to B2 as C3 is to …", ["D4", "C4", "D3", "E4"], 0],
  [6, "AZ is to ZA as MN is to …", ["NM", "MN", "OM", "NO"], 0],
  [7, "AC is to EG as BD is to …", ["FH", "EG", "FG", "EH"], 0],
  [7, "AAB is to ABB as CCD is to …", ["CDD", "CCD", "DDC", "DCC"], 0],
  [8, "ZYX is to WVU as TSR is to …", ["QPO", "QRP", "POQ", "RQP"], 0],
  [8, "AbC is to aBc as DeF is to …", ["dEf", "DEF", "def", "eDf"], 0]
];

// ---------------------------------------------------------------------------
// Verbal comprehension
// ---------------------------------------------------------------------------

const vocabulary = [
  [1, "Rapid", ["Quick", "Loud", "Heavy", "Bright"], 0],
  [1, "Enormous", ["Huge", "Empty", "Ancient", "Round"], 0],
  [2, "Fatigued", ["Tired", "Angry", "Hungry", "Confused"], 0],
  [2, "Hushed", ["Quiet", "Hidden", "Rushed", "Gentle"], 0],
  [3, "Candid", ["Honest", "Sweet", "Hidden", "Careful"], 0],
  [3, "Frugal", ["Thrifty", "Fragile", "Friendly", "Rare"], 0],
  [4, "Lucid", ["Clear", "Lucky", "Shiny", "Loose"], 0],
  [4, "Tenacious", ["Persistent", "Tense", "Delicate", "Suspicious"], 0],
  [5, "Ephemeral", ["Fleeting", "Eternal", "Heavenly", "Delicate"], 0],
  [5, "Ubiquitous", ["Everywhere", "Unusual", "Enormous", "Unclear"], 0],
  [6, "Taciturn", ["Reserved", "Rude", "Tactful", "Sleepy"], 0],
  [6, "Magnanimous", ["Generous", "Enormous", "Proud", "Wealthy"], 0],
  [7, "Perfunctory", ["Half-hearted", "Precise", "Official", "Complete"], 0],
  [7, "Laconic", ["Brief", "Lazy", "Sour", "Musical"], 0],
  [8, "Alacrity", ["Eagerness", "Accuracy", "Anxiety", "Authority"], 0],
  [8, "Obdurate", ["Stubborn", "Obedient", "Dull", "Ancient"], 0],
  [9, "Parsimonious", ["Stingy", "Religious", "Talkative", "Balanced"], 0],
  [9, "Esoteric", ["Obscure", "Foreign", "Spiritual", "Elegant"], 0]
];

const verbalAnalogies = [
  [1, "Glove is to hand as sock is to …", ["Foot", "Shoe", "Leg", "Toe"], 0],
  [2, "Bird is to nest as bee is to …", ["Hive", "Flower", "Honey", "Swarm"], 0],
  [2, "Hungry is to eat as tired is to …", ["Sleep", "Yawn", "Work", "Sit"], 0],
  [3, "Author is to novel as sculptor is to …", ["Statue", "Chisel", "Marble", "Gallery"], 0],
  [3, "Library is to books as orchard is to …", ["Trees", "Fruit", "Farmers", "Fields"], 0],
  [4, "Second is to minute as minute is to …", ["Hour", "Day", "Clock", "Week"], 0],
  [4, "Doctor is to hospital as chef is to …", ["Kitchen", "Menu", "Dinner", "Waiter"], 0],
  [5, "Ice is to cold as ember is to …", ["Hot", "Fire", "Grey", "Small"], 0],
  [6, "Scarce is to abundant as timid is to …", ["Bold", "Shy", "Quiet", "Small"], 0],
  [7, "Drizzle is to downpour as breeze is to …", ["Gale", "Wind", "Cloud", "Chill"], 0],
  [8, "Novice is to expert as sapling is to …", ["Oak", "Seed", "Leaf", "Forest"], 0],
  [9, "Reticent is to speak as frugal is to …", ["Spend", "Save", "Earn", "Give"], 0]
];

const oddOneOut = [
  [1, "Which word does not belong? Apple, Banana, Carrot, Cherry", ["Carrot", "Apple", "Banana", "Cherry"], 0],
  [2, "Which word does not belong? Oak, Rose, Maple, Birch", ["Rose", "Oak", "Maple", "Birch"], 0],
  [3, "Which word does not belong? Hammer, Saw, Nail, Drill", ["Nail", "Hammer", "Saw", "Drill"], 0],
  [4, "Which word does not belong? Trout, Salmon, Dolphin, Cod", ["Dolphin", "Trout", "Salmon", "Cod"], 0],
  [5, "Which word does not belong? Whisper, Murmur, Mutter, Shout", ["Shout", "Whisper", "Murmur", "Mutter"], 0],
  [6, "Which shape does not belong? Triangle, Square, Circle, Pentagon", ["Circle", "Triangle", "Square", "Pentagon"], 0],
  [7, "Which does not belong? Copper, Iron, Brass, Zinc", ["Brass", "Copper", "Iron", "Zinc"], 0],
  [8, "Which word does not belong? Honest, Sincere, Truthful, Cunning", ["Cunning", "Honest", "Sincere", "Truthful"], 0]
];

const sentenceLogic = [
  [2, "All swifts are birds. All birds lay eggs. What follows?", ["Swifts lay eggs", "All birds are swifts", "Some eggs are swifts", "Nothing follows"], 0],
  [3, "No reptiles are warm-blooded. Snakes are reptiles. What follows?", ["Snakes are not warm-blooded", "Snakes are warm-blooded", "Some reptiles are snakes", "Nothing follows"], 0],
  [4, "If it rains, the match is cancelled. The match was not cancelled. What follows?", ["It did not rain", "It rained", "The match was moved", "Nothing follows"], 0],
  [5, "Mia is taller than Jon. Jon is taller than Ade. Who is shortest?", ["Ade", "Jon", "Mia", "Cannot be determined"], 0],
  [6, "Some painters are teachers. All teachers read daily. What must be true?", ["Some painters read daily", "All painters read daily", "Some teachers are not painters", "Nothing must be true"], 0],
  [7, "Every runner in the club owns spikes. Kai owns spikes. What follows?", ["It cannot be concluded that Kai is in the club", "Kai is in the club", "Kai is not in the club", "Kai is a runner"], 0],
  [8, "All bloops are razzies. Some razzies are lazzies. What must be true?", ["It cannot be determined whether any bloop is a lazzie", "Some bloops are lazzies", "No bloops are lazzies", "All lazzies are bloops"], 0]
];

// ---------------------------------------------------------------------------
// Quantitative reasoning (all mental-math friendly)
// ---------------------------------------------------------------------------

const wordProblems = [
  [1, "Three apples cost 60 cents. What do five apples cost?", ["100 cents", "90 cents", "120 cents", "110 cents"], 0],
  [1, "24 cookies are shared equally among 6 children. How many each?", ["4", "3", "6", "5"], 0],
  [2, "A bus leaves at 9:40 and the ride takes 35 minutes. When does it arrive?", ["10:15", "10:05", "10:25", "10:10"], 0],
  [2, "You save 12 coins a week. How many after 6 weeks?", ["72", "62", "84", "66"], 0],
  [3, "A tank held 15 liters, 6 were used, then 9 added. How many now?", ["18", "12", "21", "15"], 0],
  [3, "A 240-page book read at 60 pages a day takes how many days?", ["4", "3", "5", "6"], 0],
  [3, "What is 7 × 8 − 6?", ["50", "48", "52", "56"], 0],
  [4, "A 90-minute movie ends at 21:15. When did it start?", ["19:45", "19:30", "20:00", "19:15"], 0],
  [4, "You have a dozen eggs, use 5, then buy another dozen. How many now?", ["19", "17", "18", "20"], 0],
  [5, "48 students sit in rows of 9. How many rows are needed?", ["6", "5", "7", "4"], 0],
  [5, "In 6 years Ana will be 21. How old is she now?", ["15", "14", "16", "27"], 0],
  [5, "A square field has 9 m sides. How long is the fence around it?", ["36 m", "27 m", "45 m", "81 m"], 0],
  [6, "84 coins are split so one person gets twice the other. What is the smaller share?", ["28", "42", "24", "32"], 0],
  [6, "With 3 shirts and 2 pairs of pants, how many different outfits?", ["6", "5", "8", "9"], 0],
  [7, "Twice a number minus 7 equals 19. What is the number?", ["13", "12", "14", "26"], 0],
  [7, "Three consecutive whole numbers sum to 48. What is the middle one?", ["16", "15", "17", "18"], 0],
  [8, "What is half of a third of 96?", ["16", "32", "12", "24"], 0],
  [8, "A ribbon is cut into 8 equal parts with how many cuts?", ["7", "8", "6", "9"], 0]
];

const numberProperties = [
  [1, "Which number is even? 37, 41, 58, 63", ["58", "37", "41", "63"], 0],
  [2, "What is 2 to the power of 5?", ["32", "16", "64", "25"], 0],
  [2, "What is the remainder of 29 ÷ 4?", ["1", "2", "3", "0"], 0],
  [3, "Which number is divisible by 3? 124, 214, 321, 431", ["321", "124", "214", "431"], 0],
  [3, "Which is a perfect square? 48, 49, 50, 51", ["49", "48", "50", "51"], 0],
  [4, "What is the smallest prime number greater than 20?", ["23", "21", "27", "29"], 0],
  [4, "What is the greatest common divisor of 12 and 18?", ["6", "3", "9", "12"], 0],
  [5, "What is the least common multiple of 4 and 6?", ["12", "24", "18", "8"], 0],
  [5, "The product of two odd numbers is always…", ["Odd", "Even", "Prime", "A square"], 0],
  [6, "What is the sum of the first five odd numbers?", ["25", "20", "24", "30"], 0],
  [7, "Which number is prime? 51, 57, 61, 63", ["61", "51", "57", "63"], 0],
  [8, "Which could be a multiple of 9? 235, 414, 521, 611", ["414", "235", "521", "611"], 0]
];

const proportionRate = [
  [1, "What is 20% of 45?", ["9", "8", "10", "12"], 0],
  [2, "A car travels 60 km/h for 2.5 hours. How far does it go?", ["150 km", "120 km", "140 km", "180 km"], 0],
  [2, "On a map 1 cm equals 5 km. How far is 7 cm?", ["35 km", "30 km", "40 km", "25 km"], 0],
  [3, "A recipe uses 2 eggs for 12 pancakes. How many eggs for 30 pancakes?", ["5", "4", "6", "3"], 0],
  [3, "A price of 80 rises by 25%. What is the new price?", ["100", "95", "105", "110"], 0],
  [4, "3 painters need 6 days for a job. How long do 6 painters need?", ["3 days", "12 days", "4 days", "2 days"], 0],
  [4, "Two shares are in ratio 2:3 and total 40. What is the larger share?", ["24", "16", "26", "30"], 0],
  [5, "What is a 15% tip on a 60 bill?", ["9", "6", "12", "8"], 0],
  [5, "A car uses 8 L per 100 km. How much for 350 km?", ["28 L", "24 L", "32 L", "35 L"], 0],
  [6, "A pump fills 3/4 of a tank in 15 minutes. How long for the full tank?", ["20 min", "18 min", "25 min", "30 min"], 0],
  [6, "A price drops from 120 to 90. What percent discount is that?", ["25%", "30%", "20%", "33%"], 0],
  [7, "5 machines make 5 widgets in 5 minutes. How long do 100 machines need for 100 widgets?", ["5 min", "100 min", "20 min", "1 min"], 0],
  [7, "Juice mixes concentrate and water 1:4. How much concentrate in 2 liters of juice?", ["0.4 L", "0.5 L", "0.25 L", "0.8 L"], 0],
  [8, "You walk out at 4 km/h and back the same way at 6 km/h. What is your average speed?", ["4.8 km/h", "5 km/h", "5.2 km/h", "4.5 km/h"], 0],
  [9, "A town of 2000 grows 10% one year and 10% the next. Population after both?", ["2420", "2400", "2440", "2200"], 0]
];

// ---------------------------------------------------------------------------
// Bank assembly: shuffle answer positions deterministically, spread b evenly
// across each domain by difficulty rank, cycle plausible a values.
// ---------------------------------------------------------------------------

const discriminationCycle = [1.0, 1.3, 0.9, 1.6, 1.1, 1.8, 0.8, 1.4, 2.0, 1.2, 1.5, 1.7];

function fromTable(kind, domain, table) {
  return table.map(([dRank, prompt, options, answerIndex]) => ({
    kind,
    domain,
    dRank,
    prompt,
    options,
    answerIndex
  }));
}

function rotateAnswer(item, seed) {
  // Deterministically move the correct answer away from position 0 so answer
  // keys are spread across positions without storing a second source of truth.
  const shift = seed % item.options.length;
  const options = item.options.map((_, index) => item.options[(index + shift) % item.options.length]);
  const answerIndex = (item.answerIndex - shift + item.options.length) % item.options.length;
  const next = { ...item, options, answerIndex };
  if (item.matrix) {
    const optionCells = item.matrix.optionCells.map((_, index) => item.matrix.optionCells[(index + shift) % item.matrix.optionCells.length]);
    next.matrix = { ...item.matrix, optionCells };
  }
  return next;
}

function buildDomain(domain, rawItems) {
  const sorted = [...rawItems].sort((left, right) => left.dRank - right.dRank);
  return sorted.map((item, index) => {
    const b = -2.5 + (5 * index) / (sorted.length - 1);
    const withAnswer = rotateAnswer(item, index * 7 + 3);
    return {
      ...withAnswer,
      id: `${domain}-${String(index + 1).padStart(3, "0")}`,
      domain,
      a: discriminationCycle[index % discriminationCycle.length],
      b: Math.round(b * 100) / 100,
      provisional: true
    };
  });
}

const fluidRaw = [
  ...matrixItems.map((item) => ({ ...item, domain: "fluid" })),
  ...fromTable("series", "fluid", numberSeries),
  ...fromTable("letter-analogy", "fluid", letterAnalogies)
];

const verbalRaw = [
  ...fromTable("vocabulary", "verbal", vocabulary),
  ...fromTable("verbal-analogy", "verbal", verbalAnalogies),
  ...fromTable("odd-one-out", "verbal", oddOneOut),
  ...fromTable("sentence-logic", "verbal", sentenceLogic)
];

const quantRaw = [
  ...fromTable("word-problem", "quant", wordProblems),
  ...fromTable("number-property", "quant", numberProperties),
  ...fromTable("proportion-rate", "quant", proportionRate)
];

export const catItemBank = [
  ...buildDomain("fluid", fluidRaw),
  ...buildDomain("verbal", verbalRaw),
  ...buildDomain("quant", quantRaw)
];
