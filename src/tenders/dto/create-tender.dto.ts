import { IsString, IsOptional, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTenderDto {
  @ApiProperty({ description: 'The title of the tender' })
  @IsString() title: string;

  @ApiPropertyOptional({ description: 'A detailed description of the tender' })
  @IsString() @IsOptional() description?: string;

  @ApiPropertyOptional({ description: 'The monetary value of the tender' })
  @IsString() @IsOptional() tenderValue?: string;

  @ApiPropertyOptional({ description: 'Earnest Money Deposit (EMD) required' })
  @IsString() @IsOptional() emd?: string;

  @ApiPropertyOptional({ description: 'Cost of the application/tender document' })
  @IsString() @IsOptional() applicationCost?: string;

  @ApiPropertyOptional({ description: 'Date when bids will be opened' })
  @IsString() @IsOptional() bidOpeningDate?: string;

  @ApiPropertyOptional({ description: 'AI generated summary' })
  @IsString() @IsOptional() aiSummary?: string;

  @ApiPropertyOptional({ description: 'Tags or keywords associated with the tender', type: [String] })
  @IsArray() @IsOptional() tags?: string[];

  @ApiPropertyOptional({ description: 'URL to the notice PDF' })
  @IsString() @IsOptional() pdfUrl?: string;

  @ApiPropertyOptional({ description: 'Source URL of the tender' })
  @IsString() @IsOptional() sourceUrl?: string;
}
