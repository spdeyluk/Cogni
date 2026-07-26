import Foundation

/// Multiple choice: "Closest to 4,800: 61×79 / 47×103 / 72×68". The correct option is
/// within a tight tolerance of the target and every distractor is a floor distance
/// away — that gap is exactly what makes magnitude reasoning sufficient and exact
/// multiplication unnecessary. The gap tightens with difficulty, floored at 8%.
///
/// All separation thresholds are integer per-mille (‰) and compared with exact integer
/// cross-multiplication — no floating point, so a value never sits ambiguously on a
/// boundary the way a `Double` ratio could.
public struct EstimationGenerator: MathItemGenerator {
    public static let kind: MathItemKind = .estimation

    public init() {}

    struct Params {
        let targetRange: ClosedRange<Int>
        let factorRange: ClosedRange<Int>
        let optionCount: Int
        let correctTolerancePermille: Int      // correct option must be within this ‰
        let distractorMinPermille: Int         // every distractor at least this ‰ away
    }

    static let distractorMaxPermille = 600     // keep distractors plausibly close (≤60%)

    /// Difficulty → parameter table. Distractor separation shrinks from 150‰ (15%) to
    /// an 80‰ (8%) floor as difficulty rises; the correct tolerance stays at 50‰ (5%).
    static func params(for difficulty: Int) -> Params {
        let d = clampDifficulty(difficulty)
        let separation = max(80, 150 - (d - 1) * 8)   // 150‰ → 80‰
        let optionCount = d >= 6 ? 4 : 3
        let tolerance = 50
        switch d {
        case 1: return Params(targetRange: 150...1200, factorRange: 5...30, optionCount: optionCount, correctTolerancePermille: tolerance, distractorMinPermille: separation)
        case 2: return Params(targetRange: 200...1600, factorRange: 6...35, optionCount: optionCount, correctTolerancePermille: tolerance, distractorMinPermille: separation)
        case 3: return Params(targetRange: 300...2200, factorRange: 8...45, optionCount: optionCount, correctTolerancePermille: tolerance, distractorMinPermille: separation)
        case 4: return Params(targetRange: 500...3000, factorRange: 10...55, optionCount: optionCount, correctTolerancePermille: tolerance, distractorMinPermille: separation)
        case 5: return Params(targetRange: 800...4000, factorRange: 15...65, optionCount: optionCount, correctTolerancePermille: tolerance, distractorMinPermille: separation)
        case 6: return Params(targetRange: 1000...5000, factorRange: 18...75, optionCount: optionCount, correctTolerancePermille: tolerance, distractorMinPermille: separation)
        case 7: return Params(targetRange: 1500...6000, factorRange: 22...85, optionCount: optionCount, correctTolerancePermille: tolerance, distractorMinPermille: separation)
        case 8: return Params(targetRange: 2000...7500, factorRange: 25...95, optionCount: optionCount, correctTolerancePermille: tolerance, distractorMinPermille: separation)
        case 9: return Params(targetRange: 2500...8500, factorRange: 30...99, optionCount: optionCount, correctTolerancePermille: tolerance, distractorMinPermille: separation)
        default: return Params(targetRange: 3000...9000, factorRange: 35...99, optionCount: optionCount, correctTolerancePermille: tolerance, distractorMinPermille: separation)
        }
    }

    public func generate(difficulty: Int, using rng: inout SplitMix64) throws -> EstimationItem {
        let d = clampDifficulty(difficulty)
        let params = Self.params(for: d)
        return try generateWithRetry(kind: .estimation, using: &rng) { rng in
            let target = rng.int(in: params.targetRange)

            // The correct option: a product within the tight tolerance of the target.
            guard let correct = Self.findProduct(near: target,
                                                 withinPermille: params.correctTolerancePermille,
                                                 factorRange: params.factorRange, rng: &rng) else {
                return nil
            }

            // Distractors: each at least the floor separation from the target, distinct.
            var options = [correct]
            var attempts = 0
            while options.count < params.optionCount && attempts < 500 {
                attempts += 1
                let a = rng.int(in: params.factorRange)
                let b = rng.int(in: params.factorRange)
                let value = a * b
                let deviation = abs(value - target) * 1000
                guard deviation >= target * params.distractorMinPermille,
                      deviation <= target * Self.distractorMaxPermille else { continue }
                if options.contains(where: { $0.value == value }) { continue }
                options.append(EstimationOption(a: a, b: b, value: value))
            }
            guard options.count == params.optionCount else { return nil }

            rng.shuffle(&options)
            guard let correctIndex = options.firstIndex(where: {
                $0.a == correct.a && $0.b == correct.b && $0.value == correct.value
            }) else { return nil }

            let score = Self.difficultyScore(params: params, target: target)
            return EstimationItem(
                target: target,
                options: options,
                correctIndex: correctIndex,
                correctTolerancePermille: params.correctTolerancePermille,
                distractorMinPermille: params.distractorMinPermille,
                predictedDifficulty: score
            )
        }
    }

    /// Searches the factor grid for a product within `withinPermille` of the target.
    static func findProduct(near target: Int, withinPermille tolerance: Int,
                            factorRange: ClosedRange<Int>, rng: inout SplitMix64) -> EstimationOption? {
        var attempts = 0
        while attempts < 300 {
            attempts += 1
            let a = rng.int(in: factorRange)
            let ideal = max(factorRange.lowerBound, min(factorRange.upperBound, (target + a / 2) / a))
            let b = min(factorRange.upperBound, max(factorRange.lowerBound, ideal + rng.int(in: -2...2)))
            let value = a * b
            if abs(value - target) * 1000 <= target * tolerance {
                return EstimationOption(a: a, b: b, value: value)
            }
        }
        return nil
    }

    static func difficultyScore(params: Params, target: Int) -> Double {
        var score = 2.0
        // Tighter separation → harder. Range is 80‰...150‰.
        score += Double(150 - params.distractorMinPermille) / 70.0 * 3.5
        score += min(2.5, Double(target) / 4000.0 * 2.5)
        if params.optionCount == 4 { score += 0.6 }
        return min(10.0, max(0.0, score))
    }
}

/// One estimation option: a product shown as `a × b`.
public struct EstimationOption: Equatable, Codable, Sendable {
    public let a: Int
    public let b: Int
    public let value: Int

    public var label: String { "\(a) × \(b)" }
}

/// A generated estimation item.
public struct EstimationItem: MathItem {
    public let id: UUID
    public let predictedDifficulty: Double
    public let target: Int
    public let options: [EstimationOption]
    public let correctIndex: Int
    public let correctTolerancePermille: Int
    public let distractorMinPermille: Int

    public var kind: MathItemKind { .estimation }
    public var answerFormat: AnswerFormat { .multipleChoice(options.map(\.label)) }

    init(target: Int, options: [EstimationOption], correctIndex: Int,
         correctTolerancePermille: Int, distractorMinPermille: Int, predictedDifficulty: Double) {
        self.target = target
        self.options = options
        self.correctIndex = correctIndex
        self.correctTolerancePermille = correctTolerancePermille
        self.distractorMinPermille = distractorMinPermille
        self.predictedDifficulty = predictedDifficulty
        self.id = deterministicUUID(
            contentHash: stableHash([target, correctIndex] + options.flatMap { [$0.a, $0.b] }),
            salt: MathItemKind.estimation.idSalt
        )
    }

    public var prompt: String {
        let list = options.map(\.label).joined(separator: " / ")
        return "Closest to \(target): \(list)"
    }

    public func validate(_ response: Response) -> Bool {
        guard case let .choice(index) = response else { return false }
        return index == correctIndex
    }
}
