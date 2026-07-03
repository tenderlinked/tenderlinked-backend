import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { HealthModule } from "./health/health.module";
import { TendersModule } from "./tenders/tenders.module";
import { KeywordsModule } from "./keywords/keywords.module";
import { ScraperModule } from "./scraper/scraper.module";
import { QueueModule } from "./queue/queue.module";
import { LogsModule } from "./logs/logs.module";
import { RecipientsModule } from "./recipients/recipients.module";
import { SettingsModule } from "./settings/settings.module";
import { CronModule } from "./cron/cron.module";
import { EmailModule } from "./email/email.module";
import { SubscriptionsModule } from "./subscriptions/subscriptions.module";
import { PaymentsModule } from "./payments/payments.module";
import { UsersModule } from "./users/users.module";
import { TenantsModule } from './tenants/tenants.module';
import { RolesModule } from './roles/roles.module';
import { PlansModule } from './plans/plans.module';
import { CreditsModule } from './credits/credits.module';

@Module({
  imports: [
    // Load .env variables
    ConfigModule.forRoot({ isGlobal: true }),
    // Global Prisma
    PrismaModule,
    // Feature modules
    HealthModule,
    TendersModule,
    KeywordsModule,
    ScraperModule,
    QueueModule,
    LogsModule,
    RecipientsModule,
    SettingsModule,
    EmailModule,
    CronModule,
    SubscriptionsModule,
    PaymentsModule,
    UsersModule,
    TenantsModule,
    RolesModule,
    PlansModule,
    CreditsModule,
  ],
})
export class AppModule {}
