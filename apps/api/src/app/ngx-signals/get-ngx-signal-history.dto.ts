import { NGX_SIGNAL_TYPE_VALUES } from '@ghostfolio/api/services/ngx-signals/ngx-signals.constants';

import { Transform, TransformFnParams } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

const MAXIMUM_TAKE = 500;

export class GetNgxSignalHistoryDto {
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
