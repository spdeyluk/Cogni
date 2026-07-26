import Foundation

/// A deterministic, ordered item list for 1v1 ranked play.
///
/// Both clients receive the same server-issued `matchSeed` and generate the identical
/// sequence offline — no per-item server round-trip. Only kinds that an off-screen
/// calculator can't shortcut are allowed: TargetNumber, RunningTotal, Estimation, and
/// OddOneOut. SpeededArithmetic and PercentFraction are excluded from ranked entirely.
public struct MatchItemSequence {
    /// The only kinds permitted in ranked play.
    public static let rankedKinds: [MathItemKind] = [
        .targetNumber, .runningTotal, .estimation, .oddOneOut
    ]

    public let matchSeed: UInt64
    public let difficulty: Int
    public let items: [AnyMathItem]

    public init(matchSeed: UInt64, difficulty: Int, count: Int) throws {
        precondition(count >= 0, "count must be non-negative")
        var rng = SplitMix64(seed: matchSeed)
        var generated: [AnyMathItem] = []
        generated.reserveCapacity(count)
        for _ in 0..<count {
            let kind = rng.element(of: Self.rankedKinds)
            generated.append(try Self.generate(kind: kind, difficulty: difficulty, using: &rng))
        }
        self.matchSeed = matchSeed
        self.difficulty = difficulty
        self.items = generated
    }

    /// Dispatches to the concrete generator for a ranked kind. Every draw comes from the
    /// shared `rng`, so the whole sequence is a pure function of the match seed.
    static func generate(kind: MathItemKind, difficulty: Int, using rng: inout SplitMix64) throws -> AnyMathItem {
        switch kind {
        case .targetNumber:
            return .targetNumber(try TargetNumberGenerator().generate(difficulty: difficulty, using: &rng))
        case .runningTotal:
            return .runningTotal(try RunningTotalGenerator().generate(difficulty: difficulty, using: &rng))
        case .estimation:
            return .estimation(try EstimationGenerator().generate(difficulty: difficulty, using: &rng))
        case .oddOneOut:
            return .oddOneOut(try OddOneOutGenerator().generate(difficulty: difficulty, using: &rng))
        case .speededArithmetic, .equationCompletion, .customOperator, .missingDigit, .percentFraction:
            // Not reachable via rankedKinds; guarded so a future edit to the list can't
            // silently admit a calculator-shortcuttable kind.
            throw MathError.invalidParameters("\(kind.rawValue) is not permitted in ranked play")
        }
    }
}
