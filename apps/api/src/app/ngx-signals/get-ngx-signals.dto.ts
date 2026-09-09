import { NGX_SIGNAL_TYPE_VALUES } from '@ghostfolio/api/services/ngx-signals/ngx-signals.constants';

import { NgxSignalDirection } from '@prisma/client';
import { Transform, TransformFnParams } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  MaxLength,
  Min
} from 'class-validator';

const MAXIMUM_SYMBOL_LENGTH = 50;
const MAXIMUM_TAKE = 500;

export class GetNgxSignalsDto {
  @IsEnum(NgxSignalDirection)
  @IsOptional()
  direction?: NgxSignalDirection;

  @IsOptional()
  @MaxLength(MAXIMUM_SYMBOL_LENGTH)
  @Transform(({ value }: TransformFnParams): string | undefined => {
    return typeof value === 'string' ? value.trim().toUpperCase() : undefined;
  })
  symbol?: string;

  @IsInt()
  @IsOptional()
  @Max(MAXIMUM_TAKE)
  @Min(1)
  @Transform(({ value }: TransformFnParams): number | undefined => {
    // Query parameters always arrive as strings
    return typeof value === 'string' ? Number.parseInt(value, 10) : undefined;
  })
  take?: number;

  @IsIn(NGX_SIGNAL_TYPE_VALUES)
  @IsOptional()
  type?: string;
}
