import { Module } from "@nestjs/common";
import { PrismaModule } from "src/prisma/prisma.module";
import { EventController } from "./event.controller";
import { EventService } from "./event.service";
import { EventRepository } from "./event.repository";

@Module({
  imports: [PrismaModule], // ✅ This makes PrismaService available here
  controllers: [EventController],
  providers: [EventService, EventRepository],
  exports: [EventService], // ✅ Optional (if other modules/services inject EventService)
})
export class EventModule {}
