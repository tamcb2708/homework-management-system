import { Body, Controller, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { PlatformAuthService } from './platform-auth.service';
import { TenantDirectory } from './tenant-directory.service';
import { AllowPendingPassword, PlatformRealm, Public } from '../common/decorators';
import { ChangePasswordDto, LoginDto, LogoutDto, PlatformLoginDto } from './dto';
import { clearPlatformCookies, clearTenantCookies, COOKIES, setPlatformCookies, setTenantCookies } from './cookies';
import { ctx } from '../common/context';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly tenants: TenantDirectory) {}

  /** Thông tin công khai của trường (tên hiển thị trên trang đăng nhập). */
  @Public() @Get('schools/:code')
  school(@Param('code') code: string) {
    return this.tenants.publicInfo(code);
  }

  @Public() @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login') @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.login(dto.schoolCode, dto.identifier, dto.password);
    setTenantCookies(res, r.access, r.refresh, r.csrf);
    return { user: r.profile };
  }

  @Public() @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh') @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      const r = await this.auth.refresh(req.cookies?.[COOKIES.refresh()]);
      setTenantCookies(res, r.access, r.refresh, r.csrf);
      return { ok: true };
    } catch (e: any) {
      if (e?.code !== 'REFRESH_RETRY') clearTenantCookies(res);
      throw e;
    }
  }

  @AllowPendingPassword() @Post('logout') @HttpCode(200)
  async logout(@Body() dto: LogoutDto, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(!!dto.all);
    clearTenantCookies(res);
    return { ok: true };
  }

  @AllowPendingPassword() @Get('me')
  me() {
    return this.auth.profile();
  }

  @AllowPendingPassword() @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('change-password') @HttpCode(200)
  async changePassword(@Body() dto: ChangePasswordDto, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.changePassword(dto.currentPassword, dto.newPassword);
    setTenantCookies(res, r.access, r.refresh, r.csrf);
    return { ok: true };
  }
}

@ApiTags('platform-auth')
@Controller('platform/auth')
export class PlatformAuthController {
  constructor(private readonly auth: PlatformAuthService) {}

  @Public() @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login') @HttpCode(200)
  async login(@Body() dto: PlatformLoginDto, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.login(dto.email, dto.password);
    setPlatformCookies(res, r.access, r.refresh, r.csrf);
    return { user: r.profile };
  }

  @Public() @Post('refresh') @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      const r = await this.auth.refresh(req.cookies?.[COOKIES.pRefresh()]);
      setPlatformCookies(res, r.access, r.refresh, r.csrf);
      return { ok: true };
    } catch (e: any) {
      if (e?.code !== 'REFRESH_RETRY') clearPlatformCookies(res);
      throw e;
    }
  }

  @PlatformRealm() @Get('me')
  me() {
    return this.auth.validate(ctx().platformUserId!, ctx().platformSessionId!);
  }

  @PlatformRealm() @Post('logout') @HttpCode(200)
  async logout(@Res({ passthrough: true }) res: Response) {
    await this.auth.logout();
    clearPlatformCookies(res);
    return { ok: true };
  }
}
