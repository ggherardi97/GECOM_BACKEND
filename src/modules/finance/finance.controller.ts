import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { FinanceService } from './finance.service';
import {
  ApplyFinancialImportDto,
  CreateFinancialBankAccountDto,
  CreateFinancialBankMovementDto,
  CreateFinancialCategoryDto,
  CreateFinancialCostCenterDto,
  CreateFinancialPayableDto,
  CreateFinancialPayablePaymentDto,
  CreateFinancialReceivableDto,
  CreateFinancialReceivablePaymentDto,
  GenerateReceivableFromInvoiceDto,
  ReconcileFinancialBankAccountDto,
  ReconcileFinancialBankMovementDto,
  ReviewFinancialImportLineDto,
  UploadFinancialImportDto,
  UpdateFinancialBankAccountDto,
  UpdateFinancialBankMovementDto,
  UpdateFinancialCategoryDto,
  UpdateFinancialCostCenterDto,
  UpdateFinancialPayableDto,
  UpdateFinancialPayablePaymentDto,
  UpdateFinancialReceivableDto,
  UpdateFinancialReceivablePaymentDto,
} from './dto/finance.dto';

type AuthUser = {
  id: string;
  tenant_id: string;
};

@ApiTags('finance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('finance')
export class FinanceController {
  constructor(private readonly service: FinanceService) {}

  private getUser(req: Request): AuthUser {
    const user = ((req as any)?.user ?? {}) as any;
    const id = String(user.id ?? user.user_id ?? user.userId ?? user.sub ?? '').trim();
    const tenantId = String(user.tenant_id ?? user.tenantId ?? '').trim();

    if (!id || !tenantId) {
      throw new UnauthorizedException('Authentication context missing: req.user.id / req.user.tenant_id');
    }

    return { id, tenant_id: tenantId };
  }

  @Get('cost-centers')
  listCostCenters(@Req() req: Request, @Query('q') q?: string) {
    return this.service.listCostCenters(this.getUser(req), q);
  }

  @Get('cost-centers/:id')
  findCostCenterById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findCostCenterById(this.getUser(req), id);
  }

  @Post('cost-centers')
  createCostCenter(@Req() req: Request, @Body() dto: CreateFinancialCostCenterDto) {
    return this.service.createCostCenter(this.getUser(req), dto);
  }

  @Patch('cost-centers/:id')
  updateCostCenter(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateFinancialCostCenterDto) {
    return this.service.updateCostCenter(this.getUser(req), id, dto);
  }

  @Delete('cost-centers/:id')
  removeCostCenter(@Req() req: Request, @Param('id') id: string) {
    return this.service.removeCostCenter(this.getUser(req), id);
  }

  @Get('categories')
  listCategories(
    @Req() req: Request,
    @Query('q') q?: string,
    @Query('kind') kind?: string,
  ) {
    return this.service.listCategories(this.getUser(req), { q, kind });
  }

  @Get('categories/:id')
  findCategoryById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findCategoryById(this.getUser(req), id);
  }

  @Post('categories')
  createCategory(@Req() req: Request, @Body() dto: CreateFinancialCategoryDto) {
    return this.service.createCategory(this.getUser(req), dto);
  }

  @Patch('categories/:id')
  updateCategory(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateFinancialCategoryDto) {
    return this.service.updateCategory(this.getUser(req), id, dto);
  }

  @Delete('categories/:id')
  removeCategory(@Req() req: Request, @Param('id') id: string) {
    return this.service.removeCategory(this.getUser(req), id);
  }

  @Get('bank-accounts')
  listBankAccounts(@Req() req: Request, @Query('q') q?: string, @Query('is_active') is_active?: string) {
    return this.service.listBankAccounts(this.getUser(req), { q, is_active });
  }

  @Get('bank-accounts/:id')
  findBankAccountById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findBankAccountById(this.getUser(req), id);
  }

  @Post('bank-accounts')
  createBankAccount(@Req() req: Request, @Body() dto: CreateFinancialBankAccountDto) {
    return this.service.createBankAccount(this.getUser(req), dto);
  }

  @Patch('bank-accounts/:id')
  updateBankAccount(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateFinancialBankAccountDto) {
    return this.service.updateBankAccount(this.getUser(req), id, dto);
  }

  @Patch('bank-accounts/:id/reconcile')
  reconcileBankAccount(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: ReconcileFinancialBankAccountDto,
  ) {
    return this.service.reconcileBankAccount(this.getUser(req), id, dto);
  }

  @Delete('bank-accounts/:id')
  removeBankAccount(@Req() req: Request, @Param('id') id: string) {
    return this.service.removeBankAccount(this.getUser(req), id);
  }

  @Get('bank-movements')
  listBankMovements(
    @Req() req: Request,
    @Query('bank_account_id') bank_account_id?: string,
    @Query('category_id') category_id?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('reconciled') reconciled?: string,
  ) {
    return this.service.listBankMovements(this.getUser(req), {
      bank_account_id,
      category_id,
      from,
      to,
      reconciled,
    });
  }

  @Get('bank-movements/:id')
  findBankMovementById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findBankMovementById(this.getUser(req), id);
  }

  @Post('bank-movements')
  createBankMovement(@Req() req: Request, @Body() dto: CreateFinancialBankMovementDto) {
    return this.service.createBankMovement(this.getUser(req), dto);
  }

  @Patch('bank-movements/:id')
  updateBankMovement(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateFinancialBankMovementDto) {
    return this.service.updateBankMovement(this.getUser(req), id, dto);
  }

  @Patch('bank-movements/:id/reconcile')
  reconcileBankMovement(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: ReconcileFinancialBankMovementDto,
  ) {
    return this.service.reconcileBankMovement(this.getUser(req), id, dto);
  }

  @Delete('bank-movements/:id')
  removeBankMovement(@Req() req: Request, @Param('id') id: string) {
    return this.service.removeBankMovement(this.getUser(req), id);
  }

  @Get('receivables')
  listReceivables(
    @Req() req: Request,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('entry_group') entry_group?: string,
    @Query('company_id') company_id?: string,
    @Query('from_due') from_due?: string,
    @Query('to_due') to_due?: string,
  ) {
    return this.service.listReceivables(this.getUser(req), { q, status, entry_group, company_id, from_due, to_due });
  }

  @Get('receivables/:id')
  findReceivableById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findReceivableById(this.getUser(req), id);
  }

  @Post('receivables')
  createReceivable(@Req() req: Request, @Body() dto: CreateFinancialReceivableDto) {
    return this.service.createReceivable(this.getUser(req), dto);
  }

  @Post('receivables/from-invoice/:invoiceId')
  generateReceivablesFromInvoice(
    @Req() req: Request,
    @Param('invoiceId') invoiceId: string,
    @Body() dto: GenerateReceivableFromInvoiceDto,
  ) {
    return this.service.generateReceivablesFromInvoice(this.getUser(req), invoiceId, dto);
  }

  @Patch('receivables/:id')
  updateReceivable(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateFinancialReceivableDto) {
    return this.service.updateReceivable(this.getUser(req), id, dto);
  }

  @Delete('receivables/:id')
  removeReceivable(@Req() req: Request, @Param('id') id: string) {
    return this.service.removeReceivable(this.getUser(req), id);
  }

  @Post('receivables/:id/payments')
  createReceivablePayment(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: CreateFinancialReceivablePaymentDto,
  ) {
    return this.service.createReceivablePayment(this.getUser(req), id, dto);
  }

  @Patch('receivables/:id/payments/:paymentId')
  updateReceivablePayment(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @Body() dto: UpdateFinancialReceivablePaymentDto,
  ) {
    return this.service.updateReceivablePayment(this.getUser(req), id, paymentId, dto);
  }

  @Delete('receivables/:id/payments/:paymentId')
  removeReceivablePayment(@Req() req: Request, @Param('id') id: string, @Param('paymentId') paymentId: string) {
    return this.service.removeReceivablePayment(this.getUser(req), id, paymentId);
  }

  @Get('payables')
  listPayables(
    @Req() req: Request,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('entry_group') entry_group?: string,
    @Query('company_id') company_id?: string,
    @Query('from_due') from_due?: string,
    @Query('to_due') to_due?: string,
  ) {
    return this.service.listPayables(this.getUser(req), { q, status, entry_group, company_id, from_due, to_due });
  }

  @Get('payables/:id')
  findPayableById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findPayableById(this.getUser(req), id);
  }

  @Post('payables')
  createPayable(@Req() req: Request, @Body() dto: CreateFinancialPayableDto) {
    return this.service.createPayable(this.getUser(req), dto);
  }

  @Patch('payables/:id')
  updatePayable(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateFinancialPayableDto) {
    return this.service.updatePayable(this.getUser(req), id, dto);
  }

  @Delete('payables/:id')
  removePayable(@Req() req: Request, @Param('id') id: string) {
    return this.service.removePayable(this.getUser(req), id);
  }

  @Post('payables/:id/payments')
  createPayablePayment(@Req() req: Request, @Param('id') id: string, @Body() dto: CreateFinancialPayablePaymentDto) {
    return this.service.createPayablePayment(this.getUser(req), id, dto);
  }

  @Patch('payables/:id/payments/:paymentId')
  updatePayablePayment(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @Body() dto: UpdateFinancialPayablePaymentDto,
  ) {
    return this.service.updatePayablePayment(this.getUser(req), id, paymentId, dto);
  }

  @Delete('payables/:id/payments/:paymentId')
  removePayablePayment(@Req() req: Request, @Param('id') id: string, @Param('paymentId') paymentId: string) {
    return this.service.removePayablePayment(this.getUser(req), id, paymentId);
  }

  @Get('cash-flow/projection')
  getCashFlowProjection(
    @Req() req: Request,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.getCashFlowProjection(this.getUser(req), from, to);
  }

  @Get('import-jobs')
  listImportJobs(@Req() req: Request, @Query('status') status?: string, @Query('bank_account_id') bank_account_id?: string) {
    return this.service.listImportJobs(this.getUser(req), { status, bank_account_id });
  }

  @Get('import-jobs/:id')
  findImportJobById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findImportJobById(this.getUser(req), id);
  }

  @Post('import-jobs/upload')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  uploadImportJob(
    @Req() req: Request,
    @UploadedFile() file: any,
    @Body() dto: UploadFinancialImportDto,
  ) {
    return this.service.uploadImportJob(this.getUser(req), dto, file);
  }

  @Post('import-jobs/:id/reanalyze')
  reanalyzeImportJob(@Req() req: Request, @Param('id') id: string) {
    return this.service.reanalyzeImportJob(this.getUser(req), id);
  }

  @Patch('import-jobs/:id/lines/:lineId')
  reviewImportLine(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() dto: ReviewFinancialImportLineDto,
  ) {
    return this.service.reviewImportLine(this.getUser(req), id, lineId, dto);
  }

  @Post('import-jobs/:id/apply')
  applyImportJob(@Req() req: Request, @Param('id') id: string, @Body() dto: ApplyFinancialImportDto) {
    return this.service.applyImportJob(this.getUser(req), id, dto);
  }
}
