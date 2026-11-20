import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';

export class SchoolYearDto {
  @IsString() @Length(1, 50) name: string;
  @IsDateString() startDate: string;
  @IsDateString() endDate: string;
  @IsOptional() @IsBoolean() isCurrent?: boolean;
}

export class SemesterDto {
  @IsString() @Length(1, 50) name: string;
  @IsInt() @Min(1) @Max(6) ordinal: number;
  @IsDateString() startDate: string;
  @IsDateString() endDate: string;
}

export class SubjectDto {
  @IsString() @Length(1, 20) @Matches(/^[A-Za-z0-9_-]+$/, { message: 'Mã môn chỉ gồm chữ, số, gạch ngang, gạch dưới' }) code: string;
  @IsString() @Length(1, 100) name: string;
}

export class UpdateSubjectDto {
  @IsOptional() @IsString() @Length(1, 100) name?: string;
  @IsOptional() @IsBoolean() archived?: boolean;
}

export class ClassDto {
  @IsString() @Length(1, 20) @Matches(/^[A-Za-z0-9_.-]+$/, { message: 'Mã lớp chỉ gồm chữ, số, dấu chấm, gạch ngang' }) code: string;
  @IsString() @Length(1, 100) name: string;
  @IsUUID() schoolYearId: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(12) gradeLevel?: number;
  @IsOptional() @IsUUID() homeroomTeacherId?: string;
}

export class UpdateClassDto {
  @IsOptional() @IsString() @Length(1, 100) name?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(12) gradeLevel?: number;
  @IsOptional() @IsUUID() homeroomTeacherId?: string | null;
  @IsOptional() @IsBoolean() archived?: boolean;
}

export class EnrollDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @IsUUID('all', { each: true }) studentIds: string[];
}

export class TeachingDto {
  @IsUUID() teacherId: string;
  @IsUUID() subjectId: string;
  @IsOptional() @IsUUID() semesterId?: string;
}
