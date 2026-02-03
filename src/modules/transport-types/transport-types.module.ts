import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { TransportTypesController } from "./transport-types.controller";
import { TransportTypesService } from "./transport-types.service";
import { TransportTypesRepository } from "./transport-types.repository";

@Module({
  imports: [PrismaModule],
  controllers: [TransportTypesController],
  providers: [TransportTypesService, TransportTypesRepository],
})
export class TransportTypesModule {}
