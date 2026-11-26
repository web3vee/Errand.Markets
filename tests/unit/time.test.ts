import { describe, expect, it } from 'vitest';
import { utcToZonedLocal, zonedLocalToUtc } from '@/lib/time';

describe('market time zones (from config)', () => {
  it('Africa/Lagos is UTC+1', () => expect(zonedLocalToUtc('2026-11-27T14:30', 'Africa/Lagos')?.toISOString()).toBe('2026-11-27T13:30:00.000Z'));
  it('America/St_Vincent is UTC-4', () => expect(zonedLocalToUtc('2026-11-27T14:30', 'America/St_Vincent')?.toISOString()).toBe('2026-11-27T18:30:00.000Z'));
  it('handles DST zones (future markets)', () => {
    expect(zonedLocalToUtc('2026-07-01T12:00', 'Europe/London')?.toISOString()).toBe('2026-07-01T11:00:00.000Z');
    expect(zonedLocalToUtc('2026-01-15T12:00', 'Europe/London')?.toISOString()).toBe('2026-01-15T12:00:00.000Z');
  });
  it('round-trips', () => {
    const d = new Date('2026-11-27T18:30:00Z');
    expect(utcToZonedLocal(d, 'America/St_Vincent')).toBe('2026-11-27T14:30');
    expect(zonedLocalToUtc(utcToZonedLocal(d, 'Africa/Lagos'), 'Africa/Lagos')?.toISOString()).toBe(d.toISOString());
  });
  it('rejects malformed input', () => expect(zonedLocalToUtc('tomorrow', 'Africa/Lagos')).toBeNull());
});
