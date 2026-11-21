import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { PlatformRealm } from '../common/decorators';
import { PlatformService } from './platform.service';

class CreateTenantDto {
  @IsString() @Length(3, 200) name: string;
  /** Mã trường (dùng khi đăng nhập / subdomain) */
  @IsString() @Length(1, 40) slug: string;
  @IsOptional() @IsString() @MaxLength(64) timezone?: string;
  @IsOptional() @IsInt() @Min(1) @Max(100000) maxUsers?: number;
  @IsOptional() @IsInt() @Min(10) @Max(1000000) maxStorageMb?: number;
  @IsString() @Length(2, 120) adminFullName: string;
  @IsEmail() @MaxLength(200) adminEmail: string;
}

class UpdateTenantDto {
  @IsOptional() @IsString() @Length(3, 200) name?: string;
  @IsOptional() @IsInt() @Min(1) @Max(100000) maxUsers?: number | null;
  @IsOptional() @IsInt() @Min(10) @Max(1000000) maxStorageMb?: number | null;
}

class KillSwitchDto { @IsBoolean() enabled: boolean }

@ApiTags('platform')
@PlatformRealm()
@Controller('platform')
export class PlatformController {
  constructor(private readonly svc: PlatformService) {}

  @Get('stats') stats() { return this.svc.stats(); }
  @Post('tenants') create(@Body() dto: CreateTenantDto) { return this.svc.createTenant(dto); }
  @Patch('tenants/:id') update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTenantDto) { return this.svc.updateTenant(id, dto); }
  @Post('tenants/:id/suspend') @HttpCode(200) suspend(@Param('id', ParseUUIDPipe) id: string) { return this.svc.setStatus(id, 'SUSPENDED'); }
  @Post('tenants/:id/activate') @HttpCode(200) activate(@Param('id', ParseUUIDPipe) id: string) { return this.svc.setStatus(id, 'ACTIVE'); }
  @Get('audit-logs') audit(@Query('page') page?: string) { return this.svc.auditLogs(Number(page)); }
  @Get('settings/ai') ai() { return this.svc.aiSettings(); }
  @Put('settings/ai') setAi(@Body() dto: KillSwitchDto) { return this.svc.setKillSwitch(dto.enabled); }
}
