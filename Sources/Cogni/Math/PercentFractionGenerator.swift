import Foundation

/// Percent and fraction fluency: `18% of 250`, `3/8 as a decimal`, or a chained
/// discount-then-tip. All arithmetic is exact `Rational` — the answer is never a
/// rounded float.
public struct PercentFractionGenerator: MathItemGenerator {
    public static let kind: MathItemKind = .percentFraction

    public init() {}

    public enum Variant: String, Codable, Sendable {
        case percentOf
        case fractionToDecimal
        case chainedPercent
    }

    struct Params {
        let variants: [Variant]
        let percents: [Int]
        let baseRange: ClosedRange<Int>
        let baseStep: Int            // 10/50 → round base, 1 → arbitrary
        let denominators: [Int]
    }

    /// Difficulty → parameter table. Round bases and terminating fractions are easy;
    /// arbitrary bases, awkward denominators, and chained operations are hard.
    static func params(for difficulty: Int) -> Params {
        switch clampDifficulty(difficulty) {
        case 1: return Params(variants: [.percentOf], percents: [10, 25, 50], baseRange: 20...200, baseStep: 10, denominators: [2, 4, 5, 10])
        case 2: return Params(variants: [.percentOf], percents: [10, 20, 25, 50, 75], baseRange: 20...300, baseStep: 10, denominators: [2, 4, 5, 10])
        case 3: return Params(variants: [.percentOf, .fractionToDecimal], percents: [5, 15, 20, 30, 40], baseRange: 20...300, baseStep: 5, denominators: [2, 4, 5, 8, 10])
        case 4: return Params(variants: [.percentOf, .fractionToDecimal], percents: [12, 18, 35, 60], baseRange: 30...400, baseStep: 1, denominators: [2, 4, 5, 8, 10, 20])
        case 5: return Params(variants: [.percentOf, .fractionToDecimal], percents: [8, 22, 45, 65, 90], baseRange: 30...500, baseStep: 1, denominators: [3, 6, 8, 16, 25])
        case 6: return Params(variants: [.chainedPercent, .percentOf], percents: [10, 15, 20, 25], baseRange: 50...500, baseStep: 5, denominators: [3, 7, 8, 16])
        case 7: return Params(variants: [.chainedPercent, .fractionToDecimal], percents: [12, 15, 18, 22], baseRange: 50...600, baseStep: 1, denominators: [7, 9, 11, 16])
        case 8: return Params(variants: [.chainedPercent, .fractionToDecimal], percents: [8, 13, 17, 23], baseRange: 80...800, baseStep: 1, denominators: [7, 9, 12, 13])
        case 9: return Params(variants: [.chainedPercent], percents: [11, 14, 19, 27], baseRange: 100...900, baseStep: 1, denominators: [7, 11, 13, 17])
        default: return Params(variants: [.chainedPercent], percents: [13, 17, 24, 33], baseRange: 100...1000, baseStep: 1, denominators: [7, 11, 13, 17, 19])
        }
    }

    public func generate(difficulty: Int, using rng: inout SplitMix64) throws -> PercentFractionItem {
        let d = clampDifficulty(difficulty)
        let params = Self.params(for: d)
        return try generateWithRetry(kind: .percentFraction, using: &rng) { rng in
            switch rng.element(of: params.variants) {
            case .percentOf:
                let percent = rng.element(of: params.percents)
                let base = Self.drawBase(params: params, rng: &rng)
                guard percent != 0, percent != 100 else { return nil }
                let answer = Rational(base * percent, 100)
                let score = Self.difficultyScore(variant: .percentOf, base: base, roundBase: params.baseStep >= 5, denominator: 1)
                return PercentFractionItem(variant: .percentOf, base: base, percent: percent,
                                           secondPercent: nil, numerator: nil, denominator: nil,
                                           answer: answer, predictedDifficulty: score)

            case .fractionToDecimal:
                let denominator = rng.element(of: params.denominators)
                let numerator = rng.int(in: 1...(denominator - 1))
                guard numerator != 0 else { return nil }
                let answer = Rational(numerator, denominator)
                // Reject if it reduces to a whole number (trivial).
                guard !answer.isInteger else { return nil }
                let score = Self.difficultyScore(variant: .fractionToDecimal, base: 0, roundBase: false, denominator: denominator)
                return PercentFractionItem(variant: .fractionToDecimal, base: nil, percent: nil,
                                           secondPercent: nil, numerator: numerator, denominator: denominator,
                                           answer: answer, predictedDifficulty: score)

            case .chainedPercent:
                let discount = rng.element(of: params.percents)
                let tip = rng.element(of: params.percents)
                let base = Self.drawBase(params: params, rng: &rng)
                guard discount != 0, discount != 100 else { return nil }
                // Price after a discount, then a tip on the discounted price.
                let afterDiscount = Rational(base * (100 - discount), 100)
                let answer = afterDiscount * Rational(100 + tip, 100)
                let score = Self.difficultyScore(variant: .chainedPercent, base: base, roundBase: params.baseStep >= 5, denominator: 1)
                return PercentFractionItem(variant: .chainedPercent, base: base, percent: discount,
                                           secondPercent: tip, numerator: nil, denominator: nil,
                                           answer: answer, predictedDifficulty: score)
            }
        }
    }

    static func drawBase(params: Params, rng: inout SplitMix64) -> Int {
        let step = max(1, params.baseStep)
        let low = (params.baseRange.lowerBound + step - 1) / step
        let high = params.baseRange.upperBound / step
        return rng.int(in: low...high) * step
    }

    static func difficultyScore(variant: Variant, base: Int, roundBase: Bool, denominator: Int) -> Double {
        var score = 1.5
        switch variant {
        case .percentOf:
            score += roundBase ? 0.5 : 2.0
            score += min(1.5, Double(base) / 500.0 * 1.5)
        case .fractionToDecimal:
            score += 2.0
            // Non-terminating (denominator with prime factors other than 2 and 5) is harder.
            score += PercentFractionGenerator.isTerminating(denominator) ? 0.5 : 2.5
        case .chainedPercent:
            score += 4.0
            score += min(2.0, Double(base) / 500.0 * 2.0)
        }
        return min(10.0, max(0.0, score))
    }

    /// Whether `1/denominator` has a terminating decimal (only factors of 2 and 5).
    static func isTerminating(_ denominator: Int) -> Bool {
        var d = denominator
        while d % 2 == 0 { d /= 2 }
        while d % 5 == 0 { d /= 5 }
        return d == 1
    }
}

/// A generated percent/fraction item. The exact answer is a `Rational`; the UI decides
/// how to render (whole, decimal, or currency).
public struct PercentFractionItem: MathItem {
    public let id: UUID
    public let predictedDifficulty: Double
    public let variant: PercentFractionGenerator.Variant
    public let base: Int?
    public let percent: Int?
    public let secondPercent: Int?
    public let numerator: Int?
    public let denominator: Int?
    public let answer: Rational

    public var kind: MathItemKind { .percentFraction }
    public var answerFormat: AnswerFormat { .numeric }

    init(variant: PercentFractionGenerator.Variant, base: Int?, percent: Int?, secondPercent: Int?,
         numerator: Int?, denominator: Int?, answer: Rational, predictedDifficulty: Double) {
        self.variant = variant
        self.base = base
        self.percent = percent
        self.secondPercent = secondPercent
        self.numerator = numerator
        self.denominator = denominator
        self.answer = answer
        self.predictedDifficulty = predictedDifficulty
        self.id = deterministicUUID(
            contentHash: stableHash([base ?? -1, percent ?? -1, secondPercent ?? -1,
                                     numerator ?? -1, denominator ?? -1,
                                     answer.numerator, answer.denominator]),
            salt: MathItemKind.percentFraction.idSalt
        )
    }

    public var prompt: String {
        switch variant {
        case .percentOf:
            return "\(percent ?? 0)% of \(base ?? 0)?"
        case .fractionToDecimal:
            return "\(numerator ?? 0)/\(denominator ?? 1) as a decimal?"
        case .chainedPercent:
            return "A \(base ?? 0) item, \(percent ?? 0)% off, then a \(secondPercent ?? 0)% tip. Final total?"
        }
    }

    public func validate(_ response: Response) -> Bool {
        switch response {
        case .rational(let r):
            return r == answer
        case .number(let n):
            return Rational(n) == answer
        default:
            return false
        }
    }
}
