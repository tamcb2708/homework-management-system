import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsNumber, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class CriterionScoreDto {
  @IsUUID() criterionId: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1000) score: number;
  @IsOptional() @IsString() @MaxLength(2000) feedback?: string | null;
}

export class ScoreDto {
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1000) score?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(12) @ValidateNested({ each: true }) @Type(() => CriterionScoreDto) criteria?: CriterionScoreDto[];
  @IsOptional() @IsString() @MaxLength(5000) feedback?: string | null;
  @IsOptional() @IsBoolean() isMarkedWrong?: boolean;
  /** Bắt buộc khi sửa điểm đã công bố hoặc ghi đè điểm tự động */
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class FeedbackDto {
  @IsOptional() @IsString() @MaxLength(5000) teacherFeedback?: string | null;
  /** Nhận xét AI đã được giáo viên duyệt/sửa (chỉ hiển thị cho HS khi bài bật tùy chọn) */
  @IsOptional() @IsString() @MaxLength(5000) aiFeedbackApproved?: string | null;
}

export class PublishGradesDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @IsUUID('all', { each: true }) gradeIds: string[];
}

export class ReturnDto {
  @IsUUID() studentId: string;
  @IsString() @Length(3, 1000) reason: string;
  @IsOptional() @IsDateString() dueAt?: string;
}
