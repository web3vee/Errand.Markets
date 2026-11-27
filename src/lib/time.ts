/** Offset (ms) of `timeZone` from UTC at instant `utcMs`, via Intl (no tz database bundled). */
function tzOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/**
 * Interpret a wall-clock "YYYY-MM-DDTHH:mm" (from <input type="datetime-local">) in the market's
 * time zone and return the UTC instant. Handles DST (two-pass) for markets that observe it.
 */
export function zonedLocalToUtc(local: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const guess = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!);
  let utc = guess - tzOffsetMs(guess, timeZone);
  utc = guess - tzOffsetMs(utc, timeZone);
  const d = new Date(utc);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The inverse, for pre-filling a datetime-local input in the market's time zone. */
export function utcToZonedLocal(d: Date, timeZone: string): string {
  const shifted = new Date(d.getTime() + tzOffsetMs(d.getTime(), timeZone));
  return shifted.toISOString().slice(0, 16);
}
