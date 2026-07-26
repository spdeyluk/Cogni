import XCTest
@testable import Cogni

/// Difficulty must actually rise with the ladder input. Averaged over many seeds, each
/// generator's predicted difficulty trends upward from 1 → 10, and the structural
/// "solve effort" measures (chain lengths, solution depth) grow too.
final class DifficultyMonotonicityTests: XCTestCase {

    private let samples = 60

    private func meanPredicted(_ kind: MathItemKind, difficulty: Int) throws -> Double {
        var total = 0.0
        for i in 0..<samples {
            let seed = (UInt64(difficulty) << 32) ^ UInt64(i) ^ kind.idSalt
            total += try TestSupport.generate(kind, difficulty: difficulty, seed: seed).predictedDifficulty
        }
        return total / Double(samples)
    }

    func testPredictedDifficultyTrendsUpForEveryGenerator() throws {
        for kind in MathItemKind.allCases {
            let low = try meanPredicted(kind, difficulty: 1)
            let mid = try meanPredicted(kind, difficulty: 5)
            let high = try meanPredicted(kind, difficulty: 10)
            XCTAssertGreaterThan(high, low + 1.0, "\(kind): mean predicted difficulty barely moved 1→10")
            // Coarse monotonicity: the midpoint sits between the ends (small tolerance).
            XCTAssertGreaterThanOrEqual(mid, low - 0.25, "\(kind): mid below low")
            XCTAssertLessThanOrEqual(mid, high + 0.25, "\(kind): mid above high")
        }
    }

    func testTargetNumberSolveDepthIncreases() throws {
        // A concrete "solve-step" measure: mean minimum solution depth rises with input.
        func meanMinDepth(difficulty: Int) throws -> Double {
            var total = 0.0
            for i in 0..<samples {
                var rng = SplitMix64(seed: (UInt64(difficulty) << 20) ^ UInt64(i))
                let item = try TargetNumberGenerator().generate(difficulty: difficulty, using: &rng)
                let solutions = TargetNumberGenerator.solve(operands: item.operands, target: item.target)
                total += Double(solutions.map(\.height).min() ?? 3)
            }
            return total / Double(samples)
        }
        XCTAssertGreaterThan(try meanMinDepth(difficulty: 10), try meanMinDepth(difficulty: 1))
    }

    func testRunningTotalChainLengthIncreases() throws {
        func meanChain(difficulty: Int) throws -> Double {
            var total = 0.0
            for i in 0..<samples {
                var rng = SplitMix64(seed: (UInt64(difficulty) << 16) ^ UInt64(i))
                let item = try RunningTotalGenerator().generate(difficulty: difficulty, using: &rng)
                total += Double(item.deltas.count)
            }
            return total / Double(samples)
        }
        XCTAssertGreaterThan(try meanChain(difficulty: 10), try meanChain(difficulty: 1))
    }
}
