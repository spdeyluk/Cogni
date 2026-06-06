# Psychometrics Strategy

This app should not present itself as an IQ test. Early versions should describe scores as cognitive performance, training baseline, and progress indicators.

IQ-style claims require strong evidence: standardized procedures, validated items, representative norms, reliability studies, bias review, and expert involvement from psychologists, neuropsychologists, psychometricians, and statisticians.

## Core Concepts

### Validity

Validity asks whether the test measures what it claims to measure.

For this app, each mini-assessment needs a clear construct:

- Visual sequence span: working memory capacity.
- Go/no-go: response inhibition and attention control.
- Mental rotation: spatial transformation ability.
- Matrix reasoning: abstract rule reasoning.

Future validation work should compare app scores against established measures or meaningful external outcomes.

### Sensitivity

Sensitivity asks whether the test can distinguish between different performance levels.

Design rules:

- Avoid tests that are too easy or too hard.
- Use multiple difficulty levels.
- Avoid ceiling effects where many users score near 100.
- Avoid floor effects where many users fail most items.
- Track item-level difficulty over time.

### Reliability

Reliability asks whether the score is consistent when the underlying ability has not meaningfully changed.

Important reliability checks:

- Test-retest reliability.
- Internal consistency.
- Split-half reliability.
- Device and input-method stability.
- Session-quality filtering.

### Standardization

Standardization means the task is administered consistently.

For web and mobile, control what can be controlled:

- Same instructions per assessment version.
- Same timing rules.
- Same scoring formula per version.
- Same stimulus generation rules.
- Versioned test configs.
- Clear invalid-session rules.

Online testing cannot fully control environment, sleep, stress, interruptions, display size, or motivation, so the product should be careful with interpretation.

## Early Score Language

Use:

- Baseline score
- Performance score
- Domain score
- Progress score
- Training trend

Avoid until properly validated:

- IQ
- Clinical diagnosis
- Percentile rank
- Medical-grade assessment
- Clinically proven intelligence increase

## Norms And Bell Curves

Version 0 should use criterion-based scoring. This compares users to task expectations, not to a claimed population norm.

Norm-based scoring can be added later after enough high-quality data exists. Norms should be separated by:

- Assessment version
- Age band
- Device class
- Input method
- Language/locale
- Session validity

Do not show percentile ranks until the norm sample is large and clean enough.

## Item Analysis To Add Later

When enough data exists, analyze each item or generated item family:

- Difficulty: how often users answer correctly.
- Discrimination: whether stronger users are more likely to answer correctly.
- Response time distribution.
- Guessing or spam patterns.
- Bias across cohorts.

Problematic items should be retired or reweighted.

## Practical Product Position

The app can be serious without pretending to be a formal IQ test.

The correct early promise:

> Short cognitive performance checks and adaptive training exercises that help users track focus, memory, reasoning, and spatial performance over time.

