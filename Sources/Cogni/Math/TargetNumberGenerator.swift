import Foundation

/// Reach a target using four operands, each exactly once, with `+ − × ÷` and
/// parentheses (e.g. the "24 game"). The solver is real — it enumerates every
/// parenthesisation with exact `Rational` arithmetic — and generation only ever picks
/// a target that is actually reachable, so validity is guaranteed by construction.
public struct TargetNumberGenerator: MathItemGenerator {
    public static let kind: MathItemKind = .targetNumber

    public init() {}

    /// Difficulty → parameter table. Higher difficulty widens the operand pool (so
    /// harder targets become reachable) and the target band.
    struct Params {
        let operandRange: ClosedRange<Int>
        let targetBand: ClosedRange<Int>
    }

    static func params(for difficulty: Int) -> Params {
        // Indexed by difficulty 1...10.
        switch clampDifficulty(difficulty) {
        case 1: return Params(operandRange: 1...6, targetBand: 1...24)
        case 2: return Params(operandRange: 1...7, targetBand: 1...30)
        case 3: return Params(operandRange: 1...8, targetBand: 1...40)
        case 4: return Params(operandRange: 1...9, targetBand: 1...50)
        case 5: return Params(operandRange: 1...10, targetBand: 1...60)
        case 6: return Params(operandRange: 1...11, targetBand: 1...75)
        case 7: return Params(operandRange: 1...12, targetBand: 1...90)
        case 8: return Params(operandRange: 2...12, targetBand: 1...100)
        case 9: return Params(operandRange: 2...13, targetBand: 1...120)
        default: return Params(operandRange: 2...13, targetBand: 1...150)
        }
    }

    public func generate(difficulty: Int, using rng: inout SplitMix64) throws -> TargetNumberItem {
        let d = clampDifficulty(difficulty)
        let params = Self.params(for: d)
        return try generateWithRetry(kind: .targetNumber, using: &rng) { rng in
            let operands = (0..<4).map { _ in rng.int(in: params.operandRange) }
            let reachable = Self.reachableSolutions(operands: operands)

            // Every reachable, in-band, positive integer target is a candidate; score
            // each by how hard it plays and keep the ones nearest the requested band.
            var candidates: [(target: Int, difficulty: Double, count: Int)] = []
            for (value, solutions) in reachable {
                guard let target = value.integerValue,
                      target >= 1,
                      params.targetBand.contains(target) else { continue }
                let score = Self.difficultyScore(operands: operands, solutions: solutions)
                candidates.append((target, score, solutions.count))
            }
            guard !candidates.isEmpty else { return nil } // redraw operands

            // Deterministic ordering: closeness to the wanted difficulty, then target,
            // then solution count. Dictionary iteration order never leaks through.
            let wanted = Double(d)
            candidates.sort { a, b in
                let da = abs(a.difficulty - wanted), db = abs(b.difficulty - wanted)
                if da != db { return da < db }
                if a.target != b.target { return a.target < b.target }
                return a.count < b.count
            }
            let topK = Array(candidates.prefix(min(4, candidates.count)))
            let chosen = topK[rng.int(in: 0..<topK.count)]

            return TargetNumberItem(
                operands: operands,
                target: chosen.target,
                solutionCount: chosen.count,
                predictedDifficulty: chosen.difficulty
            )
        }
    }

    // MARK: - Public solver (used by the UI for hints and failure explanations)

    /// All distinct solution expressions that reach `target` using each operand once.
    /// Distinct = differing by more than commutative reordering.
    public static func solve(operands: [Int], target: Int) -> [MathExpression] {
        solve(operands: operands, target: Rational(target))
    }

    public static func solve(operands: [Int], target: Rational) -> [MathExpression] {
        reachableSolutions(operands: operands)[target] ?? []
    }

    // MARK: - Enumeration core

    private typealias Node = (value: Rational, expr: MathExpression)

    /// Maps every reachable final value to its set of distinct solution expressions,
    /// via recursive pairwise reduction over the operand multiset.
    static func reachableSolutions(operands: [Int]) -> [Rational: [MathExpression]] {
        var byKey: [Rational: [String: MathExpression]] = [:]
        let start: [Node] = operands.map { (Rational($0), .value($0)) }
        enumerate(start) { value, expr in
            byKey[value, default: [:]][expr.canonicalKey] = expr
        }
        return byKey.mapValues { Array($0.values) }
    }

    private static func enumerate(_ nodes: [Node], _ visit: (Rational, MathExpression) -> Void) {
        if nodes.count == 1 {
            visit(nodes[0].value, nodes[0].expr)
            return
        }
        for i in 0..<nodes.count {
            for j in (i + 1)..<nodes.count {
                let a = nodes[i]
                let b = nodes[j]
                var rest = nodes
                rest.remove(at: j) // remove higher index first
                rest.remove(at: i)
                for combined in combine(a, b) {
                    enumerate(rest + [combined], visit)
                }
            }
        }
    }

    private static func combine(_ a: Node, _ b: Node) -> [Node] {
        var out: [Node] = [
            (a.value + b.value, .add(a.expr, b.expr)),
            (a.value * b.value, .multiply(a.expr, b.expr)),
            (a.value - b.value, .subtract(a.expr, b.expr)),
            (b.value - a.value, .subtract(b.expr, a.expr))
        ]
        if let q = a.value.divided(by: b.value) {
            out.append((q, .divide(a.expr, b.expr)))
        }
        if let q = b.value.divided(by: a.value) {
            out.append((q, .divide(b.expr, a.expr)))
        }
        return out
    }

    // MARK: - Difficulty

    /// Score a target's difficulty from the structure of its solution set:
    /// forced division, forced fractional intermediates, minimum depth, and scarcity
    /// of solutions all push it up. Weighted so structure dominates raw magnitude.
    static func difficultyScore(operands: [Int], solutions: [MathExpression]) -> Double {
        guard !solutions.isEmpty else { return 0 }
        let count = solutions.count
        let minDepth = solutions.map(\.height).min() ?? 3
        let divisionFreeExists = solutions.contains { !$0.usesDivision }
        let allNeedFraction = solutions.allSatisfy { $0.hasNonIntegerIntermediate }

        var score = 2.0
        score += divisionFreeExists ? 0.0 : 2.2       // division is forced → harder
        score += allNeedFraction ? 1.6 : 0.0          // every path passes through a fraction
        score += Double(max(0, minDepth - 2)) * 1.2   // 2 → 0, 3 → 1.2

        switch count {                                  // scarcity → harder
        case 1: score += 3.0
        case 2: score += 2.2
        case 3...4: score += 1.2
        case 5...8: score += 0.5
        default: score += 0.0
        }

        let maxOperand = operands.max() ?? 0
        score += min(1.0, Double(max(0, maxOperand - 9)) * 0.15)

        return min(10.0, max(0.0, score))
    }
}

/// A generated TargetNumber puzzle. The answer is a full expression the player builds.
public struct TargetNumberItem: MathItem {
    public let id: UUID
    public let predictedDifficulty: Double
    public let operands: [Int]
    public let target: Int
    public let solutionCount: Int

    public var kind: MathItemKind { .targetNumber }
    public var answerFormat: AnswerFormat { .operatorSequence }

    init(operands: [Int], target: Int, solutionCount: Int, predictedDifficulty: Double) {
        self.operands = operands
        self.target = target
        self.solutionCount = solutionCount
        self.predictedDifficulty = predictedDifficulty
        self.id = deterministicUUID(
            contentHash: stableHash(operands.sorted() + [target]),
            salt: MathItemKind.targetNumber.idSalt
        )
    }

    public var prompt: String {
        let list = operands.map(String.init).joined(separator: ", ")
        return "Use \(list) once each with + − × ÷ to make \(target)."
    }

    /// A submitted expression is correct if it uses exactly the given operands (as a
    /// multiset) and evaluates to the target.
    public func validate(_ response: Response) -> Bool {
        guard case let .expression(expr) = response else { return false }
        guard expr.leaves.sorted() == operands.sorted() else { return false }
        guard let value = expr.evaluate() else { return false }
        return value == Rational(target)
    }
}
