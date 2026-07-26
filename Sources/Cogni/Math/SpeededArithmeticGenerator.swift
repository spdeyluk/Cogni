import Foundation

/// A single arithmetic expression, answered by typing the result (or, in the verify
/// variant, judging a shown result true/false). Carry/borrow count is the primary
/// difficulty driver — operands are constructed column-by-column to hit an exact carry
/// count, weighted above raw magnitude.
public struct SpeededArithmeticGenerator: MathItemGenerator {
    public static let kind: MathItemKind = .speededArithmetic

    public init() {}

    struct Params {
        let digits: Int
        let carries: Int           // desired carries (add) / borrows (subtract)
        let operations: [ArithmeticOp]
        let verifyProbability: Double
    }

    /// Difficulty → parameter table. Carries scale ahead of digit count.
    static func params(for difficulty: Int) -> Params {
        switch clampDifficulty(difficulty) {
        case 1: return Params(digits: 1, carries: 0, operations: [.add, .subtract], verifyProbability: 0.0)
        case 2: return Params(digits: 1, carries: 1, operations: [.add, .subtract], verifyProbability: 0.3)
        case 3: return Params(digits: 2, carries: 1, operations: [.add, .subtract], verifyProbability: 0.3)
        case 4: return Params(digits: 2, carries: 2, operations: [.add, .subtract], verifyProbability: 0.35)
        case 5: return Params(digits: 2, carries: 2, operations: [.add, .subtract, .multiply], verifyProbability: 0.35)
        case 6: return Params(digits: 3, carries: 2, operations: [.add, .subtract], verifyProbability: 0.4)
        case 7: return Params(digits: 3, carries: 3, operations: [.add, .subtract], verifyProbability: 0.4)
        case 8: return Params(digits: 3, carries: 3, operations: [.add, .subtract, .multiply], verifyProbability: 0.4)
        case 9: return Params(digits: 3, carries: 3, operations: [.add, .subtract, .multiply], verifyProbability: 0.45)
        default: return Params(digits: 3, carries: 3, operations: [.add, .subtract, .multiply], verifyProbability: 0.45)
        }
    }

    public func generate(difficulty: Int, using rng: inout SplitMix64) throws -> SpeededArithmeticItem {
        let d = clampDifficulty(difficulty)
        let params = Self.params(for: d)
        return try generateWithRetry(kind: .speededArithmetic, using: &rng) { rng in
            let op = rng.element(of: params.operations)
            guard let (a, b, answer, effectiveCarries) = Self.makeOperands(op: op, params: params, rng: &rng) else {
                return nil
            }

            let isVerify = rng.next() < UInt64(params.verifyProbability * Double(UInt64.max))
            var shown: Int?
            if isVerify {
                let showTrue = rng.bool()
                if showTrue {
                    shown = answer
                } else {
                    guard let wrong = Self.plausibleWrongAnswer(for: answer, a: a, b: b, op: op, rng: &rng) else {
                        return nil
                    }
                    shown = wrong
                }
            }

            let difficultyScore = Self.difficultyScore(op: op, digits: params.digits, carries: effectiveCarries, verify: isVerify)
            return SpeededArithmeticItem(
                operandA: a,
                operandB: b,
                operation: op,
                answer: answer,
                carries: effectiveCarries,
                shownAnswer: shown,
                predictedDifficulty: difficultyScore
            )
        }
    }

    // MARK: - Operand construction

    /// Builds `(a, b, answer, carries)` for the operation, or `nil` if this op cannot
    /// meet the requested carry count (caller retries with a different op draw).
    static func makeOperands(op: ArithmeticOp, params: Params, rng: inout SplitMix64) -> (Int, Int, Int, Int)? {
        switch op {
        case .add:
            let carries = min(params.carries, params.digits)
            guard let (a, b) = buildAddition(digits: params.digits, carries: carries, rng: &rng) else { return nil }
            return (a, b, a + b, carries)
        case .subtract:
            let borrows = min(params.carries, params.digits - 1)
            guard let (a, b) = buildSubtraction(digits: params.digits, borrows: borrows, rng: &rng) else { return nil }
            return (a, b, a - b, borrows)
        case .multiply:
            // A single-digit multiplier keeps the answer typeable; magnitude drives it.
            let a = rng.int(in: pow10(params.digits - 1)...(pow10(params.digits) - 1))
            let b = rng.int(in: 2...9)
            return (a, b, a * b, 0)
        case .divide:
            return nil // not used as a speeded prompt
        }
    }

    /// Two `digits`-digit numbers whose column addition carries exactly `carries` times.
    static func buildAddition(digits: Int, carries: Int, rng: inout SplitMix64) -> (Int, Int)? {
        guard carries <= digits else { return nil }
        var columns = Array(0..<digits)
        rng.shuffle(&columns)
        let carrySet = Set(columns.prefix(carries))

        var aDigits = [Int](repeating: 0, count: digits)
        var bDigits = [Int](repeating: 0, count: digits)
        var carryIn = 0
        for col in 0..<digits {
            let isTop = (col == digits - 1)
            let wantsCarry = carrySet.contains(col)
            let lowA = isTop ? 1 : 0
            var a = 0, b = 0
            if wantsCarry {
                // a + b + carryIn >= 10
                a = rng.int(in: max(lowA, 1)...9)
                let minB = max(isTop ? 1 : 0, 10 - carryIn - a)
                guard minB <= 9 else { return nil }
                b = rng.int(in: minB...9)
            } else {
                // a + b + carryIn <= 9
                let maxSum = 9 - carryIn
                let hiA = min(9, maxSum - (isTop ? 1 : 0))
                guard hiA >= lowA else { return nil }
                a = rng.int(in: lowA...hiA)
                let hiB = maxSum - a
                let lowB = isTop ? 1 : 0
                guard hiB >= lowB else { return nil }
                b = rng.int(in: lowB...hiB)
            }
            aDigits[col] = a
            bDigits[col] = b
            carryIn = (a + b + carryIn) >= 10 ? 1 : 0
        }
        return (fromDigits(aDigits), fromDigits(bDigits))
    }

    /// A minuend/subtrahend pair with exactly `borrows` borrows and a non-negative
    /// result. The top column never borrows, which guarantees `a >= b`.
    static func buildSubtraction(digits: Int, borrows: Int, rng: inout SplitMix64) -> (Int, Int)? {
        guard borrows <= digits - 1 else { return nil }
        var columns = Array(0..<(digits - 1)) // top column excluded — it must not borrow
        rng.shuffle(&columns)
        let borrowSet = Set(columns.prefix(borrows))

        var aDigits = [Int](repeating: 0, count: digits)
        var bDigits = [Int](repeating: 0, count: digits)
        var borrowIn = 0
        for col in 0..<digits {
            let isTop = (col == digits - 1)
            let wantsBorrow = borrowSet.contains(col)
            var a = 0, b = 0
            if isTop {
                // No borrow: a - borrowIn >= b, both >= 1.
                a = rng.int(in: 2...9)
                let hiB = a - borrowIn
                guard hiB >= 1 else { return nil }
                b = rng.int(in: 1...hiB)
            } else if wantsBorrow {
                // a - borrowIn < b  → borrow.
                a = rng.int(in: 0...8)
                let lowB = a - borrowIn + 1
                let clampedLowB = max(0, lowB)
                guard clampedLowB <= 9 else { return nil }
                b = rng.int(in: clampedLowB...9)
            } else {
                // a - borrowIn >= b, no borrow.
                a = rng.int(in: 0...9)
                let hiB = a - borrowIn
                guard hiB >= 0 else { return nil }
                b = rng.int(in: 0...hiB)
            }
            aDigits[col] = a
            bDigits[col] = b
            borrowIn = (a - borrowIn) < b ? 1 : 0
        }
        return (fromDigits(aDigits), fromDigits(bDigits))
    }

    // MARK: - Verify variant

    /// A wrong answer that resembles a real slip (off by a small amount, a carry-sized
    /// jump, or one operand), never a random number. Returns `nil` if it can't produce
    /// one distinct from the true answer.
    static func plausibleWrongAnswer(for answer: Int, a: Int, b: Int, op: ArithmeticOp, rng: inout SplitMix64) -> Int? {
        var deltas = [1, -1, 2, -2, 10, -10]
        if op == .multiply { deltas += [a, -a, b, -b] } // dropped/extra partial product
        rng.shuffle(&deltas)
        for delta in deltas {
            let candidate = answer + delta
            if candidate != answer && candidate >= 0 {
                return candidate
            }
        }
        return nil
    }

    // MARK: - Difficulty

    static func difficultyScore(op: ArithmeticOp, digits: Int, carries: Int, verify: Bool) -> Double {
        var score = 0.8 + Double(digits) * 0.7 + Double(carries) * 1.6 // carries weighted highest
        if op == .multiply { score += 1.8 }
        if verify { score += 0.4 }
        return min(10.0, max(0.0, score))
    }

    // MARK: - Digit helpers

    static func pow10(_ n: Int) -> Int {
        var result = 1
        for _ in 0..<n { result *= 10 }
        return result
    }

    /// Little-endian digit array → integer.
    static func fromDigits(_ digits: [Int]) -> Int {
        var value = 0
        for d in digits.reversed() { value = value * 10 + d }
        return value
    }
}

/// A generated speeded-arithmetic item. Either typed (`shownAnswer == nil`) or a
/// true/false verify prompt (`shownAnswer != nil`).
public struct SpeededArithmeticItem: MathItem {
    public let id: UUID
    public let predictedDifficulty: Double
    public let operandA: Int
    public let operandB: Int
    public let operation: ArithmeticOp
    public let answer: Int
    public let carries: Int
    public let shownAnswer: Int?

    public var kind: MathItemKind { .speededArithmetic }
    public var isVerify: Bool { shownAnswer != nil }
    public var answerFormat: AnswerFormat { isVerify ? .trueFalse : .numeric }

    init(operandA: Int, operandB: Int, operation: ArithmeticOp, answer: Int, carries: Int,
         shownAnswer: Int?, predictedDifficulty: Double) {
        self.operandA = operandA
        self.operandB = operandB
        self.operation = operation
        self.answer = answer
        self.carries = carries
        self.shownAnswer = shownAnswer
        self.predictedDifficulty = predictedDifficulty
        self.id = deterministicUUID(
            contentHash: stableHash([operandA, operandB, answer, shownAnswer ?? -1,
                                     Int(operation.rawValue.unicodeScalars.first!.value)]),
            salt: MathItemKind.speededArithmetic.idSalt
        )
    }

    public var prompt: String {
        if let shown = shownAnswer {
            return "\(operandA) \(operation.rawValue) \(operandB) = \(shown) — true or false?"
        }
        return "\(operandA) \(operation.rawValue) \(operandB) = ?"
    }

    public func validate(_ response: Response) -> Bool {
        if let shown = shownAnswer {
            guard case let .boolean(said) = response else { return false }
            return said == (shown == answer)
        }
        guard case let .number(n) = response else { return false }
        return n == answer
    }
}
