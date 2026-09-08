import {
  NgxBreadthPoint,
  NgxPeriodPerformance,
  NgxSectorPerformance
} from '@ghostfolio/client/services/ngx/interfaces/interfaces';
import { NgxService } from '@ghostfolio/client/services/ngx/ngx.service';
import { UserService } from '@ghostfolio/client/services/user/user.service';
import { getLocale } from '@ghostfolio/common/helper';
import { LineChartItem, User } from '@ghostfolio/common/interfaces';
import { internalRoutes } from '@ghostfolio/common/routes/routes';
import { ToggleOption } from '@ghostfolio/common/types';
import { GfLineChartComponent } from '@ghostfolio/ui/line-chart';
import { GfToggleComponent } from '@ghostfolio/ui/toggle';
import { GfValueComponent } from '@ghostfolio/ui/value';

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { RouterModule } from '@angular/router';
import { NgxSkeletonLoaderModule } from 'ngx-skeleton-loader';

import { NGX_CURRENCY } from '../ngx-page.utils';

const DEFAULT_NUMBER_OF_DAYS = 30;
const NUMBER_OF_MOVERS = 10;

/**
 * Exchange-wide screening over the stored daily capture: what moved, which
 * sectors moved with it and how broad the move was.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    GfLineChartComponent,
    GfToggleComponent,
    GfValueComponent,
    MatTableModule,
    NgxSkeletonLoaderModule,
    RouterModule
  ],
  selector: 'gf-ngx-screener',
  styleUrls: ['./ngx-screener.scss'],
  templateUrl: './ngx-screener.html'
})
export class GfNgxScreenerComponent implements OnInit {
  protected readonly NGX_CURRENCY = NGX_CURRENCY;

  protected readonly breadth = signal<NgxBreadthPoint[]>([]);
  protected readonly days = signal(DEFAULT_NUMBER_OF_DAYS);
  protected readonly gainers = signal<NgxPeriodPerformance[]>([]);
  protected readonly hasBreadthError = signal(false);
  protected readonly hasMoversError = signal(false);
  protected readonly hasSectorsError = signal(false);
  protected readonly isLoadingBreadth = signal(true);
  protected readonly isLoadingMovers = signal(true);
  protected readonly isLoadingSectors = signal(true);
  protected readonly locale = signal(getLocale());
  protected readonly losers = signal<NgxPeriodPerformance[]>([]);
  protected readonly sectors = signal<NgxSectorPerformance[]>([]);
  protected readonly user = signal<User | undefined>(undefined);

  protected readonly asiDataItems = computed<LineChartItem[]>(() => {
    return this.breadth().reduce<LineChartItem[]>((items, { asi, date }) => {
      if (asi !== null && asi !== undefined) {
        items.push({ date, value: asi });
      }

      return items;
    }, []);
  });

  protected readonly daysOptions: ToggleOption[] = [
    { label: $localize`7 days`, value: '7' },
    { label: $localize`30 days`, value: '30' },
    { label: $localize`90 days`, value: '90' },
    { label: $localize`1 year`, value: '365' }
  ];

  protected readonly gainersDataSource =
    new MatTableDataSource<NgxPeriodPerformance>([]);
  protected readonly losersDataSource =
    new MatTableDataSource<NgxPeriodPerformance>([]);
  protected readonly moversColumns = [
    'symbol',
    'sector',
    'performance',
    'price',
    'volume'
  ];
  protected readonly sectorsColumns = [
    'sector',
    'performance',
    'companies',
    'breadth',
    'volume'
  ];
  protected readonly sectorsDataSource =
    new MatTableDataSource<NgxSectorPerformance>([]);

  /**
   * The window actually stored, which is narrower than the requested one until
   * enough trading days have been captured.
   */
  protected readonly measuredPeriod = computed(() => {
    const reference = this.gainers()[0] ?? this.losers()[0];

    return reference
      ? { endDate: reference.endDate, startDate: reference.startDate }
      : null;
  });

  protected readonly latestBreadth = computed<NgxBreadthPoint | null>(() => {
    const breadth = this.breadth();

    return breadth.length ? breadth[breadth.length - 1] : null;
  });

  private readonly destroyRef = inject(DestroyRef);
  private readonly ngxService = inject(NgxService);
  private readonly userService = inject(UserService);

  public constructor() {
    this.userService.stateChanged
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((state) => {
        if (state?.user) {
          this.user.set(state.user);

          if (state.user.settings?.locale) {
            this.locale.set(state.user.settings.locale);
          }
        }
      });
  }

  public ngOnInit() {
    this.fetch();
  }

  protected onChangeDays(value: string) {
    const days = Number.parseInt(value, 10);

    if (Number.isFinite(days) && days !== this.days()) {
      this.days.set(days);

      this.fetch();
    }
  }

  protected onSymbolRouterLink(symbol: string) {
    return internalRoutes.ngx.subRoutes.symbol.routerLink(symbol);
  }

  private fetch() {
    const days = this.days();

    this.isLoadingBreadth.set(true);
    this.isLoadingMovers.set(true);
    this.isLoadingSectors.set(true);

    this.ngxService
      .fetchMovers({ days, limit: NUMBER_OF_MOVERS })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: () => {
          this.hasMoversError.set(true);
          this.isLoadingMovers.set(false);
        },
        next: ({ gainers, losers }) => {
          this.hasMoversError.set(false);
          this.gainers.set(gainers ?? []);
          this.losers.set(losers ?? []);
          this.gainersDataSource.data = gainers ?? [];
          this.losersDataSource.data = losers ?? [];
          this.isLoadingMovers.set(false);
        }
      });

    this.ngxService
      .fetchSectors({ days })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: () => {
          this.hasSectorsError.set(true);
          this.isLoadingSectors.set(false);
        },
        next: ({ sectors }) => {
          this.hasSectorsError.set(false);
          this.sectors.set(sectors ?? []);
          this.sectorsDataSource.data = sectors ?? [];
          this.isLoadingSectors.set(false);
        }
      });

    this.ngxService
      .fetchBreadth({ days })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: () => {
          this.hasBreadthError.set(true);
          this.isLoadingBreadth.set(false);
        },
        next: ({ breadth }) => {
          this.hasBreadthError.set(false);
          this.breadth.set(breadth ?? []);
          this.isLoadingBreadth.set(false);
        }
      });
  }
}
