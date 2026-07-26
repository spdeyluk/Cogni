import XCTest
@testable import Cogni

/// SplitMix64 determinism and Rational correctness — the two load-bearing primitives.
final class FoundationTests: XCTestCase {

    func testSplitMix64IsDeterministic() {
        var a = SplitMix64(seed: 42)
        var b = SplitMix64(seed: 42)
        for _ in 0..<1000 {
            XCTAssertEqual(a.next(), b.next())
        }
    }

    func testSplitMix64KnownVector() {
        // Reference SplitMix64 outputs for seed 0 — pins the algorithm so a refactor
        // can never silently change the stream.
        var rng = SplitMix64(seed: 0)
        XCTAssertEqual(rng.next(), 16294208416658607535)
        XCTAssertEqual(rng.next(), 7960286522194355700)
        XCTAssertEqual(rng.next(), 487617019471545679)
    }

    func testBoundedSamplingInRange() {
        var rng = SplitMix64(seed: 7)
        for _ in 0..<10000 {
            let v = rng.int(in: 3...9)
            XCTAssertTrue((3...9).contains(v))
        }
    }

    func testNextUIntBelowIsUnbiasedRangeAndBounds() {
        var rng = SplitMix64(seed: 99)
        XCTAssertEqual(rng.nextUInt(below: 1), 0) // degenerate bound
        for _ in 0..<10000 {
            XCTAssertLessThan(rng.nextUInt(below: 6), 6)
        }
    }

    func testShuffleIsDeterministicPermutation() {
        var a = SplitMix64(seed: 5)
        var b = SplitMix64(seed: 5)
        var x = Array(0..<20)
        var y = Array(0..<20)
        a.shuffle(&x)
        b.shuffle(&y)
        XCTAssertEqual(x, y)
        XCTAssertEqual(x.sorted(), Array(0..<20)) // still a permutation
    }

    func testRationalAlwaysReduced() {
        XCTAssertEqual(Rational(2, 4), Rational(1, 2))
        XCTAssertEqual(Rational(-3, -6), Rational(1, 2))
        XCTAssertEqual(Rational(6, -3), Rational(-2, 1))
        XCTAssertEqual(Rational(0, 5), Rational(0, 1))
    }

    func testRationalArithmeticIsExact() {
        // The classic float trap: 1/10 + 2/10 == 3/10 exactly here.
        XCTAssertEqual(Rational(1, 10) + Rational(2, 10), Rational(3, 10))
        XCTAssertEqual(Rational(1, 3) * Rational(3, 1), Rational(1))
        XCTAssertEqual(Rational(7, 1) - Rational(9, 2), Rational(5, 2))
    }

    func testRationalDivisionByZeroReturnsNil() {
        XCTAssertNil(Rational(5).divided(by: Rational(0)))
        XCTAssertEqual(Rational(3).divided(by: Rational(6)), Rational(1, 2))
    }

    func testRationalIsInteger() {
        XCTAssertTrue(Rational(4, 2).isInteger)
        XCTAssertFalse(Rational(3, 2).isInteger)
        XCTAssertEqual(Rational(4, 2).integerValue, 2)
        XCTAssertNil(Rational(3, 2).integerValue)
    }
}
