import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RolesService } from './roles.service';
import { RolesController, TenantRolesController } from './roles.controller';

@Module({
  imports: [PrismaModule],
  controllers: [RolesController, TenantRolesController],
  providers: [RolesService],
  exports: [RolesService]
})
export class RolesModule {}
