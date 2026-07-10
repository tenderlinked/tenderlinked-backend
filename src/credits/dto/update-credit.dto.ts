import { PartialType, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateCreditDto } from './create-credit.dto';

export class UpdateCreditDto extends PartialType(CreateCreditDto) {}
