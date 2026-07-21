export const REDACTED_PLACEHOLDER = '__PREMIUM_LOCKED__';
export const CREDIT_REDACTED_PLACEHOLDER = '__CREDIT_LOCKED__';

export function redactTenderBasedOnPlan(tender: any, allowedFields: string[], isUnlockedWithCredit: boolean = false, isSuperAdmin: boolean = false) {
  if (!tender) return tender;

  if (isSuperAdmin) {
    return {
      ...tender,
      hasDocuments: !!(tender.documentsDownloaded || tender.noticePdfUrl || tender.tenderPdfUrl)
    };
  }

  const redactedTender = { ...tender };
  
  // Define which fields are considered "Premium" and can be gated.
  const potentiallyGatedFields = [
    'tenderValue',
    'emd',
    'applicationCost',
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

  // AI Summary ALWAYS requires a credit unlock, regardless of plan
  if (redactedTender.aiSummary && !isUnlockedWithCredit) {
    redactedTender.aiSummary = REDACTED_PLACEHOLDER;
  }

  // Document fields are gated behind credits if they aren't explicitly allowed by the plan
  // If explicitly allowed by plan, no credit needed. If not allowed, they need a credit unlock.
  for (const field of documentFields) {
    if (!allowedFields.includes(field) && !isUnlockedWithCredit) {
      redactedTender[field] = CREDIT_REDACTED_PLACEHOLDER;
    }
  }
  const isSessionDependent = (url: string) => url?.includes('nicgep/app') || url?.includes('session=');
  const hasValidNotice = tender.noticePdfUrl && tender.noticePdfUrl.trim() !== '' && !isSessionDependent(tender.noticePdfUrl);
  const hasValidTender = tender.tenderPdfUrl && tender.tenderPdfUrl.trim() !== '' && !isSessionDependent(tender.tenderPdfUrl);
  
  redactedTender.hasDocuments = !!(tender.documentsDownloaded || hasValidNotice || hasValidTender);

  return redactedTender;
}
