import Foundation

/// A deterministic, seedable pseudo-random generator.
///
/// SplitMix64 is chosen deliberately: it is a tiny, fully specified algorithm with
/// no hidden state, so a given seed produces the exact same `UInt64` stream on every
/// device, OS, and Swift toolchain. That is a hard requirement — 1v1 ranked matches
/// derive their items from a server-issued match seed and both clients must generate
/// the identical sequence offline.
///
/// It conforms to `RandomNumberGenerator`, but the generators in this engine must NOT
/// use the standard library's `Int.random(in:using:)` / `next(upperBound:)`: those
/// range-reduction algorithms live in the stdlib and have changed between Swift
/// releases. Use the bounded helpers on this type instead — they pin the reduction
/// algorithm here so it can never drift.
public struct SplitMix64: RandomNumberGenerator {
    private var state: UInt64

    /// The golden-ratio odd constant that advances the internal counter.
    private static let gamma: UInt64 = 0x9E37_79B9_7F4A_7C15

    public init(seed: UInt64) {
        self.state = seed
    }

    /// The raw 64-bit output. This is the only source of entropy; every bounded
    /// helper is built on top of it so the whole engine shares one fixed algorithm.
    public mutating func next() -> UInt64 {
        state = state &+ SplitMix64.gamma
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }

    /// A uniform value in `0 ..< bound` using bitmask rejection.
    ///
    /// Bitmask rejection is unbiased and deterministic: we mask off the low bits that
    /// can cover `bound`, then reject any draw that lands past `bound`. Modulo would
    /// be biased; the stdlib's method could change. This one is ours forever.
    public mutating func nextUInt(below bound: UInt64) -> UInt64 {
        if bound <= 1 { return 0 }
        // Smallest all-ones mask that still covers `bound - 1`.
        let mask = UInt64.max >> UInt64((bound - 1).leadingZeroBitCount)
        while true {
            let candidate = next() & mask
            if candidate < bound { return candidate }
        }
    }

    /// A uniform `Int` in the inclusive range. The range span must fit in `UInt64`,
    /// which every generator in this engine respects (magnitudes are small).
    public mutating func int(in range: ClosedRange<Int>) -> Int {
        precondition(range.lowerBound <= range.upperBound, "empty range")
        let span = UInt64(range.upperBound - range.lowerBound) + 1
        return range.lowerBound + Int(nextUInt(below: span))
    }

    /// A uniform `Int` in the half-open range.
    public mutating func int(in range: Range<Int>) -> Int {
        precondition(range.lowerBound < range.upperBound, "empty range")
        let span = UInt64(range.upperBound - range.lowerBound)
        return range.lowerBound + Int(nextUInt(below: span))
    }

    /// A fair coin.
    public mutating func bool() -> Bool {
        next() & 1 == 1
    }

    /// A uniformly chosen element. Traps on an empty collection (a programming error).
    public mutating func element<T>(of array: [T]) -> T {
        precondition(!array.isEmpty, "cannot pick from an empty array")
        return array[Int(nextUInt(below: UInt64(array.count)))]
    }

    /// A deterministic in-place Fisher–Yates shuffle.
    public mutating func shuffle<T>(_ array: inout [T]) {
        guard array.count > 1 else { return }
        var i = array.count - 1
        while i > 0 {
            let j = Int(nextUInt(below: UInt64(i + 1)))
            array.swapAt(i, j)
            i -= 1
        }
    }

    /// A shuffled copy.
    public mutating func shuffled<T>(_ array: [T]) -> [T] {
        var copy = array
        shuffle(&copy)
        return copy
    }
}
