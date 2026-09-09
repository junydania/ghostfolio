import { NgxSignalItem } from '@ghostfolio/client/services/ngx/interfaces/interfaces';
import { getLocale } from '@ghostfolio/common/helper';
import { internalRoutes } from '@ghostfolio/common/routes/routes';

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input
} from '@angular/core';
import { RouterModule } from '@angular/router';

import {
  getAsiTrendSourceLabel,
  getDirectionLabel,
  getRegimeLabel,
  toNgxSignalViewModel
} from '../ngx-page.utils';

/**
 * A single signal rendered as evidence: the values that were measured, the
 * thresholds they were measured against, how much history backed them and the
 * market regime at the time. The score alone cannot support a buying
 * decision, so it is never shown on its own.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterModule],
  selector: 'gf-ngx-signal-card',
  styleUrls: ['./ngx-signal-card.component.scss'],
  templateUrl: './ngx-signal-card.component.html'
})
export class GfNgxSignalCardComponent {
  public readonly locale = input(getLocale());
  public readonly showDate = input(true);
  public readonly showSymbolLink = input(true);
  public readonly signal = input.required<NgxSignalItem>();

  protected readonly getAsiTrendSourceLabel = getAsiTrendSourceLabel;
  protected readonly getDirectionLabel = getDirectionLabel;
  protected readonly getRegimeLabel = getRegimeLabel;

  protected readonly viewModel = computed(() => {
    return toNgxSignalViewModel({
      locale: this.locale(),
      signal: this.signal()
    });
  });

  protected readonly symbolRouterLink = computed(() => {
    return internalRoutes.ngx.subRoutes.symbol.routerLink(this.signal().symbol);
  });
}
