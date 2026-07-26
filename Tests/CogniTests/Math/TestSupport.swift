import Foundation
import XCTest
@testable import Cogni

/// Shared helpers for the math-engine tests.
enum TestSupport {
    /// Canonical JSON encoding (sorted keys) so two encodings of equal items compare
    /// byte-for-byte.
    static func canonicalJSON<T: Encodable>(_ value: T) -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        // swiftlint:disable:next force_try
        let data = try! encoder.encode(value)
        return String(decoding: data, as: UTF8.self)
    }

    /// Generates one item of the given kind at a difficulty from a seed, type-erased.
    /// A single shared entry point so every generator is exercised uniformly.
    static func generate(_ kind: MathItemKind, difficulty: Int, seed: UInt64) throws -> AnyMathItem {
        var rng = SplitMix64(seed: seed)
        switch kind {
        case .speededArithmetic:
            return .speededArithmetic(try SpeededArithmeticGenerator().generate(difficulty: difficulty, using: &rng))
        case .targetNumber:
            return .targetNumber(try TargetNumberGenerator().generate(difficulty: difficulty, using: &rng))
        case .runningTotal:
            return .runningTotal(try RunningTotalGenerator().generate(difficulty: difficulty, using: &rng))
        case .equationCompletion:
            return .equationCompletion(try EquationCompletionGenerator().generate(difficulty: difficulty, using: &rng))
        case .customOperator:
            return .customOperator(try CustomOperatorGenerator().generate(difficulty: difficulty, using: &rng))
        case .estimation:
            return .estimation(try EstimationGenerator().generate(difficulty: difficulty, using: &rng))
        case .oddOneOut:
            return .oddOneOut(try OddOneOutGenerator().generate(difficulty: difficulty, using: &rng))
        case .missingDigit:
            return .missingDigit(try MissingDigitGenerator().generate(difficulty: difficulty, using: &rng))
        case .percentFraction:
            return .percentFraction(try PercentFractionGenerator().generate(difficulty: difficulty, using: &rng))
        }
    }
}
