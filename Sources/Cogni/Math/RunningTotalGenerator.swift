import Foundation

/// A chain of signed deltas revealed one at a time; the player answers the final total
/// only at the end (a working-memory load). The per-step display interval is a first-
/// class parameter and is emitted in telemetry.
public struct RunningTotalGenerator: MathItemGenerator {
    public static let kind: MathItemKind = .runningTotal

    public init() {}

    struct Params {
        let chainLength: Int
        let maxStepMagnitude: Int
        let negativeProbability: Double
        let displayIntervalMs: Int
        let allowNegativeIntermediate: Bool
    }

    /// Difficulty → parameter table. Longer chains, bigger steps, more negatives, and a
    /// shorter display interval all raise difficulty; negative intermediate totals are
    /// only permitted at the top of the band.
    static func params(for difficulty: Int) -> Params {
        let d = clampDifficulty(difficulty)
        switch d {
        case 1: return Params(chainLength: 3, maxStepMagnitude: 5, negativeProbability: 0.15, displayIntervalMs: 1500, allowNegativeIntermediate: false)
        case 2: return Params(chainLength: 4, maxStepMagnitude: 6, negativeProbability: 0.2, displayIntervalMs: 1400, allowNegativeIntermediate: false)
        case 3: return Params(chainLength: 4, maxStepMagnitude: 8, negativeProbability: 0.25, displayIntervalMs: 1300, allowNegativeIntermediate: false)
        case 4: return Params(chainLength: 5, maxStepMagnitude: 9, negativeProbability: 0.3, displayIntervalMs: 1200, allowNegativeIntermediate: false)
        case 5: return Params(chainLength: 5, maxStepMagnitude: 12, negativeProbability: 0.35, displayIntervalMs: 1050, allowNegativeIntermediate: false)
        case 6: return Params(chainLength: 6, maxStepMagnitude: 15, negativeProbability: 0.4, displayIntervalMs: 900, allowNegativeIntermediate: false)
        case 7: return Params(chainLength: 7, maxStepMagnitude: 18, negativeProbability: 0.45, displayIntervalMs: 800, allowNegativeIntermediate: false)
        case 8: return Params(chainLength: 7, maxStepMagnitude: 22, negativeProbability: 0.5, displayIntervalMs: 700, allowNegativeIntermediate: true)
        case 9: return Params(chainLength: 8, maxStepMagnitude: 26, negativeProbability: 0.5, displayIntervalMs: 600, allowNegativeIntermediate: true)
        default: return Params(chainLength: 9, maxStepMagnitude: 30, negativeProbability: 0.55, displayIntervalMs: 500, allowNegativeIntermediate: true)
        }
    }

    public func generate(difficulty: Int, using rng: inout SplitMix64) throws -> RunningTotalItem {
        let d = clampDifficulty(difficulty)
        let params = Self.params(for: d)
        return try generateWithRetry(kind: .runningTotal, using: &rng) { rng in
            var deltas: [Int] = []
            var runningTotals: [Int] = []
            var total = 0
            for step in 0..<params.chainLength {
                let magnitude = rng.int(in: 1...params.maxStepMagnitude)
                // First step is always positive so the chain starts above zero.
                let negative = step > 0 && rng.next() < UInt64(params.negativeProbability * Double(UInt64.max))
                let delta = negative ? -magnitude : magnitude
                total += delta
                if !params.allowNegativeIntermediate && total < 0 {
                    return nil // reject: an intermediate total dipped negative
                }
                deltas.append(delta)
                runningTotals.append(total)
            }
            let finalTotal = total

            // Not trivially guessable from the first or last term shown.
            guard finalTotal != deltas.first,
                  finalTotal != deltas.last,
                  abs(finalTotal) != abs(deltas.last ?? 0) else { return nil }

            let score = Self.difficultyScore(params: params, deltas: deltas)
            return RunningTotalItem(
                deltas: deltas,
                finalTotal: finalTotal,
                displayIntervalMs: params.displayIntervalMs,
                predictedDifficulty: score
            )
        }
    }

    static func difficultyScore(params: Params, deltas: [Int]) -> Double {
        let negativeCount = deltas.filter { $0 < 0 }.count
        let negativeFraction = Double(negativeCount) / Double(max(1, deltas.count))
        var score = Double(params.chainLength) * 0.55
        score += Double(params.maxStepMagnitude) * 0.04
        score += negativeFraction * 1.8
        score += (1500.0 - Double(params.displayIntervalMs)) / 1000.0 * 1.2 // faster → harder
        return min(10.0, max(0.0, score))
    }
}

/// A generated running-total item. Deltas are shown one at a time in the UI at
/// `displayIntervalMs`; only the final total is answered.
public struct RunningTotalItem: MathItem {
    public let id: UUID
    public let predictedDifficulty: Double
    public let deltas: [Int]
    public let finalTotal: Int
    public let displayIntervalMs: Int

    public var kind: MathItemKind { .runningTotal }
    public var answerFormat: AnswerFormat { .numeric }

    init(deltas: [Int], finalTotal: Int, displayIntervalMs: Int, predictedDifficulty: Double) {
        self.deltas = deltas
        self.finalTotal = finalTotal
        self.displayIntervalMs = displayIntervalMs
        self.predictedDifficulty = predictedDifficulty
        self.id = deterministicUUID(
            contentHash: stableHash(deltas + [finalTotal, displayIntervalMs]),
            salt: MathItemKind.runningTotal.idSalt
        )
    }

    public var prompt: String {
        let steps = deltas.map { $0 >= 0 ? "+\($0)" : "\($0)" }.joined(separator: ", ")
        return "Start at 0. \(steps). What is the total?"
    }

    public func validate(_ response: Response) -> Bool {
        guard case let .number(n) = response else { return false }
        return n == finalTotal
    }
}
