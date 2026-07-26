import Foundation

/// The nine item families this engine can produce.
public enum MathItemKind: String, Codable, CaseIterable, Sendable {
    case speededArithmetic
    case targetNumber
    case runningTotal
    case equationCompletion
    case customOperator
    case estimation
    case oddOneOut
    case missingDigit
    case percentFraction

    /// The cognition axis this family feeds. There is no new/seventh hexagon axis.
    public var axis: CognitionAxis {
        switch self {
        case .speededArithmetic, .percentFraction:
            return .processingSpeed
        case .targetNumber, .equationCompletion, .customOperator, .oddOneOut, .missingDigit, .estimation:
            return .reasoning
        case .runningTotal:
            return .workingMemory
        }
    }

    /// A stable per-kind salt used when deriving content-addressed item ids, so two
    /// different kinds that happen to hash the same parameters never collide.
    var idSalt: UInt64 {
        // Fixed forever; do not renumber.
        switch self {
        case .speededArithmetic: return 1
        case .targetNumber: return 2
        case .runningTotal: return 3
        case .equationCompletion: return 4
        case .customOperator: return 5
        case .estimation: return 6
        case .oddOneOut: return 7
        case .missingDigit: return 8
        case .percentFraction: return 9
        }
    }
}

/// Which cognition axis an item feeds. Mirrors the app's existing hexagon axes.
public enum CognitionAxis: String, Codable, Sendable {
    case processingSpeed
    case reasoning
    case workingMemory
}

/// How the item expects to be answered.
public enum AnswerFormat: Equatable, Codable, Sendable {
    case numeric
    case multipleChoice([String])
    case trueFalse
    case operatorSequence
}

/// A user's answer to an item. `validate` on each item decides correctness.
public enum Response: Equatable, Codable, Sendable {
    case number(Int)
    case rational(Rational)
    case choice(Int)            // index into a multipleChoice option list
    case boolean(Bool)
    case operators([String])    // e.g. ["×", "+"] for an operator-fill item
    case digits([Int])          // ordered fill-in digits, e.g. MissingDigit
    case expression(MathExpression) // a built arithmetic expression, e.g. TargetNumber
}

/// Errors thrown by generation.
public enum MathError: Error, Equatable {
    /// Propose→validate→retry exhausted its attempt cap without a valid item.
    case generationFailed(kind: MathItemKind, attempts: Int)
    /// The requested parameters can never yield a valid item (a programming error in
    /// a difficulty table, not a runtime bad-luck condition).
    case invalidParameters(String)
}

/// A single generated math item.
public protocol MathItem: Codable, Identifiable {
    var id: UUID { get }                    // content-addressed, never random
    var kind: MathItemKind { get }
    var predictedDifficulty: Double { get } // 0.0–10.0 continuous, set at generation
    var answerFormat: AnswerFormat { get }
    var axis: CognitionAxis { get }
    /// Human-readable question text. Not UI styling — the item's own content, used by
    /// telemetry, tests, and README examples.
    var prompt: String { get }
    func validate(_ response: Response) -> Bool
}

public extension MathItem {
    var axis: CognitionAxis { kind.axis }
}

/// A generator maps an integer difficulty (1–10) onto its own parameter set and emits
/// a validated item, consuming entropy from the injected deterministic RNG.
public protocol MathItemGenerator {
    associatedtype Item: MathItem
    static var kind: MathItemKind { get }
    func generate(difficulty: Int, using rng: inout SplitMix64) throws -> Item
}

// MARK: - Shared generation helpers

/// Clamps an adaptive-ladder difficulty into the supported 1...10 band.
func clampDifficulty(_ difficulty: Int) -> Int {
    min(10, max(1, difficulty))
}

/// The universal propose→validate→retry loop.
///
/// `propose` returns a fully-formed, already-validated item, or `nil` to reject and
/// retry (a degenerate proposal). After `attempts` rejections this throws, so a broken
/// difficulty table surfaces loudly in tests instead of shipping a bad item or looping
/// forever.
func generateWithRetry<Item: MathItem>(
    kind: MathItemKind,
    attempts: Int = 100,
    using rng: inout SplitMix64,
    _ propose: (inout SplitMix64) throws -> Item?
) throws -> Item {
    var attempt = 0
    while attempt < attempts {
        attempt += 1
        if let item = try propose(&rng) {
            return item
        }
    }
    throw MathError.generationFailed(kind: kind, attempts: attempts)
}

// MARK: - Deterministic identity

/// FNV-1a over a list of integers. A fixed, tiny hash so item ids depend only on
/// content, not on `Hasher` (which is randomly seeded per process and would break
/// determinism across launches).
func stableHash(_ values: [Int]) -> UInt64 {
    var hash: UInt64 = 0xCBF2_9CE4_8422_2325 // FNV offset basis
    let prime: UInt64 = 0x0000_0100_0000_01B3
    for value in values {
        let bits = UInt64(bitPattern: Int64(value))
        var b = 0
        while b < 8 {
            hash ^= (bits >> UInt64(8 * b)) & 0xFF
            hash = hash &* prime
            b += 1
        }
    }
    return hash
}

/// Derives a stable `UUID` from a content hash and the kind's salt. Pure function of
/// its inputs, so the same item always carries the same id on every device.
func deterministicUUID(contentHash: UInt64, salt: UInt64) -> UUID {
    var rng = SplitMix64(seed: contentHash ^ (salt &* 0x9E37_79B9_7F4A_7C15))
    let a = rng.next()
    let b = rng.next()
    func byte(_ v: UInt64, _ i: Int) -> UInt8 { UInt8((v >> UInt64(8 * i)) & 0xFF) }
    var bytes = (
        byte(a, 0), byte(a, 1), byte(a, 2), byte(a, 3),
        byte(a, 4), byte(a, 5), byte(a, 6), byte(a, 7),
        byte(b, 0), byte(b, 1), byte(b, 2), byte(b, 3),
        byte(b, 4), byte(b, 5), byte(b, 6), byte(b, 7)
    )
    // Stamp RFC-4122 version (4) and variant bits so it is a well-formed UUID.
    bytes.6 = (bytes.6 & 0x0F) | 0x40
    bytes.8 = (bytes.8 & 0x3F) | 0x80
    return UUID(uuid: bytes)
}
