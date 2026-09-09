import {
  NgxSignalItem,
  NgxSymbolHistoryResponse
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
import { ActivatedRoute, RouterModule } from '@angular/router';
import { NgxSkeletonLoaderModule } from 'ngx-skeleton-loader';

import { NGX_CURRENCY } from '../ngx-page.utils';
import { GfNgxSignalCardComponent } from '../ngx-signal-card/ngx-signal-card.component';

const DEFAULT_NUMBER_OF_DAYS = 90;
const MAXIMUM_NUMBER_OF_SIGNALS = 100;

/**
 * One symbol in detail: the stored price history over a selectable window and
 * every signal the rules have produced for it, newest first.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    GfLineChartComponent,
    GfNgxSignalCardComponent,
    GfToggleComponent,
    GfValueComponent,
    NgxSkeletonLoaderModule,
    RouterModule
  ],
  selector: 'gf-ngx-symbol',
  styleUrls: ['./ngx-symbol.scss'],
  templateUrl: './ngx-symbol.html'
})
export class GfNgxSymbolComponent implements OnInit {
  protected readonly NGX_CURRENCY = NGX_CURRENCY;
  protected readonly signalsRouterLink = internalRoutes.ngx.routerLink;

  protected readonly days = signal(DEFAULT_NUMBER_OF_DAYS);
  protected readonly hasHistoryError = signal(false);
  protected readonly hasSignalsError = signal(false);
  protected readonly history = signal<NgxSymbolHistoryResponse | null>(null);
  protected readonly isLoadingHistory = signal(true);
  protected readonly isLoadingSignals = signal(true);
  protected readonly locale = signal(getLocale());
  protected readonly signals = signal<NgxSignalItem[]>([]);
  protected readonly symbol = signal('');
  protected readonly user = signal<User | undefined>(undefined);

  protected readonly daysOptions: ToggleOption[] = [
    { label: $localize`30 days`, value: '30' },
    { label: $localize`90 days`, value: '90' },
    { label: $localize`180 days`, value: '180' },
    { label: $localize`1 year`, value: '365' }
  ];

  protected readonly historicalDataItems = computed<LineChartItem[]>(() => {
    return (this.history()?.historicalData ?? []).map(({ date, price }) => {
      return { date, value: price };
    });
  });

  protected readonly latestDataPoint = computed(() => {
    const historicalData = this.history()?.historicalData ?? [];

    return historicalData.length
      ? historicalData[historicalData.length - 1]
      : null;
  });

  private readonly activatedRoute = inject(ActivatedRoute);
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
    this.activatedRoute.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((parameters) => {
        this.symbol.set((parameters.get('symbol') ?? '').toUpperCase());

        this.fetchHistory();
        this.fetchSignals();
      });
  }

  protected onChangeDays(value: string) {
    const days = Number.parseInt(value, 10);

    if (Number.isFinite(days) && days !== this.days()) {
      this.days.set(days);

      this.fetchHistory();
    }
  }

  private fetchHistory() {
    const symbol = this.symbol();

    if (!symbol) {
      return;
    }

    this.isLoadingHistory.set(true);

    this.ngxService
      .fetchSymbolHistory({ symbol, days: this.days() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: () => {
          this.hasHistoryError.set(true);
          this.isLoadingHistory.set(false);
        },
        next: (history) => {
          this.hasHistoryError.set(false);
          this.history.set(history);
          this.isLoadingHistory.set(false);
        }
      });
  }

  private fetchSignals() {
    const symbol = this.symbol();

    if (!symbol) {
      return;
    }

    this.isLoadingSignals.set(true);

    this.ngxService
      .fetchSignalHistory({ symbol, take: MAXIMUM_NUMBER_OF_SIGNALS })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: () => {
          this.hasSignalsError.set(true);
          this.isLoadingSignals.set(false);
        },
        next: ({ signals }) => {
          this.hasSignalsError.set(false);
          this.signals.set(signals ?? []);
          this.isLoadingSignals.set(false);
        }
      });
  }
}
