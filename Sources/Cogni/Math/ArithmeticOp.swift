import Foundation

/// A binary arithmetic operator, used by the operator-fill and evaluation helpers.
public enum ArithmeticOp: String, Codable, CaseIterable, Sendable {
    case add = "+"
    case subtract = "−"
    case multiply = "×"
    case divide = "÷"

    /// Exact application; `nil` on division by zero or non-exact division.
    public func apply(_ a: Rational, _ b: Rational) -> Rational? {
        switch self {
        case .add: return a + b
        case .subtract: return a - b
        case .multiply: return a * b
        case .divide: return a.divided(by: b)
        }
    }

    /// Standard precedence: × and ÷ bind tighter than + and −.
    public var precedence: Int {
        switch self {
        case .multiply, .divide: return 2
        case .add, .subtract: return 1
        }
    }
}

/// Evaluates a flat operator sequence (`v0 op0 v1 op1 v2 …`) with standard precedence,
/// left-to-right within a precedence level, exactly over `Rational`. Returns `nil` if
/// any division is by zero or not exact — the callers treat that as "no value".
///
/// A two-pass shunting-style fold: first collapse × and ÷, then + and −.
func evaluateSequence(values: [Rational], operators: [ArithmeticOp]) -> Rational? {
    precondition(values.count == operators.count + 1, "operator/value count mismatch")
    guard !operators.isEmpty else { return values.first }

    // Pass 1: fold multiplicative runs.
    var folded: [Rational] = [values[0]]
    var additive: [ArithmeticOp] = []
    for (index, op) in operators.enumerated() {
        let rhs = values[index + 1]
        switch op {
        case .multiply, .divide:
            guard let acc = op.apply(folded[folded.count - 1], rhs) else { return nil }
            folded[folded.count - 1] = acc
        case .add, .subtract:
            additive.append(op)
            folded.append(rhs)
        }
    }

    // Pass 2: fold additive run left-to-right.
    var acc = folded[0]
    for (index, op) in additive.enumerated() {
        guard let next = op.apply(acc, folded[index + 1]) else { return nil }
        acc = next
    }
    return acc
}
