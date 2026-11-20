import { IsDateString, IsEmail, IsIn, IsOptional, IsString, IsUUID, Length, Matches, MaxLength } from 'class-validator';

export class CreateTeacherDto {
  @IsString() @Length(2, 120) fullName: string;
  @IsEmail() @MaxLength(200) email: string;
  @IsOptional() @IsString() @Length(2, 40) @Matches(/^[A-Za-z0-9_.-]+$/) teacherCode?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(120) specialization?: string;
}

export class CreateStudentDto {
  @IsString() @Length(2, 120) fullName: string;
  /** Mã học sinh – duy nhất trong trường, dùng để đăng nhập (D4). */
  @IsString() @Length(2, 40) @Matches(/^[A-Za-z0-9_.-]+$/, { message: 'Mã học sinh chỉ gồm chữ, số, dấu chấm, gạch ngang' }) studentCode: string;
  @IsOptional() @IsEmail() @MaxLength(200) email?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsUUID() classId?: string;
}

export class UpdateUserDto {
  @IsOptional() @IsString() @Length(2, 120) fullName?: string;
  @IsOptional() @IsEmail() @MaxLength(200) email?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(120) specialization?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
}

export class ListUsersQuery {
  @IsIn(['TEACHER', 'STUDENT', 'SCHOOL_ADMIN']) role: 'TEACHER' | 'STUDENT' | 'SCHOOL_ADMIN';
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsIn(['ACTIVE', 'LOCKED', 'DISABLED']) status?: 'ACTIVE' | 'LOCKED' | 'DISABLED';
  @IsOptional() @IsUUID() classId?: string;
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() pageSize?: string;
}
