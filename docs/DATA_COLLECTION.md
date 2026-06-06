# Data Collection For Real Scoring

The product must store raw assessment events so scoring can become evidence-based after launch.

## Store Per Trial

- User id or anonymous participant id.
- Assessment id and version.
- Domain and subtest id.
- Trial index.
- Stimulus payload.
- Correct answer.
- User response.
- Correct/incorrect.
- Reaction time.
- Difficulty level.
- Device class and input method.
- Timestamp.
- Session id.

## Store Per Session

- Started and completed timestamps.
- Official/practice/calibration mode.
- App version.
- Assessment version.
- Score model version.
- Completion status.
- Invalid-session flags.
- Final score breakdown.

## Why

Real norms, bell curves, reliability, item difficulty, and item discrimination all require raw item-level data. The current beta scoring is only a placeholder and should be replaced after enough clean data exists.
