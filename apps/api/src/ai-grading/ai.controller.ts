import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators';
import { AiGateService } from './ai-gate.service';

@ApiTags('teacher: ai-grading (disabled – D11)')
@Roles('TEACHER', 'SCHOOL_ADMIN')
@Controller('ai')
export class AiController {
  constructor(private readonly gates: AiGateService) {}

  /** Trạng thái 5 cổng kích hoạt AI. */
  @Get('status') status(@Query('assignmentId') assignmentId?: string) {
    return this.gates.status(assignmentId && /^[0-9a-f-]{36}$/i.test(assignmentId) ? assignmentId : undefined);
  }

  /** Kích hoạt chấm AI – trả 409 AI_GATE_CLOSED khi bất kỳ cổng nào đóng (hiện luôn đóng theo D11). */
  @Roles('TEACHER') @Post('assignments/:id/requests') @HttpCode(200)
  request(@Param('id', ParseUUIDPipe) id: string) { return this.gates.request(id); }
}
