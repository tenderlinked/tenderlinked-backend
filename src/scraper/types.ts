import { z } from "zod";

export const TenderSchema = z.object({
  // Core
  district: z.string(),
  title: z.string().min(1, "Title is required"),
  description: z.string().nullable().optional(),
  startDate: z.date().nullable().optional(),
  endDate: z.date().nullable().optional(),
  noticePdfUrl: z.string().nullable().optional(),
  tenderPdfUrl: z.string().nullable().optional(),
  sourceUrl: z.string().url().nullable().optional(), // real detail URL, for reference only
  tenderId: z.string().nullable().optional(),          // NICGEP ID — primary dedup key
  tenderValue: z.string().nullable().optional(),
  tenderAmount: z.number().nullable().optional(),
  applicationCost: z.string().nullable().optional(),
  emd: z.string().nullable().optional(),

  // Location
  city: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  pincode: z.string().nullable().optional(),

  // Basic Details
  tenderRefNumber: z.string().nullable().optional(),
  tenderType: z.string().nullable().optional(),
  formOfContract: z.string().nullable().optional(),
  tenderCategory: z.string().nullable().optional(),
  noOfCovers: z.number().int().nullable().optional(),
  paymentMode: z.string().nullable().optional(),
  withdrawalAllowed: z.boolean().nullable().optional(),
  twoStageBidding: z.boolean().nullable().optional(),
  generalTechEvalAllowed: z.boolean().nullable().optional(),
  itemWiseTechEvalAllowed: z.boolean().nullable().optional(),
  multiCurrencyBOQ: z.boolean().nullable().optional(),
  multiCurrencyFee: z.boolean().nullable().optional(),

  // Payment Instruments
  onlineBankers: z.string().nullable().optional(),

  // Covers Information
  coversInfo: z.string().nullable().optional(),

  // Work Item Details
  productCategory: z.string().nullable().optional(),
  subCategory: z.string().nullable().optional(),
  contractType: z.string().nullable().optional(),
  bidValidityDays: z.number().int().nullable().optional(),
  periodOfWorkDays: z.number().int().nullable().optional(),
  bidOpeningPlace: z.string().nullable().optional(),
  preBidMeetingAddress: z.string().nullable().optional(),
  preBidMeetingDate: z.date().nullable().optional(),
  preBidMeetingPlace: z.string().nullable().optional(),
  ndaPreQualification: z.string().nullable().optional(),
  allowNdaTender: z.boolean().nullable().optional(),
  allowPreferentialBidder: z.boolean().nullable().optional(),

  // Critical Dates
  publishedDate: z.date().nullable().optional(),
  docDownloadStartDate: z.date().nullable().optional(),
  docDownloadEndDate: z.date().nullable().optional(),
  clarificationStartDate: z.date().nullable().optional(),
  clarificationEndDate: z.date().nullable().optional(),
  bidOpeningDate: z.date().nullable().optional(),

  // Tender Fee Details
  vatCharges: z.string().nullable().optional(),
  feePayableTo: z.string().nullable().optional(),
  feePayableAt: z.string().nullable().optional(),
  feeExemptionAllowed: z.string().nullable().optional(),

  // EMD Fee Details
  emdExemptionAllowed: z.string().nullable().optional(),
  emdFeeType: z.string().nullable().optional(),
  emdPercentage: z.string().nullable().optional(),
  emdPayableTo: z.string().nullable().optional(),
  emdPayableAt: z.string().nullable().optional(),

  // Tender Inviting Authority
  invitingAuthorityName: z.string().nullable().optional(),
  invitingAuthorityAddress: z.string().nullable().optional(),
  invitingAuthorityDesignation: z.string().nullable().optional(),
  organisationChain: z.string().nullable().optional(),
});

export type ParsedTender = z.infer<typeof TenderSchema>;

export interface ScrapeResult {
  district: string;
  success: boolean;
  tenders: ParsedTender[];
  newTendersCount?: number;
  error?: string;
}

export type ScrapeStatus = 'PENDING' | 'RUNNING' | 'PAUSED' | 'STOPPED' | 'FAILED' | 'SUCCESS';

export interface ScrapeInstance {
  id: string;
  targetId: string;
  targetName: string;
  targetType: string;
  sourceUrl: string;
  status: ScrapeStatus;
  source: string;
  progress: {
    page: number;
    tendersFound: number;
    totalTenders: number;
    newTendersAdded: number;
  };
  startTime: Date;
  endTime?: Date;
  error?: string;
}
