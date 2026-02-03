import { IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateTransportTypeDto {
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;
}