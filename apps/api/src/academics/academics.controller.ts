import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators';
import { AcademicsService } from './academics.service';
import { ClassDto, EnrollDto, SchoolYearDto, SemesterDto, SubjectDto, TeachingDto, UpdateClassDto, UpdateSubjectDto } from './dto';

@ApiTags('school-admin: academics')
@Roles('SCHOOL_ADMIN')
@Controller('admin')
export class AcademicsController {
  constructor(private readonly svc: AcademicsService) {}

  @Get('school-years') listYears() { return this.svc.listYears(); }
  @Post('school-years') createYear(@Body() dto: SchoolYearDto) { return this.svc.createYear(dto); }
  @Put('school-years/:id') updateYear(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SchoolYearDto) { return this.svc.updateYear(id, dto); }
  @Post('school-years/:id/semesters') createSemester(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SemesterDto) { return this.svc.createSemester(id, dto); }
  @Delete('semesters/:id') deleteSemester(@Param('id', ParseUUIDPipe) id: string) { return this.svc.deleteSemester(id); }

  @Get('subjects') listSubjects(@Query('includeArchived') inc?: string) { return this.svc.listSubjects(inc === 'true'); }
  @Post('subjects') createSubject(@Body() dto: SubjectDto) { return this.svc.createSubject(dto); }
  @Patch('subjects/:id') updateSubject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSubjectDto) { return this.svc.updateSubject(id, dto); }

  @Get('classes') listClasses(@Query('q') q?: string, @Query('schoolYearId') y?: string, @Query('includeArchived') inc?: string) {
    return this.svc.listClasses(q, y, inc === 'true');
  }
  @Post('classes') createClass(@Body() dto: ClassDto) { return this.svc.createClass(dto); }
  @Get('classes/:id') classDetail(@Param('id', ParseUUIDPipe) id: string) { return this.svc.classDetail(id); }
  @Patch('classes/:id') updateClass(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateClassDto) { return this.svc.updateClass(id, dto); }
  @Post('classes/:id/students') enroll(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EnrollDto) { return this.svc.enroll(id, dto); }
  @Delete('classes/:id/students/:studentId') unenroll(@Param('id', ParseUUIDPipe) id: string, @Param('studentId', ParseUUIDPipe) sid: string) {
    return this.svc.unenroll(id, sid);
  }
  @Post('classes/:id/teachers') assignTeacher(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TeachingDto) { return this.svc.assignTeacher(id, dto); }
  @Delete('classes/:id/teachers/:teachingId') unassignTeacher(@Param('id', ParseUUIDPipe) id: string, @Param('teachingId', ParseUUIDPipe) tid: string) {
    return this.svc.unassignTeacher(id, tid);
  }
}
