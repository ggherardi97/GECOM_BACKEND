import {
  IsBoolean,
  IsEmail,
  IsNumberString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CreateFlySearchDto {
  @Matches(/^[A-Z]{3}$/) origin!: string;
  @Matches(/^[A-Z]{3}$/) destination!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) departure_start!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) departure_end!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) return_start!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) return_end!: string;
  @IsNumberString() @Matches(/^\d{1,8}(\.\d{1,2})?$/) max_price!: string;
  @IsBoolean() non_stop!: boolean;
  @IsEmail() @MaxLength(254) email!: string;
}

// Route, date windows and cabin are immutable: a new search starts a new history.
export class UpdateFlySearchDto {
  @ValidateIf((_o, value) => value !== undefined)
  @IsNumberString()
  @Matches(/^\d{1,8}(\.\d{1,2})?$/)
  max_price?: string;
  @ValidateIf((_o, value) => value !== undefined) @IsEmail() @MaxLength(254) email?: string;
  @ValidateIf((_o, value) => value !== undefined) @IsBoolean() active?: boolean;
}
