import XCTest
@testable import Cogni

/// Every generated item accepts its own correct answer and rejects a wrong one. This
/// also transitively proves validity (e.g. TargetNumber always has a real solution).
final class ItemValidationTests: XCTestCase {

    func testCorrectAnswerValidatesAndWrongDoesNot() throws {
        for kind in MathItemKind.allCases {
            for difficulty in 1...10 {
                for i in 0..<25 {
                    let seed = (UInt64(difficulty) << 24) ^ UInt64(i) ^ kind.idSalt
                    let item = try TestSupport.generate(kind, difficulty: difficulty, seed: seed)
                    let (correct, wrong) = responses(for: item)
                    XCTAssertTrue(item.validate(correct),
                                  "\(kind) rejected its own answer: \(item.prompt)")
                    if let wrong {
                        XCTAssertFalse(item.validate(wrong),
                                       "\(kind) accepted a wrong answer: \(item.prompt)")
                    }
                }
            }
        }
    }

    /// The correct response and a plausible wrong one (nil if no wrong response applies).
    private func responses(for item: AnyMathItem) -> (Response, Response?) {
        switch item {
        case .speededArithmetic(let i):
            if let shown = i.shownAnswer {
                return (.boolean(shown == i.answer), .boolean(shown != i.answer))
            }
            return (.number(i.answer), .number(i.answer + 1))
        case .targetNumber(let i):
            let solution = TargetNumberGenerator.solve(operands: i.operands, target: i.target).first!
            return (.expression(solution), .number(i.target)) // wrong shape: not an expression
        case .runningTotal(let i):
            return (.number(i.finalTotal), .number(i.finalTotal + 1))
        case .equationCompletion(let i):
            switch i.blank {
            case .operators:
                // A wrong tuple that is guaranteed to differ from the correct one.
                var wrong = i.operators.map { $0.rawValue }
                wrong[0] = wrong[0] == ArithmeticOp.add.rawValue
                    ? ArithmeticOp.subtract.rawValue
                    : ArithmeticOp.add.rawValue
                return (.operators(i.operators.map { $0.rawValue }), .operators(wrong))
            case .operand(let index):
                return (.number(i.terms[index]), .number(i.terms[index] + 1))
            }
        case .customOperator(let i):
            return (.number(i.answer), .number(i.answer + 1))
        case .estimation(let i):
            let wrongIndex = (i.correctIndex + 1) % i.options.count
            return (.choice(i.correctIndex), .choice(wrongIndex))
        case .oddOneOut(let i):
            let wrongIndex = (i.oddIndex + 1) % i.numbers.count
            return (.choice(i.oddIndex), .choice(wrongIndex))
        case .missingDigit(let i):
            var wrong = i.hiddenDigits
            if !wrong.isEmpty { wrong[0] = (wrong[0] + 1) % 10 }
            return (.digits(i.hiddenDigits), wrong == i.hiddenDigits ? nil : .digits(wrong))
        case .percentFraction(let i):
            return (.rational(i.answer), .rational(i.answer + Rational(1)))
        }
    }
}
