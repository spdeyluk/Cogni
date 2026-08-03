// Keeping exercises from feeling repetitive.
//
// Two separate problems, two helpers:
//
//  1. Drawing each round independently from a bank means a small bank repeats
//     constantly — a 16-item round from 30 items shares about half its
//     questions with the previous round every time. pickFreshRound deals like a
//     shoe of cards instead: an item can't come back until the rest of the bank
//     has been dealt.
//
//  2. Storing an item's correct answer at a fixed position makes that position
//     learnable, and identical on every retake. shuffleIndices gives a fresh
//     presentation order per showing, so the stored index never reaches the UI.

function shuffleInPlace(array, rng) {
  for (let index = array.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [array[index], array[swap]] = [array[swap], array[index]];
  }
  return array;
}

/** A fresh permutation of 0..length-1. */
export function shuffleIndices(length, rng = Math.random) {
  return shuffleInPlace(Array.from({ length }, (_, index) => index), rng);
}

/**
 * Pick `size` items, preferring ones not in `recent`. If the un-served remainder
 * is too small to fill the round it tops up from the rest, so a round is always
 * full even when the bank is smaller than the recent window.
 */
export function pickFreshRound({ pool, size, recent = [], rng = Math.random, idOf = (item) => item.id }) {
  const take = Math.max(0, Math.min(size, pool.length));
  const recentIds = new Set(recent);
  const round = shuffleInPlace(pool.filter((item) => !recentIds.has(idOf(item))), rng).slice(0, take);
  if (round.length < take) {
    const chosen = new Set(round.map(idOf));
    const rest = shuffleInPlace(pool.filter((item) => !chosen.has(idOf(item))), rng);
    round.push(...rest.slice(0, take - round.length));
  }
  return round;
}

/**
 * The rolling window of recently served ids. Capped at poolSize - roundSize so a
 * full round is always still available, which is also exactly the cap that makes
 * the bank cycle completely before anything repeats.
 */
export function rememberServed({ recent = [], servedIds = [], poolSize, roundSize }) {
  const cap = Math.max(0, poolSize - roundSize);
  return [...new Set([...servedIds, ...recent])].slice(0, cap);
}
