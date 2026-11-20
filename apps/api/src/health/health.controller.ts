import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators';
import { DbService } from '../prisma/db.service';
import { loadConfig } from '../config/env';

@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly db: DbService) {}

  @Public() @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Public() @Get('ready')
  async ready() {
    await this.db.appClient.$queryRaw`SELECT 1`;
    return { status: 'ok', storage: loadConfig().storageDriver, ai: loadConfig().aiProvider };
  }
}
