import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { SubjectsController } from './subjects.controller';
import { SubjectsRepository } from './subjects.repository';
import { SubjectsService } from './subjects.service';

@Module({
  imports: [PrismaModule],
  controllers: [SubjectsController],
  providers: [SubjectsService, SubjectsRepository],
})
export class SubjectsModule {}
