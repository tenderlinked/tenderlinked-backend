import { z } from "zod";

export const TenderSchema = z.object({
  district: z.string(),
  title: z.string().min(1, "Title is required"),
  description: z.string().nullable().optional(),
  startDate: z.date().nullable().optional(),
  endDate: z.date().nullable().optional(),
  noticePdfUrl: z.string().url().nullable().optional(),
  tenderPdfUrl: z.string().url().nullable().optional(),
  sourceUrl: z.string().url(),
  emd: z.string().nullable().optional(),
  tenderValue: z.string().nullable().optional(),
  applicationCost: z.string().nullable().optional(),
});

export type ParsedTender = z.infer<typeof TenderSchema>;

export interface ScrapeResult {
  district: string;
  success: boolean;
  tenders: ParsedTender[];
  newTendersCount?: number;
  error?: string;
}
