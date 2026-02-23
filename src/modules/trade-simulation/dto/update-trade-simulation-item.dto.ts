import { PartialType } from '@nestjs/swagger';
import { CreateTradeSimulationItemDto } from './create-trade-simulation-item.dto';

export class UpdateTradeSimulationItemDto extends PartialType(CreateTradeSimulationItemDto) {}


