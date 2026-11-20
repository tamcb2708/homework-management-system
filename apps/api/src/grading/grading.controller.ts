import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from '../common/decorators';
import { TeacherGradingService } from './teacher-grading.service';
import { FeedbackDto, PublishGradesDto, ReturnDto, ScoreDto } from './dto';

@ApiTags('teacher: grading')
@Roles('TEACHER')
@Controller('teacher')
export class GradingController {
  constructor(private readonly svc: TeacherGradingService) {}

  /** Grading workspace: bài làm + bảng điểm. */
  @Get('submissions/:id') view(@Param('id', ParseUUIDPipe) id: string, @Query('version') version?: string) {
    return this.svc.submissionView(id, version ? Number(version) : undefined);
  }
  @Put('grade-details/:id') score(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ScoreDto) { return this.svc.setScore(id, dto); }
  @Put('grades/:id/feedback') feedback(@Param('id', ParseUUIDPipe) id: string, @Body() dto: FeedbackDto) { return this.svc.setFeedback(id, dto); }
  @Post('grades/publish') @HttpCode(200) publish(@Body() dto: PublishGradesDto) { return this.svc.publish(dto.gradeIds); }
  @Post('assignments/:id/publish-grades') @HttpCode(200) publishAll(@Param('id', ParseUUIDPipe) id: string) { return this.svc.publishAll(id); }
  /** Yêu cầu học sinh nộp lại (cả khi chưa nộp lần nào). */
  @Post('assignments/:id/return') @HttpCode(200) returnToStudent(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReturnDto) { return this.svc.returnToStudent(id, dto); }

  @Get('assignments/:id/export.xlsx')
  async export(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { filename, buffer } = await this.svc.exportXlsx(id);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
