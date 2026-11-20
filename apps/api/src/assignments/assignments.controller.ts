import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators';
import { AssignmentsService } from './assignments.service';
import { CreateAssignmentDto, ListAssignmentsQuery, PublishDto, QuestionDto, ReorderDto, UpdateAssignmentDto } from './dto';

@ApiTags('teacher: assignments')
@Roles('TEACHER')
@Controller('teacher')
export class AssignmentsController {
  constructor(private readonly svc: AssignmentsService) {}

  /** Lớp/môn giáo viên được phân công (dùng cho form tạo & giao bài). */
  @Get('teaching') teaching() { return this.svc.teachingOptions(); }

  @Get('assignments') list(@Query() q: ListAssignmentsQuery) { return this.svc.list(q); }
  @Post('assignments') create(@Body() dto: CreateAssignmentDto) { return this.svc.create(dto); }
  @Get('assignments/:id') get(@Param('id', ParseUUIDPipe) id: string) { return this.svc.get(id); }
  @Patch('assignments/:id') update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAssignmentDto) { return this.svc.update(id, dto); }
  @Delete('assignments/:id') remove(@Param('id', ParseUUIDPipe) id: string) { return this.svc.remove(id); }

  @Post('assignments/:id/questions') addQuestion(@Param('id', ParseUUIDPipe) id: string, @Body() dto: QuestionDto) { return this.svc.addQuestion(id, dto); }
  @Put('assignments/:id/questions/order') reorder(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReorderDto) { return this.svc.reorder(id, dto); }
  @Put('questions/:qid') updateQuestion(@Param('qid', ParseUUIDPipe) qid: string, @Body() dto: QuestionDto) { return this.svc.updateQuestion(qid, dto); }
  @Delete('questions/:qid') deleteQuestion(@Param('qid', ParseUUIDPipe) qid: string) { return this.svc.deleteQuestion(qid); }

  /** Giao bài: chọn lớp/học sinh, thời gian mở, hạn nộp, nộp muộn. */
  @Post('assignments/:id/publish') @HttpCode(200) publish(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PublishDto) { return this.svc.publish(id, dto); }
  @Post('assignments/:id/revoke') @HttpCode(200) revoke(@Param('id', ParseUUIDPipe) id: string) { return this.svc.setState(id, 'revoke'); }
  @Post('assignments/:id/restore') @HttpCode(200) restore(@Param('id', ParseUUIDPipe) id: string) { return this.svc.setState(id, 'restore'); }
  @Post('assignments/:id/archive') @HttpCode(200) archive(@Param('id', ParseUUIDPipe) id: string) { return this.svc.setState(id, 'archive'); }
  @Post('assignments/:id/duplicate') duplicate(@Param('id', ParseUUIDPipe) id: string) { return this.svc.duplicate(id); }

  /** Theo dõi trạng thái từng học sinh. */
  @Get('assignments/:id/roster') roster(@Param('id', ParseUUIDPipe) id: string) { return this.svc.roster(id); }
}
