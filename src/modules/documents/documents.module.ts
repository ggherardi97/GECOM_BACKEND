import { Module } from "@nestjs/common";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";
import { DocumentsRepository } from "./documents.repository";
import { R2Service } from "./r2.service";
import { PrismaModule } from "../../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentsRepository, R2Service],
  exports: [DocumentsService, DocumentsRepository, R2Service],
})
export class DocumentsModule {}
