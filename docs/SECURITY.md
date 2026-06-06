# Security And Privacy

This app should treat cognitive data as sensitive health-adjacent data even when it avoids medical claims.

## Frontend Rules

- Do not trust client-calculated leaderboard scores.
- Store raw session data locally only when needed.
- Never place secrets in frontend code.
- Avoid advertising trackers around cognitive performance data.

## Backend Rules For Later

- Validate all session submissions server-side.
- Use rate limits and anomaly detection.
- Reject impossible reaction times.
- Version every assessment and scoring formula.
- Keep audit logs for score submissions.
- Separate public leaderboard names from private identity.
- Support data export and account deletion.

## Claims

Use performance/wellness language until clinical claims are supported by actual evidence and legal review.

Safer wording:

- Cognitive performance training
- Focus and working memory exercises
- Track training progress over time

Avoid unsupported claims:

- Treats ADHD
- Prevents dementia
- Repairs brain damage
- Clinically proven IQ improvement
