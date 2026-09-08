import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class GetNgxScreenerDto {
  @IsInt()
  @IsOptional()
  @Max(365)
  @Min(1)
  @Type(() => Number)
  days?: number;

  @IsInt()
  @IsOptional()
  @Max(100)
  @Min(1)
  @Type(() => Number)
  limit?: number;
}
