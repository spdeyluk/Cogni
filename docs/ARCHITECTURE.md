# Cognitive Performance Web Architecture

This project starts as a web systems prototype. The important rule is that cognitive logic stays portable: assessments, exercises, scoring, validation, and progress calculations live outside the UI.

## Layers

- `src/core`: pure domain logic for assessments, exercises, scoring, and progress.
- `src/app`: browser UI orchestration.
- `public`: static shell, styles, and browser entry point.
- `test`: Node test coverage for core logic.

## Product Split

Assessments measure ability. Exercises train ability. They may target the same cognitive domains, but should not use identical tasks, stimuli, scoring weights, or difficulty curves.

Initial domains:

- Working memory
- Attention control
- Reasoning
- Spatial reasoning
- Processing speed

## Early Scoring Strategy

Before the app has enough real users for norms, scores are criterion-based. That means they are derived from performance quality rather than a claimed population percentile.

Later, the app can add norm-based scoring when there is enough clean data segmented by age band, device type, language, and assessment version.

## Assessment Battery Strategy

The app should use many short mini-assessments instead of one long test. This reduces fatigue, improves user experience, and creates more frequent measurements.

Each mini-assessment has:

- One primary cognitive domain.
- A versioned config.
- Standardized instructions.
- Raw trial data.
- A criterion score.
- Session validity checks.

Domain scores are aggregated from multiple mini-assessments. Overall score is aggregated from domain scores.
