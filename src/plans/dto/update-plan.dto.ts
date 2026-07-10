import { PartialType, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreatePlanDto } from './create-plan.dto';

export class UpdatePlanDto extends PartialType(CreatePlanDto) {}
