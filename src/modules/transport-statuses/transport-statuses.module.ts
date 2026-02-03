import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { TransportStatusesController } from "./transport-statuses.controller";
import { TransportStatusesService } from "./transport-statuses.service";
import { TransportStatusesRepository } from "./transport-statuses.repository";

@Module({
  imports: [PrismaModule],
  controllers: [TransportStatusesController],
  providers: [TransportStatusesService, TransportStatusesRepository],
  exports: [TransportStatusesService],
})
export class TransportStatusesModule {}
