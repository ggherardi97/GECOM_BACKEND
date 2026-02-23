import { PartialType } from '@nestjs/swagger';
import { CreateTradeSimulationCostDto } from './create-trade-simulation-cost.dto';

export class UpdateTradeSimulationCostDto extends PartialType(CreateTradeSimulationCostDto) {}


