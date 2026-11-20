import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Roles } from '../common/decorators';
import { SchoolService } from './school.service';

class SettingsDto {
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) fileAllowedTypes?: string[];
  @IsOptional() @IsInt() @Min(1) @Max(50) fileMaxMb?: number;
  @IsOptional() @IsInt() @Min(0) @Max(120) submitGraceSeconds?: number;
  @IsOptional() @IsIn([0.1, 0.25, 0.5, 1]) scoreStep?: number;
  @IsOptional() @IsBoolean() aiEnabled?: boolean;
  @IsOptional() @IsString() @MaxLength(300) aiApprovalRef?: string | null;
  @IsOptional() @IsString() @MaxLength(200) aiApprovedByName?: string | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100000) aiMonthlyLimitUsd?: number | null;
}

@ApiTags('school-admin')
@Roles('SCHOOL_ADMIN')
@Controller('admin')
export class SchoolController {
  constructor(private readonly svc: SchoolService) {}

  @Get('dashboard') dashboard() { return this.svc.dashboard(); }
  @Get('settings') settings() { return this.svc.settings(); }
  @Patch('settings') update(@Body() dto: SettingsDto) { return this.svc.updateSettings(dto); }
  @Get('audit-logs') audit(@Query('q') q?: string, @Query('sensitive') s?: string, @Query('page') page?: string) {
    return this.svc.auditLogs({ q, sensitive: s === 'true', page: Number(page) });
  }
  @Get('assignments') assignments(@Query('q') q?: string) { return this.svc.assignments(q); }
  @Get('assignments/:id/submissions') submissions(@Param('id', ParseUUIDPipe) id: string) { return this.svc.assignmentSubmissions(id); }
  /** Xem nội dung bài làm – bắt buộc lý do, ghi audit truy cập nhạy cảm. */
  @Get('submissions/:id') read(@Param('id', ParseUUIDPipe) id: string, @Query('reason') reason: string) { return this.svc.readSubmission(id, reason); }
}
