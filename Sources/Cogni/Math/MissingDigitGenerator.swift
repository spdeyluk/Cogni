import Foundation

/// Blank digits in a valid computation (`4_7 × 6 = 2_82`) and have the solver fill them
/// back in. Up to three blanks; the item ships only if the digit assignment is unique,
/// proven by brute force over 0–9 per blank. This is a slow/deductive item, not speeded.
public struct MissingDigitGenerator: MathItemGenerator {
    public static let kind: MathItemKind = .missingDigit

    public init() {}

    /// Where a blank sits: which component (a, b, or the result) and which digit index
    /// (0 = most significant).
    public struct Blank: Equatable, Codable, Sendable {
        public enum Component: Int, Codable, Sendable { case a = 0, b = 1, result = 2 }
        public let component: Component
        public let digitIndex: Int
    }

    struct Params {
        let operation: ArithmeticOp
        let aRange: ClosedRange<Int>
        let bRange: ClosedRange<Int>
        let maxBlanks: Int
    }

    /// Difficulty → parameter table. More blanks and bigger operands raise difficulty;
    /// blanks are capped at three.
    static func params(for difficulty: Int) -> Params {
        switch clampDifficulty(difficulty) {
        case 1: return Params(operation: .add, aRange: 10...99, bRange: 10...99, maxBlanks: 1)
        case 2: return Params(operation: .add, aRange: 10...99, bRange: 10...99, maxBlanks: 1)
        case 3: return Params(operation: .multiply, aRange: 10...99, bRange: 2...9, maxBlanks: 1)
        case 4: return Params(operation: .multiply, aRange: 10...99, bRange: 2...9, maxBlanks: 2)
        case 5: return Params(operation: .multiply, aRange: 10...99, bRange: 3...9, maxBlanks: 2)
        case 6: return Params(operation: .multiply, aRange: 100...999, bRange: 2...9, maxBlanks: 2)
        case 7: return Params(operation: .multiply, aRange: 100...999, bRange: 3...9, maxBlanks: 2)
        case 8: return Params(operation: .multiply, aRange: 100...999, bRange: 11...99, maxBlanks: 2)
        case 9: return Params(operation: .multiply, aRange: 100...999, bRange: 11...99, maxBlanks: 3)
        default: return Params(operation: .multiply, aRange: 100...999, bRange: 12...99, maxBlanks: 3)
        }
    }

    public func generate(difficulty: Int, using rng: inout SplitMix64) throws -> MissingDigitItem {
        let d = clampDifficulty(difficulty)
        let params = Self.params(for: d)
        return try generateWithRetry(kind: .missingDigit, using: &rng) { rng in
            let a = rng.int(in: params.aRange)
            let b = rng.int(in: params.bRange)
            guard let cRational = params.operation.apply(Rational(a), Rational(b)),
                  let c = cRational.integerValue, c >= 0 else { return nil }

            let digits: [Blank.Component: [Int]] = [
                .a: Self.digits(of: a),
                .b: Self.digits(of: b),
                .result: Self.digits(of: c)
            ]

            // Candidate blank positions across all three components.
            var positions: [Blank] = []
            for component in [Blank.Component.a, .b, .result] {
                let count = digits[component]!.count
                for index in 0..<count {
                    positions.append(Blank(component: component, digitIndex: index))
                }
            }
            let blankCount = rng.int(in: 1...params.maxBlanks)
            guard positions.count >= blankCount else { return nil }
            let blanks = Array(rng.shuffled(positions).prefix(blankCount))

            // No blank may sit on a leading digit of a multi-digit number — that would
            // admit leading-zero ambiguity.
            for blank in blanks {
                let count = digits[blank.component]!.count
                if count > 1 && blank.digitIndex == 0 { return nil }
            }

            guard Self.isUniqueAssignment(a: a, b: b, c: c, operation: params.operation,
                                          digits: digits, blanks: blanks) else { return nil }

            let hiddenDigits = blanks.map { digits[$0.component]![$0.digitIndex] }
            let score = Self.difficultyScore(blankCount: blankCount, operation: params.operation, a: a)
            return MissingDigitItem(
                a: a, b: b, result: c,
                operation: params.operation,
                blanks: blanks,
                hiddenDigits: hiddenDigits,
                predictedDifficulty: score
            )
        }
    }

    /// Exactly one filling of the blanks reproduces the computation. Brute force over
    /// 0–9 per blank, respecting the no-leading-zero rule.
    static func isUniqueAssignment(a: Int, b: Int, c: Int, operation: ArithmeticOp,
                                   digits: [Blank.Component: [Int]], blanks: [Blank]) -> Bool {
        let counts = [
            Blank.Component.a: digits[.a]!.count,
            .b: digits[.b]!.count,
            .result: digits[.result]!.count
        ]
        var solutions = 0
        var assignment = [Int](repeating: 0, count: blanks.count)

        func recurse(_ position: Int) -> Bool {
            if position == blanks.count {
                var working = digits
                for (i, blank) in blanks.enumerated() {
                    working[blank.component]![blank.digitIndex] = assignment[i]
                }
                let av = Self.value(working[.a]!)
                let bv = Self.value(working[.b]!)
                let cv = Self.value(working[.result]!)
                if let produced = operation.apply(Rational(av), Rational(bv)),
                   produced == Rational(cv) {
                    solutions += 1
                    if solutions > 1 { return false } // early out: not unique
                }
                return true
            }
            let blank = blanks[position]
            let isLeading = counts[blank.component]! > 1 && blank.digitIndex == 0
            for digit in (isLeading ? 1 : 0)...9 {
                assignment[position] = digit
                if !recurse(position + 1) { return false }
            }
            return true
        }
        _ = recurse(0)
        return solutions == 1
    }

    static func difficultyScore(blankCount: Int, operation: ArithmeticOp, a: Int) -> Double {
        var score = 2.0 + Double(blankCount) * 1.8      // blanks are the primary driver
        if operation == .multiply { score += 1.2 }
        score += min(1.5, Double(a) / 999.0 * 1.5)
        return min(10.0, max(0.0, score))
    }

    // MARK: - Digit helpers

    /// Big-endian digit array (most significant first).
    static func digits(of n: Int) -> [Int] {
        guard n != 0 else { return [0] }
        var v = abs(n)
        var out: [Int] = []
        while v > 0 { out.append(v % 10); v /= 10 }
        return out.reversed()
    }

    static func value(_ digits: [Int]) -> Int {
        digits.reduce(0) { $0 * 10 + $1 }
    }
}

/// A generated missing-digit item. Deductive, not speeded.
public struct MissingDigitItem: MathItem {
    public let id: UUID
    public let predictedDifficulty: Double
    public let a: Int
    public let b: Int
    public let result: Int
    public let operation: ArithmeticOp
    public let blanks: [MissingDigitGenerator.Blank]
    public let hiddenDigits: [Int]

    public var kind: MathItemKind { .missingDigit }
    public var answerFormat: AnswerFormat { .numeric }
    /// Flagged deductive so the scheduler can pace it as slow, not speeded.
    public var isDeductive: Bool { true }

    init(a: Int, b: Int, result: Int, operation: ArithmeticOp,
         blanks: [MissingDigitGenerator.Blank], hiddenDigits: [Int], predictedDifficulty: Double) {
        self.a = a
        self.b = b
        self.result = result
        self.operation = operation
        self.blanks = blanks
        self.hiddenDigits = hiddenDigits
        self.predictedDifficulty = predictedDifficulty
        self.id = deterministicUUID(
            contentHash: stableHash([a, b, result, Int(operation.rawValue.unicodeScalars.first!.value)]
                                    + blanks.flatMap { [$0.component.rawValue, $0.digitIndex] }),
            salt: MathItemKind.missingDigit.idSalt
        )
    }

    public var prompt: String {
        func render(_ n: Int, component: MissingDigitGenerator.Blank.Component) -> String {
            var chars = MissingDigitGenerator.digits(of: n).map(String.init)
            for blank in blanks where blank.component == component {
                chars[blank.digitIndex] = "_"
            }
            return chars.joined()
        }
        let av = render(a, component: .a)
        let bv = render(b, component: .b)
        let cv = render(result, component: .result)
        return "\(av) \(operation.rawValue) \(bv) = \(cv)"
    }

    public func validate(_ response: Response) -> Bool {
        guard case let .digits(filled) = response else { return false }
        return filled == hiddenDigits
    }
}
