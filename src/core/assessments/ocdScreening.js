// Self-report OCD screening. All statements are original Mindcare content —
// nothing is reproduced from published instruments. This is a screening
// signal for personal tracking, not a diagnostic tool.

export const OCD_RATING_LABELS = ["Not at all", "A little", "Moderately", "A lot", "Extremely"];

export const OCD_SUBSCALE_LABELS = {
  checking: "Checking",
  contamination: "Contamination",
  symmetry: "Order & symmetry",
  obsessing: "Intrusive thoughts",
  rituals: "Mental rituals",
  hoarding: "Saving & discarding"
};

// [subscale, statement] — rated 0-4 for the past month.
export const OCD_QUESTIONS = [
  ["checking", "I go back to double-check locks, switches, or appliances even when I know I already checked."],
  ["checking", "I re-read or re-write messages several times before sending them."],
  ["checking", "I ask other people to reassure me that I did something correctly, more than once."],
  ["contamination", "I avoid touching shared surfaces such as door handles because of germs."],
  ["contamination", "I wash my hands more often or for longer than most people I know."],
  ["contamination", "A feeling of being unclean lingers even after I have washed."],
  ["symmetry", "I feel tense when objects are not arranged exactly the way I like them."],
  ["symmetry", "I spend noticeable time straightening or lining things up."],
  ["symmetry", "Everyday tasks feel wrong unless I do them in a particular order or in the 'right' way."],
  ["obsessing", "Unpleasant thoughts push into my mind even when I try to keep them out."],
  ["obsessing", "I get stuck on distressing thoughts even though I know they don't make sense."],
  ["obsessing", "Certain thoughts feel dangerous to think, so I try to cancel them out."],
  ["rituals", "I count, repeat words, or replay actions in my head to feel at ease."],
  ["rituals", "I repeat routine actions, like walking through a doorway or tapping, until it feels right."],
  ["rituals", "I follow strict private rules to prevent something bad from happening."],
  ["hoarding", "I keep things I don't need because throwing them away feels distressing."],
  ["hoarding", "I worry I will regret discarding something, so I hold on to it."],
  ["impact", "These habits or thoughts take up more than an hour of my day or get in the way of my plans."]
];

export function scoreOcdScreening({ answers }) {
  if (!Array.isArray(answers) || answers.length !== OCD_QUESTIONS.length) {
    throw new Error(`OCD screening requires ${OCD_QUESTIONS.length} rating answers.`);
  }
  const subscales = {};
  for (const key of Object.keys(OCD_SUBSCALE_LABELS)) subscales[key] = 0;
  let total = 0;
  let impactScore = 0;
  answers.forEach((answer, index) => {
    const value = Math.max(0, Math.min(4, Number(answer) || 0));
    const [subscale] = OCD_QUESTIONS[index];
    if (subscale === "impact") {
      impactScore = value;
      return;
    }
    subscales[subscale] += value;
    total += value;
  });
  // 17 symptom items, max 68. Signal bands are screening heuristics only.
  const simpleScore = Math.round((total / 68) * 100);
  const simpleConclusion = total >= 34 ? "High" : total >= 18 ? "Moderate" : "Low";
  const meetsScreenThreshold = total >= 18 && impactScore >= 2;
  return { total, subscales, impactScore, simpleScore, simpleConclusion, meetsScreenThreshold };
}
