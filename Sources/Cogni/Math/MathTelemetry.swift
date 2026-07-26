import Foundation

/// One attempt's telemetry. Emitted per attempt and batched to Supabase for item-bank
/// calibration. Deliberately carries no PII — only the item's generation inputs and the
/// attempt outcome.
public struct MathTelemetryEvent: Codable, Equatable, Sendable {
    public let itemKind: MathItemKind
    /// The item's content-addressed id — links attempts to the exact item, not a user.
    public let itemID: UUID
    /// The RNG seed the item came from (match seed or session seed), for reproduction.
    public let seed: UInt64
    /// The adaptive-ladder difficulty that was requested.
    public let difficulty: Int
    /// The difficulty predicted at generation time — the value calibration refines.
    public let predictedDifficulty: Double
    public let correct: Bool
    public let latencyMs: Int
    /// RunningTotal only: the per-step display interval the player saw.
    public let stepDisplayIntervalMs: Int?

    public init(itemKind: MathItemKind, itemID: UUID, seed: UInt64, difficulty: Int,
                predictedDifficulty: Double, correct: Bool, latencyMs: Int,
                stepDisplayIntervalMs: Int? = nil) {
        self.itemKind = itemKind
        self.itemID = itemID
        self.seed = seed
        self.difficulty = difficulty
        self.predictedDifficulty = predictedDifficulty
        self.correct = correct
        self.latencyMs = latencyMs
        self.stepDisplayIntervalMs = stepDisplayIntervalMs
    }

    /// Builds an event from an item and the attempt outcome, pulling the RunningTotal
    /// display interval automatically.
    public static func make(item: AnyMathItem, seed: UInt64, difficulty: Int,
                            correct: Bool, latencyMs: Int) -> MathTelemetryEvent {
        var interval: Int?
        if case .runningTotal(let running) = item {
            interval = running.displayIntervalMs
        }
        return MathTelemetryEvent(
            itemKind: item.kind,
            itemID: item.id,
            seed: seed,
            difficulty: difficulty,
            predictedDifficulty: item.predictedDifficulty,
            correct: correct,
            latencyMs: latencyMs,
            stepDisplayIntervalMs: interval
        )
    }
}

/// Where buffered telemetry batches go. The app provides a Supabase-backed
/// implementation; the engine ships only the buffer and the contract so it stays
/// network- and dependency-free in this pass.
public protocol MathTelemetrySink: AnyObject {
    /// Deliver a batch. Implementations should treat this as best-effort and durable
    /// (e.g. enqueue to a Supabase table), never blocking generation.
    func send(_ batch: [MathTelemetryEvent])
}

/// Buffers attempt telemetry on device and flushes in batches through a sink.
///
/// Not internally synchronized — drive it from a single actor/thread (the game loop),
/// which is how attempts arrive anyway.
public final class MathTelemetryBuffer {
    private var pending: [MathTelemetryEvent] = []
    private let flushThreshold: Int
    private let sink: MathTelemetrySink

    public init(sink: MathTelemetrySink, flushThreshold: Int = 50) {
        self.sink = sink
        self.flushThreshold = max(1, flushThreshold)
    }

    /// The number of events waiting to be flushed.
    public var pendingCount: Int { pending.count }

    /// Buffers an event, flushing automatically once the threshold is reached.
    public func record(_ event: MathTelemetryEvent) {
        pending.append(event)
        if pending.count >= flushThreshold {
            flush()
        }
    }

    /// Sends everything buffered and clears the buffer.
    public func flush() {
        guard !pending.isEmpty else { return }
        let batch = pending
        pending.removeAll(keepingCapacity: true)
        sink.send(batch)
    }
}

/// A sink that just collects batches in memory — used by tests and as a stand-in until
/// the Supabase sink is wired in the app layer.
public final class InMemoryTelemetrySink: MathTelemetrySink {
    public private(set) var batches: [[MathTelemetryEvent]] = []
    public init() {}
    public func send(_ batch: [MathTelemetryEvent]) { batches.append(batch) }
    public var allEvents: [MathTelemetryEvent] { batches.flatMap { $0 } }
}
