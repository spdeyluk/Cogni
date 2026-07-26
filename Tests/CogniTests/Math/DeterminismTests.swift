import XCTest
@testable import Cogni

/// Same seed → byte-identical items, across all nine generators and the match
/// sequence. This is the property 1v1 ranked play depends on.
final class DeterminismTests: XCTestCase {

    private let seeds: [UInt64] = [1, 2, 42, 1000, 0xDEAD_BEEF, 0x1234_5678_9ABC_DEF0]

    func testEveryGeneratorIsDeterministic() throws {
        for kind in MathItemKind.allCases {
            for difficulty in 1...10 {
                for seed in seeds {
                    let first = try TestSupport.generate(kind, difficulty: difficulty, seed: seed)
                    let second = try TestSupport.generate(kind, difficulty: difficulty, seed: seed)
                    XCTAssertEqual(TestSupport.canonicalJSON(first), TestSupport.canonicalJSON(second),
                                   "\(kind) not deterministic at difficulty \(difficulty), seed \(seed)")
                    XCTAssertEqual(first.id, second.id, "\(kind) id not stable")
                }
            }
        }
    }

    func testMatchSequenceIsDeterministicAcrossClients() throws {
        for seed in seeds {
            for difficulty in [2, 5, 8] {
                // Two independent "clients" building from the same match seed.
                let clientA = try MatchItemSequence(matchSeed: seed, difficulty: difficulty, count: 12)
                let clientB = try MatchItemSequence(matchSeed: seed, difficulty: difficulty, count: 12)
                XCTAssertEqual(clientA.items.count, 12)
                XCTAssertEqual(TestSupport.canonicalJSON(clientA.items),
                               TestSupport.canonicalJSON(clientB.items),
                               "match sequence diverged for seed \(seed), difficulty \(difficulty)")
            }
        }
    }

    func testMatchSequenceOnlyUsesRankedKinds() throws {
        let sequence = try MatchItemSequence(matchSeed: 0xABCDEF, difficulty: 6, count: 200)
        for item in sequence.items {
            XCTAssertTrue(MatchItemSequence.rankedKinds.contains(item.kind),
                          "\(item.kind) is not a permitted ranked kind")
        }
        // The calculator-shortcuttable kinds must never appear.
        let banned: Set<MathItemKind> = [.speededArithmetic, .percentFraction]
        XCTAssertTrue(sequence.items.allSatisfy { !banned.contains($0.kind) })
    }

    func testDifferentSeedsGenerallyDiffer() throws {
        // Not a determinism requirement, but a smoke check that items aren't constant.
        let a = try TestSupport.generate(.targetNumber, difficulty: 5, seed: 1)
        let b = try TestSupport.generate(.targetNumber, difficulty: 5, seed: 2)
        XCTAssertNotEqual(TestSupport.canonicalJSON(a), TestSupport.canonicalJSON(b))
    }
}
