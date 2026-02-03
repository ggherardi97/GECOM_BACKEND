import { IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateTransportStatusDto {
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;
}