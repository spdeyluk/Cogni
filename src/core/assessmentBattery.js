import { CognitiveDomain } from "./domains.js";

export const assessmentBattery = Object.freeze([
  {
    id: CognitiveDomain.WORKING_MEMORY,
    title: "Working Memory",
    subtests: [
      { id: "visual-sequence-span", title: "Visual Sequence Span", status: "implemented" },
      { id: "spatial-span", title: "Spatial Span", status: "implemented" },
      { id: "operation-span", title: "Operation Span", status: "implemented" }
    ]
  },
  {
    id: CognitiveDomain.ATTENTION_CONTROL,
    title: "Attention Control",
    subtests: [
      { id: "go-no-go", title: "Go/No-Go", status: "implemented" },
      { id: "flanker-task", title: "Flanker Task", status: "implemented" },
      { id: "sustained-attention", title: "Sustained Attention", status: "implemented" }
    ]
  },
  {
    id: CognitiveDomain.REASONING,
    title: "Reasoning",
    subtests: [
      { id: "matrix-reasoning", title: "Matrix Reasoning", status: "implemented" },
      { id: "rule-induction", title: "Rule Induction", status: "implemented" },
      { id: "relational-comparison", title: "Relational Comparison", status: "implemented" }
    ]
  },
  {
    id: CognitiveDomain.SPATIAL_REASONING,
    title: "Spatial Reasoning",
    subtests: [
      { id: "mental-rotation", title: "Mental Rotation", status: "implemented" },
      { id: "grid-transformation", title: "Grid Transformation", status: "implemented" },
      { id: "perspective-taking", title: "Perspective Taking", status: "implemented" }
    ]
  },
  {
    id: CognitiveDomain.PROCESSING_SPEED,
    title: "Processing Speed",
    subtests: [
      { id: "symbol-match", title: "Symbol Match", status: "implemented" },
      { id: "visual-search", title: "Visual Search", status: "implemented" },
      { id: "choice-reaction-time", title: "Choice Reaction Time", status: "implemented" }
    ]
  },
  {
    id: CognitiveDomain.LEARNING_MEMORY,
    title: "Learning And Memory",
    subtests: [
      { id: "word-list-recall", title: "Word List Recall", status: "implemented" },
      { id: "visual-pair-memory", title: "Visual Pair Memory", status: "implemented" },
      { id: "delayed-recognition", title: "Delayed Recognition", status: "implemented" }
    ]
  }
]);
