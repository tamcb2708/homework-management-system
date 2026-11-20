import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Roles } from '../common/decorators';
import { StudentFilter, StudentService } from './student.service';

class DraftDto {
  /** { [questionId]: answer } */
  @IsObject() answers: Record<string, unknown>;
  @Type(() => Number) @IsInt() @Min(0) revision: number;
}

class ListQuery {
  @IsOptional() @IsIn(['all', 'todo', 'in_progress', 'submitted', 'graded', 'overdue']) filter?: StudentFilter;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
}

@ApiTags('student')
@Roles('STUDENT')
@Controller('student')
export class StudentController {
  constructor(private readonly svc: StudentService) {}

  @Get('assignments') list(@Query() q: ListQuery) { return this.svc.list(q.filter, q.q); }
  @Get('assignments/:id') detail(@Param('id', ParseUUIDPipe) id: string) { return this.svc.detail(id); }
  /** Bắt đầu làm / tiếp tục / nộp lại (khi được phép). */
  @Post('assignments/:id/start') @HttpCode(200) start(@Param('id', ParseUUIDPipe) id: string) { return this.svc.start(id); }
  @Put('submissions/:id/draft') draft(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DraftDto) { return this.svc.saveDraft(id, dto.answers, dto.revision); }
  /** Header Idempotency-Key bắt buộc: gửi trùng chỉ tạo một phiên bản. */
  @Post('submissions/:id/submit') @HttpCode(200)
  submit(@Param('id', ParseUUIDPipe) id: string, @Headers('idempotency-key') key?: string) { return this.svc.submit(id, key); }
  @Get('submissions/:id/result') result(@Param('id', ParseUUIDPipe) id: string, @Query('version') v?: string) {
    return this.svc.result(id, v ? Number(v) : undefined);
  }
}
