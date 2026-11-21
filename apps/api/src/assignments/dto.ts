import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';

const VIS = ['NEVER', 'AFTER_SUBMIT', 'AFTER_DUE', 'AFTER_PUBLISH'] as const;
const QTYPES = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER', 'ESSAY', 'FILE_UPLOAD'] as const;

export class AssignmentSettingsDto {
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsString() @MaxLength(5000) instructions?: string;
  @IsOptional() @IsString() @MaxLength(200) topic?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) passScore?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(600) timeLimitMinutes?: number | null;
  @IsOptional() @IsBoolean() allowResubmit?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(20) maxAttempts?: number;
  @IsOptional() @IsIn(VIS) answerVisibility?: (typeof VIS)[number];
  @IsOptional() @IsBoolean() aiGradingAllowed?: boolean;
  @IsOptional() @IsBoolean() aiFeedbackVisible?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUUID('all', { each: true }) attachmentFileIds?: string[];
}

export class CreateAssignmentDto extends AssignmentSettingsDto {
  @IsString() @Length(3, 200) title: string;
  @IsUUID() subjectId: string;
}

export class UpdateAssignmentDto extends AssignmentSettingsDto {
  @IsOptional() @IsString() @Length(3, 200) title?: string;
  @IsOptional() @IsUUID() subjectId?: string;
  /** Gia hạn khi bài đang mở */
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional() @IsBoolean() allowLate?: boolean;
  @IsOptional() @IsDateString() lateUntil?: string | null;
}

export class PublishDto {
  @IsArray() @ArrayMaxSize(50) @IsUUID('all', { each: true }) classIds: string[];
  @IsArray() @ArrayMaxSize(500) @IsUUID('all', { each: true }) studentIds: string[];
  /** Mặc định: ngay bây giờ */
  @IsOptional() @IsDateString() openAt?: string;
  @IsDateString() dueAt: string;
  @IsOptional() @IsBoolean() allowLate?: boolean;
  @IsOptional() @IsDateString() lateUntil?: string;
}

export class OptionDto {
  @IsOptional() @IsUUID() id?: string;
  @IsString() @Length(1, 1000) content: string;
  @IsBoolean() isCorrect: boolean;
}

export class CriterionDto {
  @IsString() @Length(1, 120) name: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.25) @Max(1000) maxPoints: number;
}

export class RubricDto {
  @IsArray() @ArrayMaxSize(12) @ValidateNested({ each: true }) @Type(() => CriterionDto) criteria: CriterionDto[];
}

export class QuestionDto {
  @IsIn(QTYPES) type: (typeof QTYPES)[number];
  @IsString() @Length(1, 10000) content: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1000) points: number;
  @IsOptional() @IsBoolean() isRequired?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => OptionDto) options?: OptionDto[];
  /** MC: {scoring}; SHORT_ANSWER: {accepted[], caseSensitive, ignoreDiacritics, numericTolerance, zeroIfNoMatch}; FILE_UPLOAD: {maxFiles} */
  @IsOptional() @IsObject() config?: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(10000) referenceAnswer?: string | null;
  @IsOptional() @IsString() @MaxLength(5000) explanation?: string | null;
  @IsOptional() @ValidateNested() @Type(() => RubricDto) rubric?: RubricDto | null;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsUUID('all', { each: true }) attachmentFileIds?: string[];
}

export class ReorderDto {
  @IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true }) questionIds: string[];
}

export class ListAssignmentsQuery {
  @IsOptional() @IsIn(['DRAFT', 'SCHEDULED', 'PUBLISHED', 'REVOKED', 'ARCHIVED']) status?: string;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsUUID() subjectId?: string;
}
