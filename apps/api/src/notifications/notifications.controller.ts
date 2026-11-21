import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { DbService } from '../prisma/db.service';
import { currentUser } from '../common/context';
import { notFound } from '../common/errors';
import { pageParams } from '../common/util';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly db: DbService) {}

  @Get()
  list(@Query('unread') unread?: string, @Query('type') type?: string, @Query('page') page?: string) {
    const { skip, take, page: p, pageSize } = pageParams(Number(page), 20);
    return this.db.tenant(async (tx) => {
      const where = { userId: currentUser().id, ...(unread === 'true' ? { readAt: null } : {}), ...(type ? { type: type as any } : {}) };
      const [total, items, unreadCount] = await Promise.all([
        tx.notification.count({ where }),
        tx.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
        tx.notification.count({ where: { userId: currentUser().id, readAt: null } }),
      ]);
      return { total, page: p, pageSize, unreadCount, items: items.map(({ dedupeKey: _d, tenantId: _t, ...n }) => n) };
    });
  }

  @SkipThrottle() @Get('unread-count')
  unreadCount() {
    return this.db.tenant(async (tx) => ({ count: await tx.notification.count({ where: { userId: currentUser().id, readAt: null } }) }));
  }

  @Post(':id/read') @HttpCode(200)
  read(@Param('id', ParseUUIDPipe) id: string) {
    return this.db.tenant(async (tx) => {
      const r = await tx.notification.updateMany({ where: { id, userId: currentUser().id, readAt: null }, data: { readAt: new Date() } });
      if (!r.count && !(await tx.notification.findFirst({ where: { id, userId: currentUser().id } }))) throw notFound();
      return { ok: true };
    });
  }

  @Post('read-all') @HttpCode(200)
  readAll() {
    return this.db.tenant(async (tx) => {
      const r = await tx.notification.updateMany({ where: { userId: currentUser().id, readAt: null }, data: { readAt: new Date() } });
      return { updated: r.count };
    });
  }
}
