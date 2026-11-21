import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators';
import { UsersService } from './users.service';
import { CreateStudentDto, CreateTeacherDto, ListUsersQuery, UpdateUserDto } from './dto';

@ApiTags('school-admin: users')
@Roles('SCHOOL_ADMIN')
@Controller('admin/users')
export class UsersController {
  constructor(private readonly svc: UsersService) {}

  @Get() list(@Query() q: ListUsersQuery) { return this.svc.list(q); }
  /** Trả về mật khẩu tạm MỘT LẦN (O-18). */
  @Post('teachers') createTeacher(@Body() dto: CreateTeacherDto) { return this.svc.createTeacher(dto); }
  @Post('students') createStudent(@Body() dto: CreateStudentDto) { return this.svc.createStudent(dto); }
  @Patch(':id') update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) { return this.svc.update(id, dto); }
  @Post(':id/lock') @HttpCode(200) lock(@Param('id', ParseUUIDPipe) id: string) { return this.svc.setLocked(id, true); }
  @Post(':id/unlock') @HttpCode(200) unlock(@Param('id', ParseUUIDPipe) id: string) { return this.svc.setLocked(id, false); }
  @Post(':id/reset-password') @HttpCode(200) reset(@Param('id', ParseUUIDPipe) id: string) { return this.svc.resetPassword(id); }
}
