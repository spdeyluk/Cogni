import XCTest
@testable import Cogni

/// EquationCompletion, MissingDigit, and OddOneOut must never ship an item with a
/// second valid answer. Each check below re-derives uniqueness independently of the
/// generator's own logic over 2000 items.
final class UniquenessTests: XCTestCase {

    func testEquationCompletionHasUniqueSolution() throws {
        var produced = 0
        var seed: UInt64 = 0xE1
        while produced < 2000 {
            let difficulty = (produced % 10) + 1
            seed = seed &* 6364136223846793005 &+ 1442695040888963407
            var rng = SplitMix64(seed: seed)
            let item = try EquationCompletionGenerator().generate(difficulty: difficulty, using: &rng)
            let palette = EquationCompletionGenerator.params(for: difficulty).operatorSet

            switch item.blank {
            case .operators:
                let count = countOperatorSolutions(terms: item.terms, palette: palette, result: item.result,
                                                   width: item.operators.count)
                XCTAssertEqual(count, 1, "equation \(item.prompt) has \(count) operator solutions")
            case .operand(let index):
                let count = countOperandSolutions(terms: item.terms, operators: item.operators,
                                                  result: item.result, blankIndex: index)
                XCTAssertEqual(count, 1, "equation \(item.prompt) has \(count) operand solutions")
            }
            produced += 1
        }
    }

    func testMissingDigitHasUniqueAssignment() throws {
        var produced = 0
        var seed: UInt64 = 0xD1
        while produced < 2000 {
            let difficulty = (produced % 10) + 1
            seed = seed &* 6364136223846793005 &+ 1442695040888963407
            var rng = SplitMix64(seed: seed)
            let item = try MissingDigitGenerator().generate(difficulty: difficulty, using: &rng)
            let (count, uniqueMatchesHidden) = countMissingDigitSolutions(item)
            XCTAssertEqual(count, 1, "missing-digit \(item.prompt) has \(count) fillings")
            XCTAssertTrue(uniqueMatchesHidden, "recovered digits disagree with stored answer for \(item.prompt)")
            produced += 1
        }
    }

    func testOddOneOutHasUniqueAnswer() throws {
        var produced = 0
        var seed: UInt64 = 0x0D
        while produced < 2000 {
            let difficulty = (produced % 10) + 1
            seed = seed &* 6364136223846793005 &+ 1442695040888963407
            var rng = SplitMix64(seed: seed)
            let item = try OddOneOutGenerator().generate(difficulty: difficulty, using: &rng)
            let validOdds = validOddIndices(item.numbers)
            XCTAssertEqual(validOdds, [item.oddIndex],
                           "odd-one-out \(item.numbers) has candidate odds \(validOdds), expected only \(item.oddIndex)")
            produced += 1
        }
    }

    // MARK: - Independent re-derivations

    private func countOperatorSolutions(terms: [Int], palette: [ArithmeticOp], result: Int, width: Int) -> Int {
        var count = 0
        for assignment in cartesian(palette, width: width) {
            if let v = evaluateSequence(values: terms.map { Rational($0) }, operators: assignment),
               v == Rational(result) {
                count += 1
            }
        }
        return count
    }

    private func countOperandSolutions(terms: [Int], operators: [ArithmeticOp], result: Int, blankIndex: Int) -> Int {
        var count = 0
        for candidate in -99...999 {
            var trial = terms
            trial[blankIndex] = candidate
            if let v = evaluateSequence(values: trial.map { Rational($0) }, operators: operators),
               v == Rational(result) {
                count += 1
            }
        }
        return count
    }

    private func countMissingDigitSolutions(_ item: MissingDigitItem) -> (Int, Bool) {
        var aDigits = MissingDigitGenerator.digits(of: item.a)
        var bDigits = MissingDigitGenerator.digits(of: item.b)
        var cDigits = MissingDigitGenerator.digits(of: item.result)
        func digits(for component: MissingDigitGenerator.Blank.Component) -> [Int] {
            switch component { case .a: return aDigits; case .b: return bDigits; case .result: return cDigits }
        }
        func setDigit(_ value: Int, for component: MissingDigitGenerator.Blank.Component, at index: Int) {
            switch component {
            case .a: aDigits[index] = value
            case .b: bDigits[index] = value
            case .result: cDigits[index] = value
            }
        }
        let originalCounts: [MissingDigitGenerator.Blank.Component: Int] = [
            .a: aDigits.count, .b: bDigits.count, .result: cDigits.count
        ]

        var count = 0
        var recovered: [Int] = []
        var assignment = [Int](repeating: 0, count: item.blanks.count)
        func recurse(_ pos: Int) {
            if pos == item.blanks.count {
                for (i, blank) in item.blanks.enumerated() {
                    setDigit(assignment[i], for: blank.component, at: blank.digitIndex)
                }
                let av = MissingDigitGenerator.value(aDigits)
                let bv = MissingDigitGenerator.value(bDigits)
                let cv = MissingDigitGenerator.value(cDigits)
                if let produced = item.operation.apply(Rational(av), Rational(bv)), produced == Rational(cv) {
                    count += 1
                    recovered = assignment
                }
                return
            }
            let blank = item.blanks[pos]
            let isLeading = originalCounts[blank.component]! > 1 && blank.digitIndex == 0
            for digit in (isLeading ? 1 : 0)...9 {
                assignment[pos] = digit
                recurse(pos + 1)
            }
        }
        recurse(0)
        // restore
        aDigits = MissingDigitGenerator.digits(of: item.a)
        bDigits = MissingDigitGenerator.digits(of: item.b)
        cDigits = MissingDigitGenerator.digits(of: item.result)
        return (count, recovered == item.hiddenDigits)
    }

    /// Every index that could legitimately be the odd one out, given some property the
    /// other four share and it doesn't. A valid item has exactly one.
    private func validOddIndices(_ numbers: [Int]) -> Set<Int> {
        var valid = Set<Int>()
        for candidate in numbers.indices {
            for property in OddOneOutGenerator.fullPropertySet {
                let othersShare = numbers.indices.filter { $0 != candidate }.allSatisfy { property.holds(numbers[$0]) }
                if othersShare && !property.holds(numbers[candidate]) {
                    valid.insert(candidate)
                    break
                }
            }
        }
        return valid
    }

    private func cartesian(_ set: [ArithmeticOp], width: Int) -> [[ArithmeticOp]] {
        guard width > 0 else { return [[]] }
        var result: [[ArithmeticOp]] = [[]]
        for _ in 0..<width {
            var next: [[ArithmeticOp]] = []
            for prefix in result { for op in set { next.append(prefix + [op]) } }
            result = next
        }
        return result
    }
}
