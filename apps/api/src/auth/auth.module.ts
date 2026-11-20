import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthService } from './auth.service';
import { PlatformAuthService } from './platform-auth.service';
import { TenantDirectory } from './tenant-directory.service';
import { AuthController, PlatformAuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';

@Global()
@Module({
  controllers: [AuthController, PlatformAuthController],
  providers: [AuthService, PlatformAuthService, TenantDirectory, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [AuthService, TenantDirectory],
})
export class AuthModule {}
