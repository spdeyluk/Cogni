import Foundation

/// An arithmetic expression tree over `+ − × ÷`. Used by TargetNumber (as both the
/// solver's output and the user's answer) and evaluated exactly with `Rational`.
public indirect enum MathExpression: Equatable, Hashable, Codable, Sendable {
    case value(Int)
    case add(MathExpression, MathExpression)
    case subtract(MathExpression, MathExpression)
    case multiply(MathExpression, MathExpression)
    case divide(MathExpression, MathExpression)

    /// Exact evaluation. Returns `nil` if any division by zero occurs anywhere in the
    /// tree — never a float, never a trap.
    public func evaluate() -> Rational? {
        switch self {
        case .value(let v):
            return Rational(v)
        case .add(let a, let b):
            guard let x = a.evaluate(), let y = b.evaluate() else { return nil }
            return x + y
        case .subtract(let a, let b):
            guard let x = a.evaluate(), let y = b.evaluate() else { return nil }
            return x - y
        case .multiply(let a, let b):
            guard let x = a.evaluate(), let y = b.evaluate() else { return nil }
            return x * y
        case .divide(let a, let b):
            guard let x = a.evaluate(), let y = b.evaluate() else { return nil }
            return x.divided(by: y)
        }
    }

    /// The integer leaves, in traversal order — the operands this expression consumes.
    public var leaves: [Int] {
        switch self {
        case .value(let v):
            return [v]
        case .add(let a, let b), .subtract(let a, let b),
             .multiply(let a, let b), .divide(let a, let b):
            return a.leaves + b.leaves
        }
    }

    /// Tree height: leaves are 0, each operator adds one. A four-operand expression
    /// ranges from 2 (fully balanced) to 3 (a linear chain).
    public var height: Int {
        switch self {
        case .value:
            return 0
        case .add(let a, let b), .subtract(let a, let b),
             .multiply(let a, let b), .divide(let a, let b):
            return 1 + max(a.height, b.height)
        }
    }

    /// Whether any division node appears.
    public var usesDivision: Bool {
        switch self {
        case .value:
            return false
        case .add(let a, let b), .subtract(let a, let b), .multiply(let a, let b):
            return a.usesDivision || b.usesDivision
        case .divide:
            return true
        }
    }

    /// Whether any internal (non-leaf) sub-result is non-integer — i.e. the solver had
    /// to pass through a fraction. A driver of perceived difficulty.
    public var hasNonIntegerIntermediate: Bool {
        switch self {
        case .value:
            return false
        case .add(let a, let b), .subtract(let a, let b),
             .multiply(let a, let b), .divide(let a, let b):
            if let v = evaluate(), !v.isInteger { return true }
            return a.hasNonIntegerIntermediate || b.hasNonIntegerIntermediate
        }
    }

    /// A canonical string that is identical for expressions differing only by the order
    /// of commutative operands (`a+b` == `b+a`, `a×b` == `b×a`). Used to de-duplicate
    /// solutions so the count reflects genuinely distinct strategies.
    var canonicalKey: String {
        switch self {
        case .value(let v):
            return String(v)
        case .add(let a, let b):
            let parts = [a.canonicalKey, b.canonicalKey].sorted()
            return "(\(parts[0])+\(parts[1]))"
        case .multiply(let a, let b):
            let parts = [a.canonicalKey, b.canonicalKey].sorted()
            return "(\(parts[0])*\(parts[1]))"
        case .subtract(let a, let b):
            return "(\(a.canonicalKey)-\(b.canonicalKey))"
        case .divide(let a, let b):
            return "(\(a.canonicalKey)/\(b.canonicalKey))"
        }
    }
}

extension MathExpression: CustomStringConvertible {
    /// A readable infix form with only the parentheses that matter — for hints and for
    /// showing a solution on failure.
    public var description: String {
        render(parentPrecedence: 0)
    }

    private func render(parentPrecedence: Int) -> String {
        switch self {
        case .value(let v):
            return String(v)
        case .add(let a, let b):
            return wrap("\(a.render(parentPrecedence: 1)) + \(b.render(parentPrecedence: 1))",
                        precedence: 1, parent: parentPrecedence)
        case .subtract(let a, let b):
            return wrap("\(a.render(parentPrecedence: 1)) − \(b.render(parentPrecedence: 2))",
                        precedence: 1, parent: parentPrecedence)
        case .multiply(let a, let b):
            return wrap("\(a.render(parentPrecedence: 2)) × \(b.render(parentPrecedence: 2))",
                        precedence: 2, parent: parentPrecedence)
        case .divide(let a, let b):
            return wrap("\(a.render(parentPrecedence: 2)) ÷ \(b.render(parentPrecedence: 3))",
                        precedence: 2, parent: parentPrecedence)
        }
    }

    private func wrap(_ text: String, precedence: Int, parent: Int) -> String {
        precedence < parent ? "(\(text))" : text
    }
}
