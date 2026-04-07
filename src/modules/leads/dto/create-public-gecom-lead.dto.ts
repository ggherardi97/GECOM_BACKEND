import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

function trimText(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

export class CreatePublicGecomLeadDto {
  @Transform(({ value }) => trimText(value))
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @Transform(({ value }) => trimText(value))
  @IsString()
  @MinLength(8)
  @MaxLength(50)
  phone!: string;

  @Transform(({ value }) => trimText(value).toLowerCase())
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @Transform(({ value }) => String(value ?? '').trim())
  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  description!: string;

  @IsBoolean()
  consent!: boolean;
}
