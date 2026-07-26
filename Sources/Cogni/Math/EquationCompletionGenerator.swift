import Foundation

/// Fill the blanks in an equation: either the operators (`7 _ 3 _ 2 = 23`) or a single
/// operand (`6 × _ − 4 = 32`). The complete valid equation is generated first, then
/// blanked; the item ships only if the blanked form has exactly one solution, checked
/// by brute force over every assignment.
public struct EquationCompletionGenerator: MathItemGenerator {
    public static let kind: MathItemKind = .equationCompletion

    public init() {}

    public enum Blank: Equatable, Codable, Sendable {
        case operators              // every operator is hidden
        case operand(index: Int)    // one term is hidden
    }

    struct Params {
        let termCount: Int
        let operandRange: ClosedRange<Int>
        let operatorSet: [ArithmeticOp]
        let operandBlankProbability: Double
    }

    /// Difficulty → parameter table.
    static func params(for difficulty: Int) -> Params {
        switch clampDifficulty(difficulty) {
        case 1: return Params(termCount: 3, operandRange: 1...9, operatorSet: [.add, .subtract], operandBlankProbability: 0.3)
        case 2: return Params(termCount: 3, operandRange: 1...9, operatorSet: [.add, .subtract], operandBlankProbability: 0.35)
        case 3: return Params(termCount: 3, operandRange: 1...9, operatorSet: [.add, .subtract, .multiply], operandBlankProbability: 0.4)
        case 4: return Params(termCount: 3, operandRange: 1...12, operatorSet: [.add, .subtract, .multiply], operandBlankProbability: 0.4)
        case 5: return Params(termCount: 4, operandRange: 1...9, operatorSet: [.add, .subtract, .multiply], operandBlankProbability: 0.4)
        case 6: return Params(termCount: 4, operandRange: 1...12, operatorSet: [.add, .subtract, .multiply], operandBlankProbability: 0.45)
        case 7: return Params(termCount: 4, operandRange: 1...12, operatorSet: [.add, .subtract, .multiply, .divide], operandBlankProbability: 0.45)
        case 8: return Params(termCount: 4, operandRange: 2...15, operatorSet: [.add, .subtract, .multiply, .divide], operandBlankProbability: 0.5)
        case 9: return Params(termCount: 5, operandRange: 1...12, operatorSet: [.add, .subtract, .multiply, .divide], operandBlankProbability: 0.5)
        default: return Params(termCount: 5, operandRange: 2...15, operatorSet: [.add, .subtract, .multiply, .divide], operandBlankProbability: 0.5)
        }
    }

    public func generate(difficulty: Int, using rng: inout SplitMix64) throws -> EquationCompletionItem {
        let d = clampDifficulty(difficulty)
        let params = Self.params(for: d)
        return try generateWithRetry(kind: .equationCompletion, using: &rng) { rng in
            let terms = (0..<params.termCount).map { _ in rng.int(in: params.operandRange) }
            let operators = (0..<(params.termCount - 1)).map { _ in rng.element(of: params.operatorSet) }

            // The complete equation must have an exact integer value.
            guard let value = evaluateSequence(values: terms.map { Rational($0) }, operators: operators),
                  let result = value.integerValue else { return nil }

            let blankOperand = rng.next() < UInt64(params.operandBlankProbability * Double(UInt64.max))
            let blank: Blank = blankOperand ? .operand(index: rng.int(in: 0..<params.termCount)) : .operators

            guard Self.hasUniqueSolution(terms: terms, operators: operators, result: result,
                                         blank: blank, params: params) else { return nil }

            let score = Self.difficultyScore(termCount: params.termCount, operatorSet: params.operatorSet, blank: blank)
            return EquationCompletionItem(
                terms: terms,
                operators: operators,
                result: result,
                blank: blank,
                predictedDifficulty: score
            )
        }
    }

    /// Wide integer band used to prove operand-blank uniqueness against free entry.
    static let operandSearchRange = -99...999

    /// Exactly one assignment of the blank reproduces `result`.
    static func hasUniqueSolution(terms: [Int], operators: [ArithmeticOp], result: Int,
                                  blank: Blank, params: Params) -> Bool {
        switch blank {
        case .operators:
            var solutions = 0
            for assignment in operatorAssignments(count: operators.count, from: params.operatorSet) {
                if let v = evaluateSequence(values: terms.map { Rational($0) }, operators: assignment),
                   v == Rational(result) {
                    solutions += 1
                    if solutions > 1 { return false }
                }
            }
            return solutions == 1
        case .operand(let index):
            // The answer field is free-entry, so uniqueness must hold over a wide band,
            // not just the generation range — this rejects ambiguous shapes like
            // `_ × 0 + 5 = 5` where any operand works.
            var solutions = 0
            for candidate in operandSearchRange {
                var trial = terms
                trial[index] = candidate
                if let v = evaluateSequence(values: trial.map { Rational($0) }, operators: operators),
                   v == Rational(result) {
                    solutions += 1
                    if solutions > 1 { return false }
                }
            }
            return solutions == 1
        }
    }

    /// The Cartesian product of the operator set, `count` positions wide.
    static func operatorAssignments(count: Int, from set: [ArithmeticOp]) -> [[ArithmeticOp]] {
        guard count > 0 else { return [[]] }
        var result: [[ArithmeticOp]] = [[]]
        for _ in 0..<count {
            var next: [[ArithmeticOp]] = []
            for prefix in result {
                for op in set {
                    next.append(prefix + [op])
                }
            }
            result = next
        }
        return result
    }

    static func difficultyScore(termCount: Int, operatorSet: [ArithmeticOp], blank: Blank) -> Double {
        var score = Double(termCount) * 1.1
        score += Double(operatorSet.count) * 0.6
        if case .operators = blank { score += 1.0 } // guessing operators is a bit harder
        return min(10.0, max(0.0, score))
    }
}

/// A generated equation-completion item.
public struct EquationCompletionItem: MathItem {
    public let id: UUID
    public let predictedDifficulty: Double
    public let terms: [Int]
    public let operators: [ArithmeticOp]
    public let result: Int
    public let blank: EquationCompletionGenerator.Blank

    public var kind: MathItemKind { .equationCompletion }
    public var answerFormat: AnswerFormat {
        if case .operators = blank { return .operatorSequence }
        return .numeric
    }

    init(terms: [Int], operators: [ArithmeticOp], result: Int,
         blank: EquationCompletionGenerator.Blank, predictedDifficulty: Double) {
        self.terms = terms
        self.operators = operators
        self.result = result
        self.blank = blank
        self.predictedDifficulty = predictedDifficulty
        let blankTag: Int
        switch blank {
        case .operators: blankTag = -1
        case .operand(let i): blankTag = i
        }
        self.id = deterministicUUID(
            contentHash: stableHash(terms + operators.map { Int($0.rawValue.unicodeScalars.first!.value) } + [result, blankTag]),
            salt: MathItemKind.equationCompletion.idSalt
        )
    }

    public var prompt: String {
        var pieces: [String] = []
        for (i, term) in terms.enumerated() {
            if case .operand(let blankIndex) = blank, blankIndex == i {
                pieces.append("_")
            } else {
                pieces.append(String(term))
            }
            if i < operators.count {
                if case .operators = blank {
                    pieces.append("_")
                } else {
                    pieces.append(operators[i].rawValue)
                }
            }
        }
        return "\(pieces.joined(separator: " ")) = \(result)"
    }

    public func validate(_ response: Response) -> Bool {
        switch blank {
        case .operators:
            guard case let .operators(strings) = response else { return false }
            return strings == operators.map { $0.rawValue }
        case .operand(let index):
            guard case let .number(n) = response else { return false }
            return n == terms[index]
        }
    }
}
