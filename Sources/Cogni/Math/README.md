# Cogni Math Engine

A pure-Swift, deterministic math item generation engine. No UI. Every item is
generated from an explicit seed, validated before it ships, and carries a predicted
difficulty for later calibration.

## Design invariants

- **Determinism.** All entropy comes from `SplitMix64` (a fully specified algorithm) via
  its own bounded-sampling helpers (`int(in:)`, `nextUInt(below:)`, `shuffle`). The
  standard library's `Int.random(in:using:)` is *never* used — its range reduction lives
  in the stdlib and has changed between toolchains. Same seed → byte-identical items on
  every device and OS. `MatchItemSequence` relies on this: both clients regenerate the
  identical ranked sequence offline from a server-issued match seed.
- **Validity.** Every generator is propose → validate → reject → retry, capped at 100
  attempts, then it throws `MathError.generationFailed`. No unvalidated item can ship.
- **No floating point in item logic.** Integers and `Rational` (always reduced) only.
  Estimation gap thresholds are integer per-mille compared by cross-multiplication.
  `Double` appears only in `predictedDifficulty` (a score, never an equality check).
- **Content-addressed ids.** An item's `UUID` is an FNV-1a hash of its defining
  parameters, so the same item always has the same id — never process-random.

## Axes

| Axis | Generators |
|------|------------|
| processing speed | SpeededArithmetic, PercentFraction |
| reasoning | TargetNumber, EquationCompletion, CustomOperator, OddOneOut, MissingDigit, **Estimation** |
| working memory | RunningTotal |

> Note: the task's axis list did not mention Estimation; it is assigned to **reasoning**
> (magnitude reasoning). No seventh axis was added.

## Ranked (1v1) item set

`MatchItemSequence` restricts ranked play to **TargetNumber, RunningTotal, Estimation,
OddOneOut** — the kinds an off-screen calculator does not help with. SpeededArithmetic
and PercentFraction are excluded from ranked entirely.

## Telemetry

`MathTelemetryEvent` (per attempt): `itemKind`, `itemID`, `seed`, `difficulty`,
`predictedDifficulty`, `correct`, `latencyMs`, and `stepDisplayIntervalMs` for
RunningTotal. `MathTelemetryBuffer` buffers on device and flushes batches through a
`MathTelemetrySink`; the Supabase-backed sink is provided by the app layer (no network
in this pass). No PII in the payload.

---

## Difficulty parameter tables

Difficulty input is the integer 1–10 from the adaptive ladder, clamped per generator.
Each generator maps it through the single table below.

### SpeededArithmetic — carry/borrow count is the primary driver (weighted 1.6 vs 0.7/digit)

| d | digits | carries | operations | verify prob |
|---|--------|---------|------------|-------------|
| 1 | 1 | 0 | + − | 0.00 |
| 2 | 1 | 1 | + − | 0.30 |
| 3 | 2 | 1 | + − | 0.30 |
| 4 | 2 | 2 | + − | 0.35 |
| 5 | 2 | 2 | + − × | 0.35 |
| 6 | 3 | 2 | + − | 0.40 |
| 7 | 3 | 3 | + − | 0.40 |
| 8 | 3 | 3 | + − × | 0.40 |
| 9 | 3 | 3 | + − × | 0.45 |
| 10 | 3 | 3 | + − × | 0.45 |

Operands are constructed column-by-column to hit the exact carry/borrow count. Verify
prompts show a plausible wrong answer (off by ±1/±2/±10 or a dropped/extra partial
product), never a random number.

### TargetNumber — build first; reachable targets only

| d | operand range | target band |
|---|---------------|-------------|
| 1 | 1–6 | 1–24 |
| 2 | 1–7 | 1–30 |
| 3 | 1–8 | 1–40 |
| 4 | 1–9 | 1–50 |
| 5 | 1–10 | 1–60 |
| 6 | 1–11 | 1–75 |
| 7 | 1–12 | 1–90 |
| 8 | 2–12 | 1–100 |
| 9 | 2–13 | 1–120 |
| 10 | 2–13 | 1–150 |

The solver (recursive pairwise reduction, exact `Rational`) enumerates every reachable
target and its distinct solutions. Predicted difficulty rises with forced division,
forced fractional intermediates, minimum solution depth, and solution scarcity — so
structure dominates magnitude. `solve(operands:target:)` is public for hints/failure
explanations.

### RunningTotal — negative intermediates only at d ≥ 8

| d | chain | max step | neg prob | interval ms |
|---|-------|----------|----------|-------------|
| 1 | 3 | 5 | 0.15 | 1500 |
| 2 | 4 | 6 | 0.20 | 1400 |
| 3 | 4 | 8 | 0.25 | 1300 |
| 4 | 5 | 9 | 0.30 | 1200 |
| 5 | 5 | 12 | 0.35 | 1050 |
| 6 | 6 | 15 | 0.40 | 900 |
| 7 | 7 | 18 | 0.45 | 800 |
| 8 | 7 | 22 | 0.50 | 700 (neg ok) |
| 9 | 8 | 26 | 0.50 | 600 (neg ok) |
| 10 | 9 | 30 | 0.55 | 500 (neg ok) |

The final total is rejected if it equals the first or last delta (not trivially
guessable). Display interval is emitted in telemetry.

### EquationCompletion — brute-forced unique solution

| d | terms | operand range | operator set | operand-blank prob |
|---|-------|---------------|--------------|--------------------|
| 1 | 3 | 1–9 | + − | 0.30 |
| 2 | 3 | 1–9 | + − | 0.35 |
| 3 | 3 | 1–9 | + − × | 0.40 |
| 4 | 3 | 1–12 | + − × | 0.40 |
| 5 | 4 | 1–9 | + − × | 0.40 |
| 6 | 4 | 1–12 | + − × | 0.45 |
| 7 | 4 | 1–12 | + − × ÷ | 0.45 |
| 8 | 4 | 2–15 | + − × ÷ | 0.50 |
| 9 | 5 | 1–12 | + − × ÷ | 0.50 |
| 10 | 5 | 2–15 | + − × ÷ | 0.50 |

Evaluated with standard precedence. Operator blanks are unique over the operator
palette; operand blanks are unique over a wide integer band (−99…999), which rejects
shapes like `_ × 0 + 5 = 5`.

### CustomOperator — non-commutative reserved for d ≥ 4

| d | coeff mag | chain | operand range | non-commutative | result cap |
|---|-----------|-------|---------------|-----------------|------------|
| 1 | 2 | 2 | 1–6 | no | 500 |
| 2 | 2 | 2 | 1–8 | no | 800 |
| 3 | 3 | 2 | 1–9 | no | 1200 |
| 4 | 3 | 3 | 1–9 | yes | 3000 |
| 5 | 3 | 3 | 1–10 | yes | 5000 |
| 6 | 4 | 3 | 1–10 | yes | 8000 |
| 7 | 4 | 4 | 1–10 | yes | 20000 |
| 8 | 5 | 4 | 1–12 | yes | 40000 |
| 9 | 5 | 4 | 1–12 | yes | 80000 |
| 10 | 6 | 5 | 1–12 | yes | 200000 |

`a ⊕ b = p·a + q·b + r`, evaluated left-associatively. `p` and `q` are always non-zero
(never degenerate); `p == q` (commutative) is forced below d 4. Result is bounded by the
cap.

### Estimation — separation floor 15% → 8%

| d | target range | factor range | options | correct tol | distractor min |
|---|--------------|--------------|---------|-------------|----------------|
| 1 | 150–1200 | 5–30 | 3 | 5% | 15.0% |
| 2 | 200–1600 | 6–35 | 3 | 5% | 14.2% |
| 3 | 300–2200 | 8–45 | 3 | 5% | 13.4% |
| 4 | 500–3000 | 10–55 | 3 | 5% | 12.6% |
| 5 | 800–4000 | 15–65 | 3 | 5% | 11.8% |
| 6 | 1000–5000 | 18–75 | 4 | 5% | 11.0% |
| 7 | 1500–6000 | 22–85 | 4 | 5% | 10.2% |
| 8 | 2000–7500 | 25–95 | 4 | 5% | 9.4% |
| 9 | 2500–8500 | 30–99 | 4 | 5% | 8.6% |
| 10 | 3000–9000 | 35–99 | 4 | 5% | 8.0% |

Thresholds are integer per-mille; separation is exact (`|value−target|·1000` vs
`target·‰`). Correct is within 5%; every distractor is at least the floor away.

### OddOneOut — exactly one 4/1 grouping

| d | number range | target properties |
|---|--------------|--------------------|
| 1 | 10–60 | ×5, ×3, square |
| 2 | 10–80 | ×5, ×3, ×4, square |
| 3 | 10–99 | ×3, ×4, ×6, square, pow2 |
| 4 | 12–120 | ×4, ×6, square, pow2, prime |
| 5 | 20–150 | prime, square, pow2, ×7, ×9 |
| 6 | 20–200 | prime, square, pow2, palindrome, ×7 |
| 7 | 40–300 | prime, square, pow2, palindrome, ×9 |
| 8 | 50–400 | prime, square, pow2, palindrome, digit-sum |
| 9 | 100–600 | prime, square, pow2, palindrome, digit-sum |
| 10 | 100–900 | prime, square, pow2, palindrome, digit-sum |

Every number is tested against the **full** property set (prime, perfect square, power
of two, palindrome, multiples of 3/4/5/6/7/8/9/11, digit sums 1–27). An item ships only
if exactly one property yields a 4/1 split, its odd-one is consistent, and the four
share no other property — no second grouping possible.

### MissingDigit — deductive, ≤ 3 blanks

| d | operation | a range | b range | max blanks |
|---|-----------|---------|---------|------------|
| 1 | + | 10–99 | 10–99 | 1 |
| 2 | + | 10–99 | 10–99 | 1 |
| 3 | × | 10–99 | 2–9 | 1 |
| 4 | × | 10–99 | 2–9 | 2 |
| 5 | × | 10–99 | 3–9 | 2 |
| 6 | × | 100–999 | 2–9 | 2 |
| 7 | × | 100–999 | 3–9 | 2 |
| 8 | × | 100–999 | 11–99 | 2 |
| 9 | × | 100–999 | 11–99 | 3 |
| 10 | × | 100–999 | 12–99 | 3 |

Blanks never sit on a leading digit (no leading-zero ambiguity). The digit assignment is
brute-forced unique over 0–9 per blank. Flagged `isDeductive` — pace it slow, not
speeded.

### PercentFraction

| d | variants | percents | base range | base step | denominators |
|---|----------|----------|------------|-----------|--------------|
| 1 | percentOf | 10,25,50 | 20–200 | 10 | 2,4,5,10 |
| 2 | percentOf | 10,20,25,50,75 | 20–300 | 10 | 2,4,5,10 |
| 3 | percentOf, fraction | 5,15,20,30,40 | 20–300 | 5 | 2,4,5,8,10 |
| 4 | percentOf, fraction | 12,18,35,60 | 30–400 | 1 | 2,4,5,8,10,20 |
| 5 | percentOf, fraction | 8,22,45,65,90 | 30–500 | 1 | 3,6,8,16,25 |
| 6 | chained, percentOf | 10,15,20,25 | 50–500 | 5 | 3,7,8,16 |
| 7 | chained, fraction | 12,15,18,22 | 50–600 | 1 | 7,9,11,16 |
| 8 | chained, fraction | 8,13,17,23 | 80–800 | 1 | 7,9,12,13 |
| 9 | chained | 11,14,19,27 | 100–900 | 1 | 7,11,13,17 |
| 10 | chained | 13,17,24,33 | 100–1000 | 1 | 7,11,13,17,19 |

`base step ≥ 5` means a round base (easier). Chained is discount-then-tip. Answers are
exact `Rational`.

## Tests

Run `swift test`. Coverage:

- **Determinism** — same seed → identical JSON across all 9 generators and match
  sequences (cross-client), plus a pinned SplitMix64 known-answer vector.
- **Solver** — TargetNumber solver checked against an independent brute-force oracle on
  1000 instances (soundness + completeness).
- **Uniqueness** — EquationCompletion, MissingDigit, OddOneOut: 2000 items each,
  re-derived independently, no second valid answer.
- **Estimation gaps** — 2000 items, separation invariant holds exactly.
- **Difficulty monotonicity** — mean predicted difficulty (and structural solve-effort
  measures) rise with the input.
- **Retry cap** — every generator, difficulty 1–10, 120 seeds: never throws.
- **Self-consistency** — every item accepts its correct answer and rejects a wrong one.
