/* ============================================================
   Luckland — shared race choreography
   ------------------------------------------------------------
   Every race in the game (the Downs oval, chariots, the regatta,
   the lantern river, the homing post, the pop-up tracks) draws
   its winner honestly up front and then choreographs the run to
   match. The drama that makes a race worth watching — swells,
   surges, late comebacks — must never break the illusion by
   TELEPORTING a runner.

   Two rules keep it smooth:

   1. Drama is continuous. A surge eases in and out on a raised
      cosine instead of switching on like a light, so the target
      position never steps.
   2. Position is rate-limited and monotone. Whatever the target
      does, a runner only ever moves forward, and never faster
      than MAX_RATE of the course per second. Any jump in the
      target (a lifted cap at the wire, a re-plan) is absorbed as
      a brief burst of speed rather than a jump cut.
   ============================================================ */

/* Fastest a racer may visibly travel, as a fraction of the whole
   course per second. Base pace is ~1/10th of the course per second,
   so this allows a genuine 4x surge while still forbidding a jump. */
export const MAX_RATE = 0.42;

/* A fresh drama track for one racer. */
export function makeDrama(rng) {
  return {
    amp: 0.02 + rng() * 0.035,        // gentle swell either side of the pace
    freq: 0.5 + rng() * 1.3,
    phase: rng() * Math.PI * 2,
    surgeT: 1.5 + rng() * 4,          // one big run at the field
    surgeLen: 1 + rng() * 1.6,
    surgeBoost: 0.05 + rng() * 0.07,
  };
}

/* Offset to add to a racer's base pace at time t.
   `base` is its eased 0..1 position, used to fade the drama out
   before the wire so the booked order re-asserts itself. */
export function dramaOffset(D, t, base) {
  let d = D.amp * Math.sin(t * D.freq + D.phase);
  if (t > D.surgeT && t < D.surgeT + D.surgeLen) {
    // raised cosine: 0 at both ends, so the surge has no edges
    const u = (t - D.surgeT) / D.surgeLen;
    d += D.surgeBoost * (0.5 - 0.5 * Math.cos(u * Math.PI * 2));
  }
  const fade = Math.max(0, Math.min(1, (1 - base) * 2.6)) * Math.min(1, base * 10);
  d *= fade;
  const room = (1 - base) * 0.4;
  return Math.max(-room, Math.min(room, d));
}

/* Move a racer's position toward its target: forward only, and
   never faster than the rate cap. This is the guarantee that no
   racer ever skips across the track. */
export function advance(cur, target, dt, maxRate = MAX_RATE) {
  if (!(target > cur)) return cur;
  return Math.min(target, cur + maxRate * Math.max(0, dt));
}

/* The whole per-frame step for one racer in a booked race.
   Returns the new progress (0..1).
     cur       current progress
     t         seconds since the off
     time      this racer's booked finishing time
     D         its drama track
     dt        frame delta
     isWinner  true for the booked winner
     winnerIn  has the winner already crossed?
   Non-winners are held just short of the line until the winner is
   home; the cap is released through the same rate limiter, so it
   never shows as a jump. */
export function stepRacer(cur, t, time, D, dt, isWinner, winnerIn) {
  const base = Math.min(1, t / time);
  let target = base + dramaOffset(D, t, base);
  if (!isWinner && !winnerIn) target = Math.min(target, 0.985);
  return Math.min(1, advance(cur, target, dt));
}
