import XCTest
@testable import Cogni

/// Over 2000 estimation items: the correct option is within tolerance and every
/// distractor keeps its floor separation — checked with exact integer per-mille math.
final class EstimationGapTests: XCTestCase {

    func testDistractorSeparationHolds() throws {
        var produced = 0
        var seed: UInt64 = 0xE5
        while produced < 2000 {
            let difficulty = (produced % 10) + 1
            seed = seed &* 6364136223846793005 &+ 1442695040888963407
            var rng = SplitMix64(seed: seed)
            let item = try EstimationGenerator().generate(difficulty: difficulty, using: &rng)

            for (index, option) in item.options.enumerated() {
                let deviation = abs(option.value - item.target) * 1000
                if index == item.correctIndex {
                    XCTAssertLessThanOrEqual(deviation, item.target * item.correctTolerancePermille,
                                             "correct option \(option.label) not within tolerance of \(item.target)")
                } else {
                    XCTAssertGreaterThanOrEqual(deviation, item.target * item.distractorMinPermille,
                                                "distractor \(option.label) too close to \(item.target)")
                }
            }
            // Floor never drops below 8% (80‰).
            XCTAssertGreaterThanOrEqual(item.distractorMinPermille, 80)
            produced += 1
        }
    }

    func testTighteningWithDifficulty() {
        // The separation floor shrinks monotonically toward its 8% floor.
        let low = EstimationGenerator.params(for: 1).distractorMinPermille
        let high = EstimationGenerator.params(for: 10).distractorMinPermille
        XCTAssertEqual(low, 150)
        XCTAssertEqual(high, 80)
        XCTAssertGreaterThan(low, high)
    }
}
