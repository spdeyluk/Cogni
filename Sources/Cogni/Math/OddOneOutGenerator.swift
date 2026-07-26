import Foundation

/// A number property an odd-one-out item can be built around.
public enum NumberProperty: Equatable, Hashable, Codable, Sendable {
    case prime
    case perfectSquare
    case powerOfTwo
    case palindrome
    case multipleOf(Int)
    case digitSumEquals(Int)

    public func holds(_ n: Int) -> Bool {
        switch self {
        case .prime:
            return NumberProperty.isPrime(n)
        case .perfectSquare:
            guard n >= 0 else { return false }
            let r = NumberProperty.isqrt(n)
            return r * r == n
        case .powerOfTwo:
            return n >= 1 && (n & (n - 1)) == 0
        case .palindrome:
            let s = Array(String(n))
            return n >= 10 && s == s.reversed()
        case .multipleOf(let k):
            return k != 0 && n % k == 0
        case .digitSumEquals(let s):
            return NumberProperty.digitSum(n) == s
        }
    }

    public var name: String {
        switch self {
        case .prime: return "prime"
        case .perfectSquare: return "perfect square"
        case .powerOfTwo: return "power of 2"
        case .palindrome: return "palindrome"
        case .multipleOf(let k): return "multiple of \(k)"
        case .digitSumEquals(let s): return "digit sum \(s)"
        }
    }

    static func isPrime(_ n: Int) -> Bool {
        guard n >= 2 else { return false }
        if n < 4 { return true }
        if n % 2 == 0 { return false }
        var i = 3
        while i * i <= n {
            if n % i == 0 { return false }
            i += 2
        }
        return true
    }

    static func digitSum(_ n: Int) -> Int {
        var v = abs(n)
        var sum = 0
        while v > 0 { sum += v % 10; v /= 10 }
        return sum
    }

    /// Integer square root (floor). Pure integer arithmetic — no floating point.
    static func isqrt(_ n: Int) -> Int {
        guard n > 0 else { return 0 }
        var x = n
        var y = (x + 1) / 2
        while y < x {
            x = y
            y = (x + n / x) / 2
        }
        return x
    }
}

/// Five numbers where exactly four share exactly one property and the fifth shares
/// none of it. Validity is the whole game here: every number is tested against every
/// property and the item is rejected if any second 4/1 grouping exists — the most
/// common way this item type silently breaks.
public struct OddOneOutGenerator: MathItemGenerator {
    public static let kind: MathItemKind = .oddOneOut

    public init() {}

    struct Params {
        let range: ClosedRange<Int>
        let targetProperties: [NumberProperty]
    }

    /// The full property set every candidate is tested against — the anti-ambiguity
    /// check runs over all of these regardless of which one an item is built around.
    static let fullPropertySet: [NumberProperty] = {
        var set: [NumberProperty] = [.prime, .perfectSquare, .powerOfTwo, .palindrome]
        set += [3, 4, 5, 6, 7, 8, 9, 11].map { NumberProperty.multipleOf($0) }
        set += (1...27).map { NumberProperty.digitSumEquals($0) }
        return set
    }()

    /// Difficulty → parameter table.
    static func params(for difficulty: Int) -> Params {
        switch clampDifficulty(difficulty) {
        case 1: return Params(range: 10...60, targetProperties: [.multipleOf(5), .multipleOf(3), .perfectSquare])
        case 2: return Params(range: 10...80, targetProperties: [.multipleOf(5), .multipleOf(3), .multipleOf(4), .perfectSquare])
        case 3: return Params(range: 10...99, targetProperties: [.multipleOf(3), .multipleOf(4), .multipleOf(6), .perfectSquare, .powerOfTwo])
        case 4: return Params(range: 12...120, targetProperties: [.multipleOf(4), .multipleOf(6), .perfectSquare, .powerOfTwo, .prime])
        case 5: return Params(range: 20...150, targetProperties: [.prime, .perfectSquare, .powerOfTwo, .multipleOf(7), .multipleOf(9)])
        case 6: return Params(range: 20...200, targetProperties: [.prime, .perfectSquare, .powerOfTwo, .palindrome, .multipleOf(7)])
        case 7: return Params(range: 40...300, targetProperties: [.prime, .perfectSquare, .powerOfTwo, .palindrome, .multipleOf(9)])
        case 8: return Params(range: 50...400, targetProperties: [.prime, .perfectSquare, .powerOfTwo, .palindrome, .digitSumEquals(0)])
        case 9: return Params(range: 100...600, targetProperties: [.prime, .perfectSquare, .powerOfTwo, .palindrome, .digitSumEquals(0)])
        default: return Params(range: 100...900, targetProperties: [.prime, .perfectSquare, .powerOfTwo, .palindrome, .digitSumEquals(0)])
        }
    }

    public func generate(difficulty: Int, using rng: inout SplitMix64) throws -> OddOneOutItem {
        let d = clampDifficulty(difficulty)
        let params = Self.params(for: d)
        return try generateWithRetry(kind: .oddOneOut, using: &rng) { rng in
            var property = rng.element(of: params.targetProperties)

            // digitSumEquals(0) is a placeholder — resolve it to a concrete digit sum
            // that actually has enough members in range.
            if case .digitSumEquals = property {
                guard let resolved = Self.resolvableDigitSum(in: params.range, rng: &rng) else { return nil }
                property = resolved
            }

            let pool = params.range.filter { property.holds($0) }
            let others = params.range.filter { !property.holds($0) }
            guard pool.count >= 4, others.count >= 1 else { return nil }

            let group = Array(rng.shuffled(pool).prefix(4))
            guard group.count == 4 else { return nil }
            let odd = rng.element(of: others)
            guard !group.contains(odd) else { return nil }

            var numbers = group + [odd]
            // Keep the odd's position deterministic-but-varied by shuffling the display.
            rng.shuffle(&numbers)
            guard Set(numbers).count == 5 else { return nil } // all distinct
            guard let oddIndex = numbers.firstIndex(of: odd) else { return nil }

            guard Self.isUnambiguous(numbers: numbers, property: property, oddIndex: oddIndex) else {
                return nil
            }

            let score = Self.difficultyScore(property: property, range: params.range)
            return OddOneOutItem(
                numbers: numbers,
                oddIndex: oddIndex,
                sharedProperty: property,
                predictedDifficulty: score
            )
        }
    }

    /// The core validity check. Returns true iff `property` is the *only* property with
    /// a 4/1 split, that split's odd-one is `oddIndex`, and the four group members share
    /// no other property.
    static func isUnambiguous(numbers: [Int], property: NumberProperty, oddIndex: Int) -> Bool {
        let groupIndices = numbers.indices.filter { $0 != oddIndex }

        // 1. All four group members satisfy the property; the odd one does not.
        guard groupIndices.allSatisfy({ property.holds(numbers[$0]) }),
              !property.holds(numbers[oddIndex]) else { return false }

        for candidate in fullPropertySet {
            let satisfyingIndices = numbers.indices.filter { candidate.holds(numbers[$0]) }

            // 2. The four share EXACTLY one property: no other property is common to all four.
            if candidate != property, groupIndices.allSatisfy({ candidate.holds(numbers[$0]) }) {
                return false
            }
            // 3. No second consistent 4/1 grouping: any property satisfied by exactly
            //    four numbers must leave out the same odd one.
            if satisfyingIndices.count == 4 {
                let missing = numbers.indices.first { !candidate.holds(numbers[$0]) }
                if missing != oddIndex { return false }
            }
        }
        return true
    }

    /// Picks a digit-sum value with at least four members in range.
    static func resolvableDigitSum(in range: ClosedRange<Int>, rng: inout SplitMix64) -> NumberProperty? {
        var counts: [Int: Int] = [:]
        for n in range { counts[NumberProperty.digitSum(n), default: 0] += 1 }
        let usable = counts.filter { $0.value >= 4 }.keys.sorted()
        guard !usable.isEmpty else { return nil }
        return .digitSumEquals(rng.element(of: usable))
    }

    static func difficultyScore(property: NumberProperty, range: ClosedRange<Int>) -> Double {
        var score = 2.0
        switch property {
        case .multipleOf: score += 1.0
        case .digitSumEquals: score += 2.5
        case .perfectSquare: score += 3.0
        case .powerOfTwo: score += 3.5
        case .prime: score += 3.5
        case .palindrome: score += 3.0
        }
        score += min(2.0, Double(range.upperBound) / 300.0 * 2.0)
        return min(10.0, max(0.0, score))
    }
}

/// A generated odd-one-out item.
public struct OddOneOutItem: MathItem {
    public let id: UUID
    public let predictedDifficulty: Double
    public let numbers: [Int]
    public let oddIndex: Int
    public let sharedProperty: NumberProperty

    public var kind: MathItemKind { .oddOneOut }
    public var answerFormat: AnswerFormat { .multipleChoice(numbers.map(String.init)) }

    init(numbers: [Int], oddIndex: Int, sharedProperty: NumberProperty, predictedDifficulty: Double) {
        self.numbers = numbers
        self.oddIndex = oddIndex
        self.sharedProperty = sharedProperty
        self.predictedDifficulty = predictedDifficulty
        self.id = deterministicUUID(
            contentHash: stableHash(numbers + [oddIndex]),
            salt: MathItemKind.oddOneOut.idSalt
        )
    }

    public var prompt: String {
        "Which is the odd one out? \(numbers.map(String.init).joined(separator: ", "))"
    }

    public func validate(_ response: Response) -> Bool {
        guard case let .choice(index) = response else { return false }
        return index == oddIndex
    }
}
