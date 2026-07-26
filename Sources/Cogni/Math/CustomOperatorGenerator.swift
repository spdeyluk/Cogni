import Foundation

/// Defines a made-up operator `a ⊕ b = p·a + q·b + r` with small integer coefficients,
/// then asks for a left-associative chain (`5 ⊕ 3 ⊕ 2`). A commutative op (`p == q`)
/// is much easier, so non-commutative ops are reserved for difficulty ≥ 4.
public struct CustomOperatorGenerator: MathItemGenerator {
    public static let kind: MathItemKind = .customOperator

    public init() {}

    struct Params {
        let coefficientMagnitude: Int
        let chainLength: Int
        let operandRange: ClosedRange<Int>
        let allowNonCommutative: Bool
        let resultCap: Int
    }

    /// Difficulty → parameter table.
    static func params(for difficulty: Int) -> Params {
        switch clampDifficulty(difficulty) {
        case 1: return Params(coefficientMagnitude: 2, chainLength: 2, operandRange: 1...6, allowNonCommutative: false, resultCap: 500)
        case 2: return Params(coefficientMagnitude: 2, chainLength: 2, operandRange: 1...8, allowNonCommutative: false, resultCap: 800)
        case 3: return Params(coefficientMagnitude: 3, chainLength: 2, operandRange: 1...9, allowNonCommutative: false, resultCap: 1200)
        case 4: return Params(coefficientMagnitude: 3, chainLength: 3, operandRange: 1...9, allowNonCommutative: true, resultCap: 3000)
        case 5: return Params(coefficientMagnitude: 3, chainLength: 3, operandRange: 1...10, allowNonCommutative: true, resultCap: 5000)
        case 6: return Params(coefficientMagnitude: 4, chainLength: 3, operandRange: 1...10, allowNonCommutative: true, resultCap: 8000)
        case 7: return Params(coefficientMagnitude: 4, chainLength: 4, operandRange: 1...10, allowNonCommutative: true, resultCap: 20000)
        case 8: return Params(coefficientMagnitude: 5, chainLength: 4, operandRange: 1...12, allowNonCommutative: true, resultCap: 40000)
        case 9: return Params(coefficientMagnitude: 5, chainLength: 4, operandRange: 1...12, allowNonCommutative: true, resultCap: 80000)
        default: return Params(coefficientMagnitude: 6, chainLength: 5, operandRange: 1...12, allowNonCommutative: true, resultCap: 200000)
        }
    }

    public func generate(difficulty: Int, using rng: inout SplitMix64) throws -> CustomOperatorItem {
        let d = clampDifficulty(difficulty)
        let params = Self.params(for: d)
        return try generateWithRetry(kind: .customOperator, using: &rng) { rng in
            let mag = params.coefficientMagnitude
            let p = Self.nonZeroCoefficient(magnitude: mag, rng: &rng)
            var q = Self.nonZeroCoefficient(magnitude: mag, rng: &rng)
            let r = rng.int(in: -mag...mag)

            if !params.allowNonCommutative {
                q = p // force commutativity at low difficulty
            }
            // Guard against the degenerate op (both coefficients zero can't happen here,
            // since each is non-zero, but keep the explicit check the spec asks for).
            if p == 0 && q == 0 { return nil }

            let operands = (0..<params.chainLength).map { _ in rng.int(in: params.operandRange) }
            var acc = operands[0]
            for i in 1..<operands.count {
                acc = p * acc + q * operands[i] + r
            }
            guard abs(acc) <= params.resultCap else { return nil } // stays in a sane range

            let score = Self.difficultyScore(params: params, commutative: p == q)
            return CustomOperatorItem(
                p: p, q: q, r: r,
                operands: operands,
                answer: acc,
                predictedDifficulty: score
            )
        }
    }

    /// A non-zero coefficient in `[-magnitude, magnitude]`.
    static func nonZeroCoefficient(magnitude: Int, rng: inout SplitMix64) -> Int {
        var value = 0
        while value == 0 {
            value = rng.int(in: -magnitude...magnitude)
        }
        return value
    }

    static func difficultyScore(params: Params, commutative: Bool) -> Double {
        var score = 1.0
        score += Double(params.coefficientMagnitude) * 0.6
        score += Double(params.chainLength) * 1.0
        if !commutative { score += 1.5 } // tracking order is the hard part
        return min(10.0, max(0.0, score))
    }
}

/// A generated custom-operator item.
public struct CustomOperatorItem: MathItem {
    public let id: UUID
    public let predictedDifficulty: Double
    public let p: Int
    public let q: Int
    public let r: Int
    public let operands: [Int]
    public let answer: Int

    public var kind: MathItemKind { .customOperator }
    public var answerFormat: AnswerFormat { .numeric }

    init(p: Int, q: Int, r: Int, operands: [Int], answer: Int, predictedDifficulty: Double) {
        self.p = p
        self.q = q
        self.r = r
        self.operands = operands
        self.answer = answer
        self.predictedDifficulty = predictedDifficulty
        self.id = deterministicUUID(
            contentHash: stableHash([p, q, r] + operands + [answer]),
            salt: MathItemKind.customOperator.idSalt
        )
    }

    /// The operator definition, e.g. `a ⊕ b = 2a + 2b + 1`.
    public var definition: String {
        func term(_ coefficient: Int, _ symbol: String) -> String {
            if coefficient == 1 { return symbol }
            if coefficient == -1 { return "−\(symbol)" }
            return "\(coefficient)\(symbol)"
        }
        var parts = [term(p, "a"), signed(q, "b")]
        if r != 0 { parts.append(r > 0 ? "+ \(r)" : "− \(abs(r))") }
        return "a ⊕ b = " + parts.joined(separator: " ")
    }

    private func signed(_ coefficient: Int, _ symbol: String) -> String {
        if coefficient >= 0 { return "+ \(coefficient == 1 ? symbol : "\(coefficient)\(symbol)")" }
        return "− \(coefficient == -1 ? symbol : "\(abs(coefficient))\(symbol)")"
    }

    public var prompt: String {
        let chain = operands.map(String.init).joined(separator: " ⊕ ")
        return "\(definition). Compute \(chain)."
    }

    public func validate(_ response: Response) -> Bool {
        guard case let .number(n) = response else { return false }
        return n == answer
    }
}
