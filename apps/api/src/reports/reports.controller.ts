import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators';
import { ReportsService } from './reports.service';

@ApiTags('teacher: classes & dashboard')
@Roles('TEACHER')
@Controller('teacher')
export class TeacherReportsController {
  constructor(private readonly svc: ReportsService) {}
  @Get('dashboard') dashboard() { return this.svc.teacherDashboard(); }
  @Get('classes') classes() { return this.svc.teacherClasses(); }
  @Get('classes/:id') klass(@Param('id', ParseUUIDPipe) id: string) { return this.svc.teacherClass(id); }
  @Get('classes/:id/students/:studentId/history') history(@Param('id', ParseUUIDPipe) id: string, @Param('studentId', ParseUUIDPipe) sid: string) {
    return this.svc.studentHistory(id, sid);
  }
}

@ApiTags('student')
@Roles('STUDENT')
@Controller('student')
export class StudentReportsController {
  constructor(private readonly svc: ReportsService) {}
  @Get('dashboard') dashboard() { return this.svc.studentDashboard(); }
}
