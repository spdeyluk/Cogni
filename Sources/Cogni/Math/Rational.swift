import Foundation

/// An exact rational number, always stored reduced with a positive denominator.
///
/// The TargetNumber solver and every generator that touches division use this instead
/// of `Double`. Float equality (`0.1 + 0.2 == 0.3`) silently fails, which would let
/// the solver accept wrong "solutions" and let uniqueness checks pass bad items. All
/// item logic is integer/rational and exact.
public struct Rational: Equatable, Hashable, Codable, Sendable {
    public let numerator: Int
    public let denominator: Int

    /// Creates a reduced rational. The denominator must be non-zero; division that can
    /// produce a zero denominator goes through `divided(by:)`, which returns `nil`.
    public init(_ numerator: Int, _ denominator: Int = 1) {
        precondition(denominator != 0, "Rational denominator must be non-zero")
        var n = numerator
        var d = denominator
        if d < 0 { n = -n; d = -d } // keep the sign on the numerator
        let g = Rational.gcd(n, d)
        // g is never 0 here: d != 0 guarantees a positive gcd.
        self.numerator = n / g
        self.denominator = d / g
    }

    public static let zero = Rational(0)
    public static let one = Rational(1)

    public var isInteger: Bool { denominator == 1 }

    /// The integer value when this is a whole number, else `nil`. Never rounds.
    public var integerValue: Int? { isInteger ? numerator : nil }

    /// A `Double` for display and difficulty scoring only — never for equality in item
    /// logic. Kept `internal` so it can't leak into solver comparisons by accident.
    var approximateValue: Double { Double(numerator) / Double(denominator) }

    public static func + (a: Rational, b: Rational) -> Rational {
        Rational(a.numerator * b.denominator + b.numerator * a.denominator,
                 a.denominator * b.denominator)
    }

    public static func - (a: Rational, b: Rational) -> Rational {
        Rational(a.numerator * b.denominator - b.numerator * a.denominator,
                 a.denominator * b.denominator)
    }

    public static func * (a: Rational, b: Rational) -> Rational {
        Rational(a.numerator * b.numerator, a.denominator * b.denominator)
    }

    /// Exact division. Returns `nil` when dividing by zero, so callers (the solver)
    /// can simply skip that branch instead of trapping.
    public func divided(by other: Rational) -> Rational? {
        guard other.numerator != 0 else { return nil }
        return Rational(numerator * other.denominator, denominator * other.numerator)
    }

    public static prefix func - (a: Rational) -> Rational {
        Rational(-a.numerator, a.denominator)
    }

    private static func gcd(_ a: Int, _ b: Int) -> Int {
        var a = abs(a)
        var b = abs(b)
        while b != 0 {
            (a, b) = (b, a % b)
        }
        return a
    }
}

extension Rational: CustomStringConvertible {
    public var description: String {
        denominator == 1 ? "\(numerator)" : "\(numerator)/\(denominator)"
    }
}
