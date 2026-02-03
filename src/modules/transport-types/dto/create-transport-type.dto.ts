import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class CreateTransportTypeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;
}
