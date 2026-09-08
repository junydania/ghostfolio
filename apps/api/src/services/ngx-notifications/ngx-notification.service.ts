import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';
import { FetchService } from '@ghostfolio/api/services/fetch/fetch.service';

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { NgxDigestInput } from './interfaces/interfaces';
import { renderDigest } from './ngx-digest.renderer';

@Injectable()
export class NgxNotificationService implements OnModuleInit {
  private static readonly RESEND_URL = 'https://api.resend.com/emails';

  private readonly logger = new Logger(NgxNotificationService.name);

  private apiKey: string;
  private fromEmail: string;
  private toEmail: string;

  public constructor(
    private readonly configurationService: ConfigurationService,
    private readonly fetchService: FetchService
  ) {}

  public onModuleInit() {
    this.apiKey = this.configurationService.get('RESEND_API_KEY');
    this.fromEmail = this.configurationService.get('NGX_DIGEST_FROM_EMAIL');
    this.toEmail = this.configurationService.get('NGX_DIGEST_TO_EMAIL');
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.fromEmail && this.toEmail);
  }

  /**
   * Sends the daily digest. Delivery failures are logged and swallowed: the
   * digest is a notification, and a mail outage must not fail the scheduled
   * job that produced the signals.
   */
  public async sendDailyDigest(input: NgxDigestInput): Promise<boolean> {
    if (!this.isConfigured()) {
      this.logger.log(
        'Skipping NGX digest: set RESEND_API_KEY, NGX_DIGEST_FROM_EMAIL and NGX_DIGEST_TO_EMAIL to enable it'
      );

      return false;
    }

    const { html, subject, text } = renderDigest(input);

    try {
      const response = await this.fetchService.fetch(
        NgxNotificationService.RESEND_URL,
        {
          body: JSON.stringify({
            html,
            subject,
            text,
            from: this.fromEmail,
            to: [this.toEmail]
          }),
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          method: 'POST',
          signal: AbortSignal.timeout(
            this.configurationService.get('REQUEST_TIMEOUT')
          )
        }
      );

      if (!response.ok) {
        this.logger.error(
          `Resend rejected the NGX digest with status ${response.status}`
        );

        return false;
      }

      this.logger.log(`NGX digest sent: ${subject}`);

      return true;
    } catch (error) {
      this.logger.error(
        `Could not send NGX digest: ${error?.message ?? error}`
      );

      return false;
    }
  }
}
