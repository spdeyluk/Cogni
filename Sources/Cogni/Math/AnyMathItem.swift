import Foundation

/// A type-erased, `Codable` wrapper over any of the nine concrete item types. Used
/// wherever a heterogeneous list of items must be stored or serialized (match
/// sequences, telemetry, persistence). Encoding is a single discriminated key, so it
/// round-trips deterministically.
public enum AnyMathItem: Codable, Identifiable {
    case speededArithmetic(SpeededArithmeticItem)
    case targetNumber(TargetNumberItem)
    case runningTotal(RunningTotalItem)
    case equationCompletion(EquationCompletionItem)
    case customOperator(CustomOperatorItem)
    case estimation(EstimationItem)
    case oddOneOut(OddOneOutItem)
    case missingDigit(MissingDigitItem)
    case percentFraction(PercentFractionItem)

    /// The wrapped item as the shared protocol type.
    public var base: any MathItem {
        switch self {
        case .speededArithmetic(let item): return item
        case .targetNumber(let item): return item
        case .runningTotal(let item): return item
        case .equationCompletion(let item): return item
        case .customOperator(let item): return item
        case .estimation(let item): return item
        case .oddOneOut(let item): return item
        case .missingDigit(let item): return item
        case .percentFraction(let item): return item
        }
    }

    public var id: UUID { base.id }
    public var kind: MathItemKind { base.kind }
    public var predictedDifficulty: Double { base.predictedDifficulty }
    public var answerFormat: AnswerFormat { base.answerFormat }
    public var axis: CognitionAxis { base.axis }
    public var prompt: String { base.prompt }

    public func validate(_ response: Response) -> Bool { base.validate(response) }
}
