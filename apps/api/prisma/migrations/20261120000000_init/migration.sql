CREATE EXTENSION IF NOT EXISTS citext;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'LOCKED', 'DISABLED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SCHOOL_ADMIN', 'TEACHER', 'STUDENT');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'SYSTEM', 'PLATFORM');

-- CreateEnum
CREATE TYPE "FilePurpose" AS ENUM ('ASSIGNMENT_ATTACHMENT', 'QUESTION_MEDIA', 'ANSWER_UPLOAD', 'EXPORT');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('ACTIVE', 'DELETED');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'REVOKED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TargetType" AS ENUM ('CLASS', 'STUDENT', 'GROUP');

-- CreateEnum
CREATE TYPE "AnswerVisibility" AS ENUM ('NEVER', 'AFTER_SUBMIT', 'AFTER_DUE', 'AFTER_PUBLISH');

-- CreateEnum
CREATE TYPE "GradingPolicy" AS ENUM ('LATEST', 'HIGHEST');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER', 'ESSAY', 'FILE_UPLOAD');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'GRADING', 'GRADED', 'PUBLISHED', 'RETURNED');

-- CreateEnum
CREATE TYPE "SubmissionSource" AS ENUM ('STUDENT', 'AUTO_TIMEOUT');

-- CreateEnum
CREATE TYPE "GradeStatus" AS ENUM ('IN_PROGRESS', 'GRADED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "GradeItemStatus" AS ENUM ('AUTO_GRADED', 'NEEDS_MANUAL', 'AI_PENDING', 'AI_SUGGESTED', 'FINAL');

-- CreateEnum
CREATE TYPE "GradeSource" AS ENUM ('AUTO', 'TEACHER');

-- CreateEnum
CREATE TYPE "GradeChangeType" AS ENUM ('AUTO_GRADED', 'MANUAL_SET', 'AI_ACCEPTED', 'AI_MODIFIED', 'OVERRIDE_AUTO', 'REGRADE_KEY_CHANGE', 'PUBLISHED', 'FEEDBACK_EDITED');

-- CreateEnum
CREATE TYPE "AiJobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'RETRYING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ASSIGNMENT_PUBLISHED', 'ASSIGNMENT_DUE_SOON', 'SUBMISSION_RECEIVED', 'GRADE_PUBLISHED', 'GRADE_UPDATED', 'SUBMISSION_RETURNED', 'AI_GRADING_FINISHED', 'AI_BUDGET_ALERT', 'SYSTEM');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "slug" CITEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    "locale" TEXT NOT NULL DEFAULT 'vi-VN',
    "max_users" INTEGER,
    "max_storage_bytes" BIGINT,
    "suspended_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_users" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "platform_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_sessions" (
    "id" UUID NOT NULL,
    "platform_user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "replaced_at" TIMESTAMPTZ(6),
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "platform_audit_logs" (
    "id" UUID NOT NULL,
    "actor_platform_user_id" UUID,
    "action" TEXT NOT NULL,
    "target_tenant_id" UUID,
    "resource_type" TEXT,
    "resource_id" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "request_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_settings" (
    "tenant_id" UUID NOT NULL,
    "file_allowed_types" TEXT[] DEFAULT ARRAY['pdf', 'docx', 'xlsx', 'pptx', 'jpg', 'png']::TEXT[],
    "file_max_bytes" INTEGER NOT NULL DEFAULT 20971520,
    "files_per_answer" INTEGER NOT NULL DEFAULT 10,
    "submit_grace_seconds" INTEGER NOT NULL DEFAULT 30,
    "score_step" DECIMAL(4,2) NOT NULL DEFAULT 0.25,
    "ai_enabled" BOOLEAN NOT NULL DEFAULT false,
    "ai_approval_ref" TEXT,
    "ai_approved_by_name" TEXT,
    "ai_approved_at" TIMESTAMPTZ(6),
    "ai_monthly_limit_micros" BIGINT,
    "ai_alert_thresholds" INTEGER[] DEFAULT ARRAY[50, 80, 100]::INTEGER[],
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenant_settings_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "username" CITEXT NOT NULL,
    "email" CITEXT,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "password_hash" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "password_changed_at" TIMESTAMPTZ(6),
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "last_login_at" TIMESTAMPTZ(6),
    "authz_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "absolute_expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "revoke_reason" TEXT,
    "replaced_at" TIMESTAMPTZ(6),
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "student_code" CITEXT NOT NULL,
    "date_of_birth" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "teachers" (
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "teacher_code" CITEXT,
    "specialization" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "teachers_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "school_years" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "school_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "semesters" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "school_year_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "semesters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" CITEXT NOT NULL,
    "name" TEXT NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "school_year_id" UUID NOT NULL,
    "code" CITEXT NOT NULL,
    "name" TEXT NOT NULL,
    "grade_level" SMALLINT,
    "homeroom_teacher_id" UUID,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_students" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ(6),

    CONSTRAINT "class_students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_teachers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "semester_id" UUID,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassigned_at" TIMESTAMPTZ(6),

    CONSTRAINT "class_teachers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "purpose" "FilePurpose" NOT NULL,
    "status" "FileStatus" NOT NULL DEFAULT 'ACTIVE',
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "owner_teacher_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT,
    "topic" TEXT,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'DRAFT',
    "open_at" TIMESTAMPTZ(6),
    "due_at" TIMESTAMPTZ(6),
    "allow_late" BOOLEAN NOT NULL DEFAULT false,
    "late_until" TIMESTAMPTZ(6),
    "time_limit_minutes" INTEGER,
    "allow_resubmit" BOOLEAN NOT NULL DEFAULT false,
    "max_attempts" SMALLINT NOT NULL DEFAULT 1,
    "grading_policy" "GradingPolicy" NOT NULL DEFAULT 'LATEST',
    "max_score" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "pass_score" DECIMAL(8,2),
    "answer_visibility" "AnswerVisibility" NOT NULL DEFAULT 'AFTER_PUBLISH',
    "ai_grading_allowed" BOOLEAN NOT NULL DEFAULT false,
    "ai_feedback_visible" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "archived_at" TIMESTAMPTZ(6),
    "due_reminder_sent_at" TIMESTAMPTZ(6),
    "lock_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_targets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "target_type" "TargetType" NOT NULL,
    "class_id" UUID,
    "student_id" UUID,
    "group_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignment_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_attachments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignment_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grading_rubrics" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "owner_teacher_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "previous_version_id" UUID,
    "locked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grading_rubrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rubric_criteria" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "rubric_id" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "max_points" DECIMAL(8,2) NOT NULL,

    CONSTRAINT "rubric_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "type" "QuestionType" NOT NULL,
    "content" TEXT NOT NULL,
    "points" DECIMAL(8,2) NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',
    "reference_answer" TEXT,
    "explanation" TEXT,
    "rubric_id" UUID,
    "source_question_id" UUID,
    "lock_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_options" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "is_correct" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "question_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_attachments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadline_at" TIMESTAMPTZ(6),
    "draft" JSONB NOT NULL DEFAULT '{}',
    "draft_revision" INTEGER NOT NULL DEFAULT 0,
    "draft_updated_at" TIMESTAMPTZ(6),
    "attempt_count" SMALLINT NOT NULL DEFAULT 0,
    "latest_version_id" UUID,
    "effective_grade_id" UUID,
    "returned_at" TIMESTAMPTZ(6),
    "returned_reason" TEXT,
    "returned_due_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_versions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "version_no" SMALLINT NOT NULL,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "SubmissionSource" NOT NULL DEFAULT 'STUDENT',
    "is_late" BOOLEAN NOT NULL DEFAULT false,
    "counts_as_attempt" BOOLEAN NOT NULL DEFAULT true,
    "idempotency_key" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "submitted_by" UUID,

    CONSTRAINT "submission_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_answers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "answer" JSONB NOT NULL,
    "answer_text" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submission_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_attachments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submission_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grades" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "submission_version_id" UUID NOT NULL,
    "status" "GradeStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "max_score" DECIMAL(8,2) NOT NULL,
    "earned_score" DECIMAL(8,2),
    "pass_score" DECIMAL(8,2),
    "passed" BOOLEAN,
    "teacher_feedback" TEXT,
    "ai_feedback_approved" TEXT,
    "graded_by" UUID,
    "graded_at" TIMESTAMPTZ(6),
    "published_by" UUID,
    "published_at" TIMESTAMPTZ(6),
    "lock_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "grades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_details" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "grade_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "status" "GradeItemStatus" NOT NULL,
    "source" "GradeSource",
    "max_score" DECIMAL(8,2) NOT NULL,
    "earned_score" DECIMAL(8,2),
    "feedback" TEXT,
    "is_marked_wrong" BOOLEAN NOT NULL DEFAULT false,
    "accepted_ai_result_id" UUID,
    "finalized_by" UUID,
    "finalized_at" TIMESTAMPTZ(6),
    "lock_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "grade_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_detail_criteria" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "grade_detail_id" UUID NOT NULL,
    "rubric_criterion_id" UUID NOT NULL,
    "max_score" DECIMAL(8,2) NOT NULL,
    "earned_score" DECIMAL(8,2) NOT NULL,
    "feedback" TEXT,

    CONSTRAINT "grade_detail_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_history" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "grade_id" UUID NOT NULL,
    "grade_detail_id" UUID,
    "change_type" "GradeChangeType" NOT NULL,
    "old_score" DECIMAL(8,2),
    "new_score" DECIMAL(8,2),
    "old_feedback" TEXT,
    "new_feedback" TEXT,
    "reason" TEXT,
    "actor_type" "ActorType" NOT NULL,
    "changed_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grade_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_grading_requests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "item_count" INTEGER NOT NULL,
    "estimated_cost_micros" BIGINT NOT NULL,
    "reserved_micros" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "ai_grading_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_grading_jobs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "submission_version_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "grade_detail_id" UUID NOT NULL,
    "status" "AiJobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "idempotency_key" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "prompt_version" TEXT NOT NULL,
    "reserved_micros" BIGINT NOT NULL DEFAULT 0,
    "actual_cost_micros" BIGINT NOT NULL DEFAULT 0,
    "error_code" TEXT,
    "error_message" TEXT,
    "queued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "ai_grading_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_grading_results" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "grade_detail_id" UUID NOT NULL,
    "is_valid" BOOLEAN NOT NULL,
    "validation_errors" JSONB,
    "suggested_score" DECIMAL(8,2),
    "max_score" DECIMAL(8,2) NOT NULL,
    "confidence" DECIMAL(4,3),
    "criteria" JSONB,
    "strengths" JSONB,
    "weaknesses" JSONB,
    "missing_points" JSONB,
    "overall_feedback" TEXT,
    "needs_teacher_review" BOOLEAN NOT NULL DEFAULT true,
    "model" TEXT,
    "prompt_version" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_micros" BIGINT NOT NULL DEFAULT 0,
    "latency_ms" INTEGER NOT NULL DEFAULT 0,
    "redaction_summary" JSONB,
    "raw_response" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_grading_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_budget_periods" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "limit_micros" BIGINT NOT NULL,
    "reserved_micros" BIGINT NOT NULL DEFAULT 0,
    "spent_micros" BIGINT NOT NULL DEFAULT 0,
    "alerts_sent" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_budget_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "data" JSONB,
    "dedupe_key" TEXT,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "actor_type" "ActorType" NOT NULL,
    "actor_user_id" UUID,
    "actor_platform_user_id" UUID,
    "action" TEXT NOT NULL,
    "resource_type" TEXT,
    "resource_id" TEXT,
    "is_sensitive" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "request_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "platform_users_email_key" ON "platform_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "platform_sessions_refresh_token_hash_key" ON "platform_sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "platform_audit_logs_created_at_idx" ON "platform_audit_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "users_tenant_id_status_idx" ON "users"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_id_key" ON "users"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_username_key" ON "users"("tenant_id", "username");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_email_key" ON "users"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "user_roles_tenant_id_role_idx" ON "user_roles"("tenant_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_refresh_token_hash_key" ON "auth_sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "auth_sessions_tenant_id_user_id_idx" ON "auth_sessions"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_tenant_id_id_key" ON "auth_sessions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "students_tenant_id_user_id_key" ON "students"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_tenant_id_student_code_key" ON "students"("tenant_id", "student_code");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_tenant_id_user_id_key" ON "teachers"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_tenant_id_teacher_code_key" ON "teachers"("tenant_id", "teacher_code");

-- CreateIndex
CREATE UNIQUE INDEX "school_years_tenant_id_id_key" ON "school_years"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "school_years_tenant_id_name_key" ON "school_years"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "semesters_tenant_id_id_key" ON "semesters"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "semesters_school_year_id_ordinal_key" ON "semesters"("school_year_id", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_tenant_id_id_key" ON "subjects"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_tenant_id_code_key" ON "subjects"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "classes_tenant_id_id_key" ON "classes"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "classes_tenant_id_school_year_id_code_key" ON "classes"("tenant_id", "school_year_id", "code");

-- CreateIndex
CREATE INDEX "class_students_tenant_id_student_id_idx" ON "class_students"("tenant_id", "student_id");

-- CreateIndex
CREATE INDEX "class_students_class_id_idx" ON "class_students"("class_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_students_tenant_id_id_key" ON "class_students"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "class_teachers_tenant_id_teacher_id_idx" ON "class_teachers"("tenant_id", "teacher_id");

-- CreateIndex
CREATE INDEX "class_teachers_class_id_idx" ON "class_teachers"("class_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_teachers_tenant_id_id_key" ON "class_teachers"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "files_storage_key_key" ON "files"("storage_key");

-- CreateIndex
CREATE INDEX "files_tenant_id_uploaded_by_idx" ON "files"("tenant_id", "uploaded_by");

-- CreateIndex
CREATE UNIQUE INDEX "files_tenant_id_id_key" ON "files"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "assignments_tenant_id_owner_teacher_id_status_idx" ON "assignments"("tenant_id", "owner_teacher_id", "status");

-- CreateIndex
CREATE INDEX "assignments_tenant_id_subject_id_idx" ON "assignments"("tenant_id", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "assignments_tenant_id_id_key" ON "assignments"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "assignment_targets_tenant_id_class_id_idx" ON "assignment_targets"("tenant_id", "class_id");

-- CreateIndex
CREATE INDEX "assignment_targets_tenant_id_student_id_idx" ON "assignment_targets"("tenant_id", "student_id");

-- CreateIndex
CREATE INDEX "assignment_targets_assignment_id_idx" ON "assignment_targets"("assignment_id");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_targets_tenant_id_id_key" ON "assignment_targets"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_attachments_tenant_id_id_key" ON "assignment_attachments"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_attachments_assignment_id_file_id_key" ON "assignment_attachments"("assignment_id", "file_id");

-- CreateIndex
CREATE UNIQUE INDEX "grading_rubrics_tenant_id_id_key" ON "grading_rubrics"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "rubric_criteria_tenant_id_id_key" ON "rubric_criteria"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "rubric_criteria_rubric_id_ordinal_key" ON "rubric_criteria"("rubric_id", "ordinal");

-- CreateIndex
CREATE INDEX "questions_assignment_id_ordinal_idx" ON "questions"("assignment_id", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "questions_tenant_id_id_key" ON "questions"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "question_options_question_id_ordinal_idx" ON "question_options"("question_id", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "question_options_tenant_id_id_key" ON "question_options"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "question_attachments_tenant_id_id_key" ON "question_attachments"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "question_attachments_question_id_file_id_key" ON "question_attachments"("question_id", "file_id");

-- CreateIndex
CREATE INDEX "submissions_tenant_id_student_id_status_idx" ON "submissions"("tenant_id", "student_id", "status");

-- CreateIndex
CREATE INDEX "submissions_tenant_id_assignment_id_status_idx" ON "submissions"("tenant_id", "assignment_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_tenant_id_id_key" ON "submissions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_tenant_id_assignment_id_student_id_key" ON "submissions"("tenant_id", "assignment_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "submission_versions_tenant_id_id_key" ON "submission_versions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "submission_versions_submission_id_version_no_key" ON "submission_versions"("submission_id", "version_no");

-- CreateIndex
CREATE UNIQUE INDEX "submission_versions_submission_id_idempotency_key_key" ON "submission_versions"("submission_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "submission_answers_tenant_id_id_key" ON "submission_answers"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "submission_answers_version_id_question_id_key" ON "submission_answers"("version_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "submission_attachments_tenant_id_id_key" ON "submission_attachments"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "submission_attachments_version_id_question_id_file_id_key" ON "submission_attachments"("version_id", "question_id", "file_id");

-- CreateIndex
CREATE INDEX "grades_tenant_id_submission_id_idx" ON "grades"("tenant_id", "submission_id");

-- CreateIndex
CREATE INDEX "grades_tenant_id_status_idx" ON "grades"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "grades_tenant_id_id_key" ON "grades"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "grades_tenant_id_submission_version_id_key" ON "grades"("tenant_id", "submission_version_id");

-- CreateIndex
CREATE INDEX "grade_details_tenant_id_status_idx" ON "grade_details"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "grade_details_tenant_id_id_key" ON "grade_details"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "grade_details_grade_id_question_id_key" ON "grade_details"("grade_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "grade_detail_criteria_tenant_id_id_key" ON "grade_detail_criteria"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "grade_detail_criteria_grade_detail_id_rubric_criterion_id_key" ON "grade_detail_criteria"("grade_detail_id", "rubric_criterion_id");

-- CreateIndex
CREATE INDEX "grade_history_tenant_id_grade_id_idx" ON "grade_history"("tenant_id", "grade_id");

-- CreateIndex
CREATE UNIQUE INDEX "grade_history_tenant_id_id_key" ON "grade_history"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_grading_requests_tenant_id_id_key" ON "ai_grading_requests"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_grading_jobs_idempotency_key_key" ON "ai_grading_jobs"("idempotency_key");

-- CreateIndex
CREATE INDEX "ai_grading_jobs_status_queued_at_idx" ON "ai_grading_jobs"("status", "queued_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_grading_jobs_tenant_id_id_key" ON "ai_grading_jobs"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_grading_results_tenant_id_id_key" ON "ai_grading_results"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_budget_periods_tenant_id_id_key" ON "ai_budget_periods"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_budget_periods_tenant_id_period_start_key" ON "ai_budget_periods"("tenant_id", "period_start");

-- CreateIndex
CREATE INDEX "notifications_tenant_id_user_id_created_at_idx" ON "notifications"("tenant_id", "user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_tenant_id_id_key" ON "notifications"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_tenant_id_dedupe_key_key" ON "notifications"("tenant_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_created_at_idx" ON "audit_logs"("tenant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_resource_type_resource_id_idx" ON "audit_logs"("tenant_id", "resource_type", "resource_id");

-- CreateIndex
CREATE UNIQUE INDEX "audit_logs_tenant_id_id_key" ON "audit_logs"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "platform_sessions" ADD CONSTRAINT "platform_sessions_platform_user_id_fkey" FOREIGN KEY ("platform_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_years" ADD CONSTRAINT "school_years_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semesters" ADD CONSTRAINT "semesters_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semesters" ADD CONSTRAINT "semesters_tenant_id_school_year_id_fkey" FOREIGN KEY ("tenant_id", "school_year_id") REFERENCES "school_years"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_tenant_id_school_year_id_fkey" FOREIGN KEY ("tenant_id", "school_year_id") REFERENCES "school_years"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_tenant_id_homeroom_teacher_id_fkey" FOREIGN KEY ("tenant_id", "homeroom_teacher_id") REFERENCES "teachers"("tenant_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_students" ADD CONSTRAINT "class_students_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_students" ADD CONSTRAINT "class_students_tenant_id_class_id_fkey" FOREIGN KEY ("tenant_id", "class_id") REFERENCES "classes"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_students" ADD CONSTRAINT "class_students_tenant_id_student_id_fkey" FOREIGN KEY ("tenant_id", "student_id") REFERENCES "students"("tenant_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_teachers" ADD CONSTRAINT "class_teachers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_teachers" ADD CONSTRAINT "class_teachers_tenant_id_class_id_fkey" FOREIGN KEY ("tenant_id", "class_id") REFERENCES "classes"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_teachers" ADD CONSTRAINT "class_teachers_tenant_id_teacher_id_fkey" FOREIGN KEY ("tenant_id", "teacher_id") REFERENCES "teachers"("tenant_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_teachers" ADD CONSTRAINT "class_teachers_tenant_id_subject_id_fkey" FOREIGN KEY ("tenant_id", "subject_id") REFERENCES "subjects"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_teachers" ADD CONSTRAINT "class_teachers_tenant_id_semester_id_fkey" FOREIGN KEY ("tenant_id", "semester_id") REFERENCES "semesters"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_tenant_id_uploaded_by_fkey" FOREIGN KEY ("tenant_id", "uploaded_by") REFERENCES "users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_tenant_id_subject_id_fkey" FOREIGN KEY ("tenant_id", "subject_id") REFERENCES "subjects"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_tenant_id_owner_teacher_id_fkey" FOREIGN KEY ("tenant_id", "owner_teacher_id") REFERENCES "teachers"("tenant_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_targets" ADD CONSTRAINT "assignment_targets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_targets" ADD CONSTRAINT "assignment_targets_tenant_id_assignment_id_fkey" FOREIGN KEY ("tenant_id", "assignment_id") REFERENCES "assignments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_targets" ADD CONSTRAINT "assignment_targets_tenant_id_class_id_fkey" FOREIGN KEY ("tenant_id", "class_id") REFERENCES "classes"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_targets" ADD CONSTRAINT "assignment_targets_tenant_id_student_id_fkey" FOREIGN KEY ("tenant_id", "student_id") REFERENCES "students"("tenant_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_attachments" ADD CONSTRAINT "assignment_attachments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_attachments" ADD CONSTRAINT "assignment_attachments_tenant_id_assignment_id_fkey" FOREIGN KEY ("tenant_id", "assignment_id") REFERENCES "assignments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_attachments" ADD CONSTRAINT "assignment_attachments_tenant_id_file_id_fkey" FOREIGN KEY ("tenant_id", "file_id") REFERENCES "files"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grading_rubrics" ADD CONSTRAINT "grading_rubrics_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grading_rubrics" ADD CONSTRAINT "grading_rubrics_tenant_id_owner_teacher_id_fkey" FOREIGN KEY ("tenant_id", "owner_teacher_id") REFERENCES "teachers"("tenant_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rubric_criteria" ADD CONSTRAINT "rubric_criteria_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rubric_criteria" ADD CONSTRAINT "rubric_criteria_tenant_id_rubric_id_fkey" FOREIGN KEY ("tenant_id", "rubric_id") REFERENCES "grading_rubrics"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_tenant_id_assignment_id_fkey" FOREIGN KEY ("tenant_id", "assignment_id") REFERENCES "assignments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_tenant_id_rubric_id_fkey" FOREIGN KEY ("tenant_id", "rubric_id") REFERENCES "grading_rubrics"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_tenant_id_source_question_id_fkey" FOREIGN KEY ("tenant_id", "source_question_id") REFERENCES "questions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_tenant_id_question_id_fkey" FOREIGN KEY ("tenant_id", "question_id") REFERENCES "questions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_attachments" ADD CONSTRAINT "question_attachments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_attachments" ADD CONSTRAINT "question_attachments_tenant_id_question_id_fkey" FOREIGN KEY ("tenant_id", "question_id") REFERENCES "questions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_attachments" ADD CONSTRAINT "question_attachments_tenant_id_file_id_fkey" FOREIGN KEY ("tenant_id", "file_id") REFERENCES "files"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_tenant_id_assignment_id_fkey" FOREIGN KEY ("tenant_id", "assignment_id") REFERENCES "assignments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_tenant_id_student_id_fkey" FOREIGN KEY ("tenant_id", "student_id") REFERENCES "students"("tenant_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_versions" ADD CONSTRAINT "submission_versions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_versions" ADD CONSTRAINT "submission_versions_tenant_id_submission_id_fkey" FOREIGN KEY ("tenant_id", "submission_id") REFERENCES "submissions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_answers" ADD CONSTRAINT "submission_answers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_answers" ADD CONSTRAINT "submission_answers_tenant_id_version_id_fkey" FOREIGN KEY ("tenant_id", "version_id") REFERENCES "submission_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_answers" ADD CONSTRAINT "submission_answers_tenant_id_question_id_fkey" FOREIGN KEY ("tenant_id", "question_id") REFERENCES "questions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_attachments" ADD CONSTRAINT "submission_attachments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_attachments" ADD CONSTRAINT "submission_attachments_tenant_id_version_id_fkey" FOREIGN KEY ("tenant_id", "version_id") REFERENCES "submission_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_attachments" ADD CONSTRAINT "submission_attachments_tenant_id_question_id_fkey" FOREIGN KEY ("tenant_id", "question_id") REFERENCES "questions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_attachments" ADD CONSTRAINT "submission_attachments_tenant_id_file_id_fkey" FOREIGN KEY ("tenant_id", "file_id") REFERENCES "files"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_tenant_id_submission_id_fkey" FOREIGN KEY ("tenant_id", "submission_id") REFERENCES "submissions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_tenant_id_submission_version_id_fkey" FOREIGN KEY ("tenant_id", "submission_version_id") REFERENCES "submission_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_details" ADD CONSTRAINT "grade_details_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_details" ADD CONSTRAINT "grade_details_tenant_id_grade_id_fkey" FOREIGN KEY ("tenant_id", "grade_id") REFERENCES "grades"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_details" ADD CONSTRAINT "grade_details_tenant_id_question_id_fkey" FOREIGN KEY ("tenant_id", "question_id") REFERENCES "questions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_detail_criteria" ADD CONSTRAINT "grade_detail_criteria_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_detail_criteria" ADD CONSTRAINT "grade_detail_criteria_tenant_id_grade_detail_id_fkey" FOREIGN KEY ("tenant_id", "grade_detail_id") REFERENCES "grade_details"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_detail_criteria" ADD CONSTRAINT "grade_detail_criteria_tenant_id_rubric_criterion_id_fkey" FOREIGN KEY ("tenant_id", "rubric_criterion_id") REFERENCES "rubric_criteria"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_history" ADD CONSTRAINT "grade_history_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_history" ADD CONSTRAINT "grade_history_tenant_id_grade_id_fkey" FOREIGN KEY ("tenant_id", "grade_id") REFERENCES "grades"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_history" ADD CONSTRAINT "grade_history_tenant_id_grade_detail_id_fkey" FOREIGN KEY ("tenant_id", "grade_detail_id") REFERENCES "grade_details"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_grading_requests" ADD CONSTRAINT "ai_grading_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_grading_requests" ADD CONSTRAINT "ai_grading_requests_tenant_id_assignment_id_fkey" FOREIGN KEY ("tenant_id", "assignment_id") REFERENCES "assignments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_grading_jobs" ADD CONSTRAINT "ai_grading_jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_grading_jobs" ADD CONSTRAINT "ai_grading_jobs_tenant_id_request_id_fkey" FOREIGN KEY ("tenant_id", "request_id") REFERENCES "ai_grading_requests"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_grading_jobs" ADD CONSTRAINT "ai_grading_jobs_tenant_id_submission_version_id_fkey" FOREIGN KEY ("tenant_id", "submission_version_id") REFERENCES "submission_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_grading_jobs" ADD CONSTRAINT "ai_grading_jobs_tenant_id_question_id_fkey" FOREIGN KEY ("tenant_id", "question_id") REFERENCES "questions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_grading_jobs" ADD CONSTRAINT "ai_grading_jobs_tenant_id_grade_detail_id_fkey" FOREIGN KEY ("tenant_id", "grade_detail_id") REFERENCES "grade_details"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_grading_results" ADD CONSTRAINT "ai_grading_results_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_grading_results" ADD CONSTRAINT "ai_grading_results_tenant_id_job_id_fkey" FOREIGN KEY ("tenant_id", "job_id") REFERENCES "ai_grading_jobs"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_grading_results" ADD CONSTRAINT "ai_grading_results_tenant_id_grade_detail_id_fkey" FOREIGN KEY ("tenant_id", "grade_detail_id") REFERENCES "grade_details"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_budget_periods" ADD CONSTRAINT "ai_budget_periods_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

