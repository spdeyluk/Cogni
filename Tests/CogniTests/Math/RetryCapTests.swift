import XCTest
@testable import Cogni

/// No generator may exhaust its 100-attempt retry cap on any difficulty 1–10. If a
/// difficulty table produces a corner where valid items are too rare, generation
/// throws `generationFailed` — this test would catch it.
final class RetryCapTests: XCTestCase {

    func testNoGeneratorExceedsRetryCap() {
        let seedsPerDifficulty: UInt64 = 120
        for kind in MathItemKind.allCases {
            for difficulty in 1...10 {
                for i in 0..<seedsPerDifficulty {
                    let seed = (UInt64(difficulty) << 40) ^ (i &* 0x9E37_79B9_7F4A_7C15) ^ kind.idSalt
                    do {
                        _ = try TestSupport.generate(kind, difficulty: difficulty, seed: seed)
                    } catch let MathError.generationFailed(failedKind, attempts) {
                        XCTFail("\(failedKind) hit the retry cap (\(attempts)) at difficulty \(difficulty), seed \(seed)")
                    } catch {
                        XCTFail("\(kind) threw \(error) at difficulty \(difficulty), seed \(seed)")
                    }
                }
            }
        }
    }
}
