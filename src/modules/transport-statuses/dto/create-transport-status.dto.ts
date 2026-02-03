import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class CreateTransportStatusDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;
}