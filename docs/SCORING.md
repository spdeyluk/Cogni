# Scoring Model

The scoring system stores raw trial data first, then derives scores. This is important because scoring formulas will evolve as the product gathers validation data.

## Score Components

- Accuracy: response correctness.
- Difficulty: level reached or configured task complexity.
- Speed: reaction time compared against task-specific expectations.
- Consistency: variability in response timing and correctness.
- Completion quality: interruptions, abandoned sessions, or invalid timing.

## Default Assessment Weights

Weights are task-specific. The first working memory baseline uses:

- 55% accuracy
- 25% difficulty
- 10% speed
- 10% consistency

The app also returns score contribution points so the beta lab can show how much each component affected the final score.

Example:

```text
Score 78
Accuracy contribution: 44
Difficulty contribution: 18
Speed contribution: 7
Consistency contribution: 9
```

## Working Memory V1

The Working Memory category contains three subtests:

- Visual Sequence Span: 32%
- Spatial Span: 32%
- Operation Span: 36%

Operation Span is slightly heavier because it measures memory under active processing load, not just short-term recall.

Visual Sequence Span and Spatial Span use increasing difficulty only. Current beta settings:

- Visual Sequence Span: 8 trials, spans 2 to 9, 900 ms display, 250 ms gap.
- Spatial Span: 8 trials, spans 2 to 9, 850 ms display, 250 ms gap.
- Operation Span: 5 sets, set sizes 2 to 6.

Harder trials count more in the accuracy component. A correct span-7 trial contributes more than a correct span-3 trial.

## Norming

Version 0 uses criterion scores from 0 to 100.

Version 1 can add internal norms once there are enough valid sessions. Norms should be separated by assessment version and cohort. Do not show percentiles until the dataset is large enough and quality-controlled.

The beta lab may show a `Beta bell-curve estimate` after each test. This is a development aid mapped from the criterion score onto a familiar mean-100, standard-deviation-15 scale. It is not a real population norm and should not be marketed as an IQ-style percentile.

## Psychometric Guardrails

Early scores are not IQ scores. They are cognitive performance scores.

The scoring system must keep raw trial data because future psychometric analysis needs item-level evidence:

- Item difficulty.
- Item discrimination.
- Response time distribution.
- Ceiling and floor effects.
- Reliability across repeated sessions.
- Bias across cohorts.

Every scoring formula and assessment config must be versioned so old scores remain interpretable after the model improves.

## Leaderboard

Leaderboard ranking should prefer progress over raw ability:

```text
progressScore = currentRollingAverage - baselineRollingAverage
```

This lets beginners, athletes, and already-high performers compete on improvement.
