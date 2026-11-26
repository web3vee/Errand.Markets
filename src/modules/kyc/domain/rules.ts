import { createHmac } from 'node:crypto';
import type { NormalizedKycResult } from '@/providers/types';

export type KycFlag = 'underage' | 'duplicate_identity' | 'name_mismatch' | 'failed_checks' | 'missing_date_of_birth';

/** Whole years between an ISO date of birth and `now` (UTC calendar). */
export function ageInYears(dobIso: string, now: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dobIso);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < mo || (now.getUTCMonth() + 1 === mo && now.getUTCDate() < d)) age--;
  return age >= 0 && age < 130 ? age : null;
}

/** Keyed hash so duplicate identities can be detected without storing ID numbers. */
export function hashIdNumber(pepper: string, marketCode: string, docType: string, idNumber: string): string {
  const normalized = idNumber.replace(/[\s-]/g, '').toUpperCase();
  return createHmac('sha256', `id:${pepper}`).update(`${marketCode}:${docType}:${normalized}`).digest('hex');
}

/** Loose check: every word of the profile name appears in the document name (case/accents ignored). */
export function nameMatches(displayName: string | null, nameOnDocument: string | undefined): boolean | null {
  if (!displayName || !nameOnDocument) return null;
  const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1);
  const doc = new Set(norm(nameOnDocument));
  const words = norm(displayName);
  return words.length > 0 && words.every((w) => doc.has(w));
}

export function computeFlags(input: {
  result: NormalizedKycResult; minAgeYears: number; now: Date; duplicate: boolean; displayName: string | null;
}): { flags: KycFlag[]; ageYears: number | null } {
  const flags: KycFlag[] = [];
  const age = input.result.dateOfBirth ? ageInYears(input.result.dateOfBirth, input.now) : null;
  if (input.result.status === 'approved') {
    if (age === null) flags.push('missing_date_of_birth');
    else if (age < input.minAgeYears) flags.push('underage');
    if (input.result.checks.some((c) => !c.passed)) flags.push('failed_checks');
  }
  if (input.duplicate) flags.push('duplicate_identity');
  if (nameMatches(input.displayName, input.result.nameOnDocument) === false) flags.push('name_mismatch');
  return { flags, ageYears: age };
}

export type RunnerKycStatus = 'not_started' | 'pending' | 'in_review' | 'resubmission_required' | 'approved' | 'rejected';
export type VerificationStatus = 'created' | 'submitted' | 'provider_approved' | 'provider_rejected' | 'needs_resubmission' | 'admin_approved' | 'admin_rejected' | 'cancelled';

/**
 * Provider result → verification + Runner status.
 * Provider approval never approves a Runner by itself unless the market enables auto-approve
 * AND there are no flags (Q8: admin approval required by default).
 */
export function applyProviderResult(result: NormalizedKycResult, opts: { autoApprove: boolean; flags: KycFlag[] }): {
  verification: VerificationStatus; runner: RunnerKycStatus; autoApproved: boolean;
} {
  switch (result.status) {
    case 'submitted':
      return { verification: 'submitted', runner: 'pending', autoApproved: false };
    case 'needs_resubmission':
      return { verification: 'needs_resubmission', runner: 'resubmission_required', autoApproved: false };
    case 'rejected':
      return { verification: 'provider_rejected', runner: 'rejected', autoApproved: false };
    case 'approved': {
      const auto = opts.autoApprove && opts.flags.length === 0;
      return { verification: auto ? 'admin_approved' : 'provider_approved', runner: auto ? 'approved' : 'in_review', autoApproved: auto };
    }
  }
}

export type AdminDecision = 'approve' | 'reject' | 'request_resubmission';
/** Which admin decisions are allowed from a verification's current status. */
export function allowedDecisions(status: VerificationStatus): AdminDecision[] {
  switch (status) {
    case 'provider_approved': return ['approve', 'reject', 'request_resubmission'];
    case 'provider_rejected':
    case 'needs_resubmission': return ['reject', 'request_resubmission'];
    case 'admin_approved': return ['reject'];
    default: return [];
  }
}

export const REJECT_REASONS = ['document_unclear', 'name_mismatch', 'underage', 'duplicate_account', 'failed_liveness', 'other'] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];
