import { describe, expect, it } from 'vitest';
import { ageInYears, allowedDecisions, applyProviderResult, computeFlags, hashIdNumber, nameMatches } from '@/modules/kyc/domain/rules';
import { redact } from '@/modules/kyc/service';
import type { NormalizedKycResult } from '@/providers/types';

const approved = (over: Partial<NormalizedKycResult> = {}): NormalizedKycResult => ({
  status: 'approved', checks: [{ kind: 'id_document', passed: true }, { kind: 'liveness', passed: true }],
  dateOfBirth: '1995-06-15', nameOnDocument: 'Ada Obi', documentType: 'nin', idNumber: '12345678901', ...over,
});
const now = new Date('2026-11-26T12:00:00Z');

describe('ageInYears', () => {
  it('counts birthdays correctly', () => {
    expect(ageInYears('2008-11-26', now)).toBe(18);
    expect(ageInYears('2008-11-27', now)).toBe(17);
    expect(ageInYears('nonsense', now)).toBeNull();
  });
});

describe('computeFlags', () => {
  it('flags under-18 Runners (market min age from config)', () => {
    expect(computeFlags({ result: approved({ dateOfBirth: '2010-01-01' }), minAgeYears: 18, now, duplicate: false, displayName: 'Ada' }).flags).toContain('underage');
    expect(computeFlags({ result: approved(), minAgeYears: 18, now, duplicate: false, displayName: 'Ada' }).flags).toEqual([]);
  });
  it('flags duplicate identities, failed checks, name mismatch and missing DOB', () => {
    const f = computeFlags({
      result: approved({ dateOfBirth: undefined, checks: [{ kind: 'liveness', passed: false }] }),
      minAgeYears: 18, now, duplicate: true, displayName: 'Chinedu Eze',
    }).flags;
    expect(f).toEqual(expect.arrayContaining(['duplicate_identity', 'failed_checks', 'name_mismatch', 'missing_date_of_birth']));
  });
});

describe('applyProviderResult', () => {
  it('never auto-approves by default (admin approval required)', () => {
    expect(applyProviderResult(approved(), { autoApprove: false, flags: [] })).toEqual({ verification: 'provider_approved', runner: 'in_review', autoApproved: false });
  });
  it('auto-approves only when the market enables it and nothing is flagged', () => {
    expect(applyProviderResult(approved(), { autoApprove: true, flags: [] }).runner).toBe('approved');
    expect(applyProviderResult(approved(), { autoApprove: true, flags: ['underage'] }).runner).toBe('in_review');
  });
  it('maps rejections and resubmission requests', () => {
    expect(applyProviderResult({ status: 'rejected', checks: [] }, { autoApprove: true, flags: [] }).runner).toBe('rejected');
    expect(applyProviderResult({ status: 'needs_resubmission', checks: [] }, { autoApprove: false, flags: [] }).runner).toBe('resubmission_required');
    expect(applyProviderResult({ status: 'submitted', checks: [] }, { autoApprove: false, flags: [] }).runner).toBe('pending');
  });
});

describe('admin decisions', () => {
  it('only allows approval after the provider approved', () => {
    expect(allowedDecisions('provider_approved')).toContain('approve');
    expect(allowedDecisions('provider_rejected')).not.toContain('approve');
    expect(allowedDecisions('created')).toEqual([]);
    expect(allowedDecisions('cancelled')).toEqual([]);
  });
});

describe('identity hashing and names', () => {
  it('normalises ID numbers and separates markets/doc types', () => {
    const a = hashIdNumber('p', 'NG', 'nin', '123 456-78901');
    expect(a).toBe(hashIdNumber('p', 'NG', 'nin', '12345678901'));
    expect(a).not.toBe(hashIdNumber('p', 'VC', 'nin', '12345678901'));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
  it('matches names loosely', () => {
    expect(nameMatches('Ada Obi', 'OBI, Ada Chiamaka')).toBe(true);
    expect(nameMatches('Adé', 'ADE JOHN')).toBe(true);
    expect(nameMatches('Ada', 'Chinedu Eze')).toBe(false);
    expect(nameMatches(null, 'x')).toBeNull();
  });
});

describe('redact', () => {
  it('removes personal data from stored webhook payloads', () => {
    const out = redact({ type: 'applicantReviewed', document: { idNumber: '123', name: 'Ada', dateOfBirth: '1995-01-01', type: 'nin' }, nested: [{ selfie: 'base64...' }] }) as Record<string, any>;
    expect(out.type).toBe('applicantReviewed');
    expect(out.document).toEqual({ idNumber: '[redacted]', name: '[redacted]', dateOfBirth: '[redacted]', type: 'nin' });
    expect(out.nested[0].selfie).toBe('[redacted]');
  });
});
