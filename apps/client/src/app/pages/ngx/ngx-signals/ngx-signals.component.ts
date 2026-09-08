import { NgxSignalItem } from '@ghostfolio/client/services/ngx/interfaces/interfaces';
import { NgxService } from '@ghostfolio/client/services/ngx/ngx.service';
import { UserService } from '@ghostfolio/client/services/user/user.service';
import { getLocale } from '@ghostfolio/common/helper';

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
import { NgxSignalDirection } from '@prisma/client';
import { NgxSkeletonLoaderModule } from 'ngx-skeleton-loader';

import { GfNgxSignalCardComponent } from '../ngx-signal-card/ngx-signal-card.component';

interface NgxSignalGroup {
  description: string;
  direction: NgxSignalDirection;
  emptyDescription: string;
  label: string;
  signals: NgxSignalItem[];
}

const MAXIMUM_NUMBER_OF_SIGNALS = 500;

/**
 * The signals of the most recently evaluated trading day, grouped by
 * direction. The store fills one trading day at a time, so an empty page and
 * an empty group are both expected states rather than failures.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GfNgxSignalCardComponent, NgxSkeletonLoaderModule],
  selector: 'gf-ngx-signals',
  styleUrls: ['./ngx-signals.scss'],
  templateUrl: './ngx-signals.html'
})
export class GfNgxSignalsComponent implements OnInit {
  protected readonly hasError = signal(false);
  protected readonly isLoading = signal(true);
  protected readonly locale = signal(getLocale());
  protected readonly signals = signal<NgxSignalItem[]>([]);

  protected readonly evaluationDate = computed(() => {
    return this.signals()[0]?.date ?? null;
  });

  protected readonly groups = computed<NgxSignalGroup[]>(() => {
    const signals = this.signals();

    return [
      {
        description: $localize`Evidence in favour of buying`,
        direction: 'BUY',
        emptyDescription: $localize`No symbol met a buy threshold on this trading day.`,
        label: $localize`Buy`,
        signals: sortByScore({ direction: 'BUY', signals })
      },
      {
        description: $localize`Worth a closer look, but short of a threshold`,
        direction: 'WATCH',
        emptyDescription: $localize`No symbol produced watch-level evidence on this trading day.`,
        label: $localize`Watch`,
        signals: sortByScore({ direction: 'WATCH', signals })
      },
      {
        description: $localize`Evidence against buying`,
        direction: 'AVOID',
        emptyDescription: $localize`No symbol met an avoid threshold on this trading day.`,
        label: $localize`Avoid`,
        signals: sortByScore({ direction: 'AVOID', signals })
      }
    ];
  });

  private readonly destroyRef = inject(DestroyRef);
  private readonly ngxService = inject(NgxService);
  private readonly userService = inject(UserService);

  public constructor() {
    this.userService.stateChanged
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((state) => {
        if (state?.user?.settings?.locale) {
          this.locale.set(state.user.settings.locale);
        }
      });
  }

  public ngOnInit() {
    this.ngxService
      .fetchSignals({ take: MAXIMUM_NUMBER_OF_SIGNALS })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: () => {
          this.hasError.set(true);
          this.isLoading.set(false);
        },
        next: ({ signals }) => {
          this.signals.set(signals ?? []);
          this.isLoading.set(false);
        }
      });
  }
}

/**
 * Strongest evidence first: descending for the buy side, ascending for the
 * avoid side, where the most negative score is the strongest case against.
 */
function sortByScore({
  direction,
  signals
}: {
  direction: NgxSignalDirection;
  signals: NgxSignalItem[];
}) {
  return signals
    .filter((item) => {
      return item.direction === direction;
    })
    .sort((a, b) => {
      return direction === 'AVOID' ? a.score - b.score : b.score - a.score;
    });
}
