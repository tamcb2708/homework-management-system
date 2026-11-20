import { IsBoolean, IsEmail, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class LoginDto {
  /** Mã trường (tenant slug), ví dụ "demo" */
  @IsString() @Length(1, 40) schoolCode: string;
  /** Mã học sinh, tên đăng nhập hoặc email */
  @IsString() @Length(1, 200) identifier: string;
  @IsString() @Length(1, 128) password: string;
}

export class PlatformLoginDto {
  @IsEmail() @MaxLength(200) email: string;
  @IsString() @Length(1, 128) password: string;
}

export class ChangePasswordDto {
  @IsString() @Length(1, 128) currentPassword: string;
  @IsString() @Length(8, 128) newPassword: string;
}

export class LogoutDto {
  @IsOptional() @IsBoolean() all?: boolean;
}
