import { AuthGuard } from '@ghostfolio/client/core/auth.guard';
import { internalRoutes } from '@ghostfolio/common/routes/routes';

import { Routes } from '@angular/router';

import { GfNgxPageComponent } from './ngx-page.component';
import { GfNgxScreenerComponent } from './ngx-screener/ngx-screener.component';
import { GfNgxSignalsComponent } from './ngx-signals/ngx-signals.component';
import { GfNgxSymbolComponent } from './ngx-symbol/ngx-symbol.component';

const { screener, symbol } = internalRoutes.ngx.subRoutes;

export const routes: Routes = [
  {
    canActivate: [AuthGuard],
    children: [
      {
        component: GfNgxSignalsComponent,
        path: ''
      },
      {
        component: GfNgxScreenerComponent,
        path: screener.path,
        title: screener.title
      },
      {
        component: GfNgxSymbolComponent,
        path: symbol.path,
        title: symbol.title
      }
    ],
    component: GfNgxPageComponent,
    path: '',
    title: internalRoutes.ngx.title
  }
];
