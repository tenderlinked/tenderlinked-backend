import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray } from 'class-validator';

export class UpdateTenderDto {
  @ApiPropertyOptional({ description: 'The title field' })
  @IsString() @IsOptional() title?: string;
  @ApiPropertyOptional({ description: 'The description field' })
  @IsString() @IsOptional() description?: string;
  @ApiPropertyOptional({ description: 'The tenderValue field' })
  @IsString() @IsOptional() tenderValue?: string;
  @ApiPropertyOptional({ description: 'The emd field' })
  @IsString() @IsOptional() emd?: string;
  @ApiPropertyOptional({ description: 'The applicationCost field' })
  @IsString() @IsOptional() applicationCost?: string;
  @ApiPropertyOptional({ description: 'The bidOpeningDate field' })
  @IsString() @IsOptional() bidOpeningDate?: string;
  @ApiPropertyOptional({ description: 'The aiSummary field' })
  @IsString() @IsOptional() aiSummary?: string;
  @ApiPropertyOptional({ description: 'The tags field' })
  @IsArray() @IsOptional() tags?: string[];
  @ApiPropertyOptional({ description: 'The pdfUrl field' })
  @IsString() @IsOptional() pdfUrl?: string;
  @ApiPropertyOptional({ description: 'The sourceUrl field' })
  @IsString() @IsOptional() sourceUrl?: string;
}
