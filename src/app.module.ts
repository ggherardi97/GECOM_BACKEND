import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { PrismaModule } from './prisma/prisma.module';

import { TenantInterceptor } from './common/tenant/tenant.interceptor';

import { AuthModule } from './modules/auth/auth.module';
import { MailModule } from './modules/mailer/mailer.module';
import { UserModule } from './modules/users/user.module';
import { CompanyModule } from './modules/companies/company.module';
import { PasswordResetModule } from './modules/password-reset/password-reset.module';
import { ProcessModule } from './modules/processes/process.module';
import { ProcessTypeModule } from './modules/process-type/process-type.module';
import { EventModule } from './modules/events/event.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { InvoiceModule } from './modules/invoices/invoices.module';
import { InvoiceLineModule } from './modules/invoice-lines/invoice-line.module';
import { ProductModule } from './modules/products/product.module';
import { CurrencyModule } from './modules/currencies/currency.module';
import { TransportsModule } from './modules/transports/transports.module';
import { TransportTypesModule } from './modules/transport-types/transport-types.module';
import { TransportStatusesModule } from './modules/transport-statuses/transport-statuses.module';
import { SavedViewsModule } from './modules/saved-views/saved-views.module';
import { NotificationModule } from './modules/notification/notification.module';
import { KanbanModule } from './modules/kanban/kanban.module';
import { LeadsModule } from './modules/leads/leads.module';
import { AiModule } from './modules/ai/ai.module';
import { TrackingModule } from './modules/tracking/tracking.module';
import { TenantModule } from './modules/tenants/tenant.module';
import { ServiceModule } from './modules/service/service.module';
import { TradeSimulationModule } from './modules/trade-simulation/trade-simulation.module';
import { StatusConfigModule } from './modules/status-config/status-config.module';
import { OpportunitiesModule } from './modules/opportunities/opportunities.module';
import { ContractsModule } from './modules/contracts/contracts.module';
import { PriceTablesModule } from './modules/price-tables/price-tables.module';
import { SalesApprovalsModule } from './modules/sales-approvals/sales-approvals.module';
import { SalesGoalsModule } from './modules/sales-goals/sales-goals.module';
import { BillingPlansModule } from './modules/billing-plans/billing-plans.module';
import { AutomationModule } from './modules/automation/automation.module';
import { FinanceModule } from './modules/finance/finance.module';
import { HrModule } from './modules/hr/hr.module';
import { ProjectOperationsModule } from './modules/project-operations/project-operations.module';
import { AdminConfigModule } from './modules/admin-config/admin-config.module';
import { AccessControlModule } from './modules/access-control/access-control.module';
import { CalendarActivitiesModule } from './modules/calendar-activities/calendar-activities.module';
import { GoogleCalendarModule } from './modules/google-calendar/google-calendar.module';
import { MetadataDesignerModule } from './modules/metadata-designer/metadata-designer.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      username: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
      synchronize: false,
      migrations: [__dirname + '/typeorm/migrations/*{.ts,.js}'],
    }),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MailModule,
    UserModule,
    CompanyModule,
    PrismaModule,
    AuthModule,
    PasswordResetModule,
    ProcessModule,
    ProcessTypeModule,
    EventModule,
    DocumentsModule,
    InvoiceModule,
    ProductModule,
    SavedViewsModule,
    CurrencyModule,
    InvoiceLineModule,
    TransportTypesModule,
    TransportStatusesModule,
    TransportsModule,
    NotificationModule,
    KanbanModule,
    LeadsModule,
    AiModule,
    TrackingModule,
    TenantModule,
    ServiceModule,
    TradeSimulationModule,
    StatusConfigModule,
    OpportunitiesModule,
    ContractsModule,
    PriceTablesModule,
    SalesApprovalsModule,
    SalesGoalsModule,
    BillingPlansModule,
    AutomationModule,
    FinanceModule,
    HrModule,
    ProjectOperationsModule,
    AdminConfigModule,
    AccessControlModule,
    CalendarActivitiesModule,
    GoogleCalendarModule,
    MetadataDesignerModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantInterceptor,
    },
  ],
})
export class AppModule {}
