export const REDACTED_PLACEHOLDER = '__PREMIUM_LOCKED__';
export const CREDIT_REDACTED_PLACEHOLDER = '__CREDIT_LOCKED__';

export function redactTenderBasedOnPlan(tender: any, allowedFields: string[], isUnlockedWithCredit: boolean = false) {
  if (!tender) return tender;

  const redactedTender = { ...tender };
  
  // Define which fields are considered "Premium" and can be gated.
  const potentiallyGatedFields = [
    'tenderValue',
    'emd',
    'applicationCost',
    'aiSummary',
    'tags'
  ];

  const documentFields = [
    'noticePdfUrl',
    'tenderPdfUrl'
  ];

  for (const field of potentiallyGatedFields) {
    if (redactedTender[field] && !allowedFields.includes(field)) {
      if (Array.isArray(redactedTender[field])) {
        redactedTender[field] = [REDACTED_PLACEHOLDER];
      } else {
        redactedTender[field] = REDACTED_PLACEHOLDER;
      }
    }
  }

  // Document fields are gated behind credits if they aren't explicitly allowed by the plan
  // If explicitly allowed by plan, no credit needed. If not allowed, they need a credit unlock.
  for (const field of documentFields) {
    if (!allowedFields.includes(field) && !isUnlockedWithCredit) {
      redactedTender[field] = CREDIT_REDACTED_PLACEHOLDER;
    }
  }

  return redactedTender;
}
