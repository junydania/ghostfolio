import { internalRoutes } from '@ghostfolio/common/routes/routes';
import {
  GfPageTabsComponent,
  TabConfiguration
} from '@ghostfolio/ui/page-tabs';

import { ChangeDetectionStrategy, Component } from '@angular/core';
import { addIcons } from 'ionicons';
import { pulseOutline, statsChartOutline } from 'ionicons/icons';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page' },
  imports: [GfPageTabsComponent],
  selector: 'gf-ngx-page',
  styleUrls: ['./ngx-page.scss'],
  templateUrl: './ngx-page.html'
})
export class GfNgxPageComponent {
  protected readonly tabs: TabConfiguration[] = [
    {
      iconName: 'pulse-outline',
      label: $localize`Signals`,
      routerLink: internalRoutes.ngx.routerLink
    },
    {
      iconName: 'stats-chart-outline',
      label: internalRoutes.ngx.subRoutes.screener.title,
      routerLink: internalRoutes.ngx.subRoutes.screener.routerLink
    }
  ];

  public constructor() {
    addIcons({ pulseOutline, statsChartOutline });
  }
}
