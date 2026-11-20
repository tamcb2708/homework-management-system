import { Global, Module } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { NotifyService } from '../notifications/notify.service';

@Global()
@Module({ providers: [AuditService, NotifyService], exports: [AuditService, NotifyService] })
export class CommonModule {}
