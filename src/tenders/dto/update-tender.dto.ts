import { IsString, IsOptional, IsArray } from 'class-validator';

export class UpdateTenderDto {
  @IsString() @IsOptional() title?: string;
  @IsString() @IsOptional() description?: string;
  @IsString() @IsOptional() tenderValue?: string;
  @IsString() @IsOptional() emd?: string;
  @IsString() @IsOptional() applicationCost?: string;
  @IsString() @IsOptional() bidOpeningDate?: string;
  @IsString() @IsOptional() aiSummary?: string;
  @IsArray() @IsOptional() tags?: string[];
  @IsString() @IsOptional() pdfUrl?: string;
  @IsString() @IsOptional() sourceUrl?: string;
}
