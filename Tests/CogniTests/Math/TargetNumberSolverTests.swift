import XCTest
@testable import Cogni

/// Verifies the TargetNumber solver against an independent brute-force oracle.
final class TargetNumberSolverTests: XCTestCase {

    // MARK: - Independent oracle

    /// Enumerates every permutation × every operator triple × every parenthesisation
    /// shape for four operands, evaluating with exact `Rational`. Returns whether the
    /// target is reachable. Deliberately written differently from the solver (explicit
    /// shapes, not pairwise reduction) so agreement is meaningful.
    private func oracleReachable(operands: [Int], target: Rational) -> Bool {
        let ops: [(Rational, Rational) -> Rational?] = [
            { $0 + $1 }, { $0 - $1 }, { $0 * $1 }, { $0.divided(by: $1) }
        ]
        let perms = permutations(operands.map { Rational($0) })
        for p in perms {
            let a = p[0], b = p[1], c = p[2], d = p[3]
            for o1 in ops {
                for o2 in ops {
                    for o3 in ops {
                        // The five distinct parenthesisations of a four-term chain.
                        // ((a?b)?c)?d
                        if let ab = o1(a, b), let abc = o2(ab, c), let v = o3(abc, d), v == target { return true }
                        // (a?(b?c))?d
                        if let bc = o2(b, c), let abc = o1(a, bc), let v = o3(abc, d), v == target { return true }
                        // (a?b)?(c?d)
                        if let ab = o1(a, b), let cd = o3(c, d), let v = o2(ab, cd), v == target { return true }
                        // a?((b?c)?d)
                        if let bc = o2(b, c), let bcd = o3(bc, d), let v = o1(a, bcd), v == target { return true }
                        // a?(b?(c?d))
                        if let cd = o3(c, d), let bcd = o2(b, cd), let v = o1(a, bcd), v == target { return true }
                    }
                }
            }
        }
        return false
    }

    private func permutations<T>(_ array: [T]) -> [[T]] {
        guard array.count > 1 else { return [array] }
        var result: [[T]] = []
        for i in array.indices {
            var rest = array
            let element = rest.remove(at: i)
            for var sub in permutations(rest) {
                sub.insert(element, at: 0)
                result.append(sub)
            }
        }
        return result
    }

    // MARK: - Tests

    func testKnownSolution() {
        // Classic 24: 4,7,8,8 → (7 − 8÷8) × 4 = 24.
        let solutions = TargetNumberGenerator.solve(operands: [4, 7, 8, 8], target: 24)
        XCTAssertFalse(solutions.isEmpty)
        for s in solutions {
            XCTAssertEqual(s.leaves.sorted(), [4, 7, 8, 8])
            XCTAssertEqual(s.evaluate(), Rational(24))
        }
    }

    func testSolverMatchesOracleOn1000Instances() {
        var rng = SplitMix64(seed: 0xABCD_1234_5678_9F01)
        for _ in 0..<1000 {
            let operands = (0..<4).map { _ in rng.int(in: 1...13) }
            let target = Rational(rng.int(in: 1...100))
            let solutions = TargetNumberGenerator.solve(operands: operands, target: target)

            // Soundness: every returned solution truly evaluates to the target and uses
            // exactly the operands.
            for s in solutions {
                XCTAssertEqual(s.evaluate(), target, "unsound solution for \(operands) → \(target)")
                XCTAssertEqual(s.leaves.sorted(), operands.sorted())
            }
            // Completeness: solver finds a solution iff the oracle says one exists.
            let solverReachable = !solutions.isEmpty
            let oracle = oracleReachable(operands: operands, target: target)
            XCTAssertEqual(solverReachable, oracle,
                           "reachability mismatch for \(operands) → \(target): solver=\(solverReachable) oracle=\(oracle)")
        }
    }
}
