-- Security layer: Row-Level Security, role grants, immutability triggers, partial uniques, checks.
-- Prerequisite: roles hms_app and hms_system exist (scripts/sql/roles.sql, run by scripts/db-setup.sh).
-- hms_app    : runtime role for tenant-scoped work. Subject to RLS (policy tenant_isolation).
-- hms_system : platform/scheduler role. Gets an explicit permissive policy (no BYPASSRLS attribute needed,
--              so this also works on managed PostgreSQL where BYPASSRLS cannot be granted).
-- The table owner (migration role) has no policy and FORCE RLS, so it sees no tenant rows at runtime.

CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app_forbid_mutation() RETURNS trigger
  LANGUAGE plpgsql
  AS $$ BEGIN RAISE EXCEPTION 'table % is append-only', TG_TABLE_NAME USING ERRCODE = 'P0001'; END $$;

GRANT USAGE ON SCHEMA public TO hms_app, hms_system;
GRANT EXECUTE ON FUNCTION app_current_tenant() TO hms_app, hms_system;

ALTER TABLE "tenant_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_settings" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tenant_settings" TO hms_app
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY system_access ON "tenant_settings" TO hms_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON "tenant_settings" TO hms_app, hms_system;

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "users" TO hms_app
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY system_access ON "users" TO hms_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON "users" TO hms_app, hms_system;

ALTER TABLE "user_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_roles" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "user_roles" TO hms_app
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY system_access ON "user_roles" TO hms_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON "user_roles" TO hms_app, hms_system;

ALTER TABLE "auth_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "auth_sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "auth_sessions" TO hms_app
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY system_access ON "auth_sessions" TO hms_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON "auth_sessions" TO hms_app, hms_system;

ALTER TABLE "students" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "students" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "students" TO hms_app
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY system_access ON "students" TO hms_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON "students" TO hms_app, hms_system;

ALTER TABLE "teachers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "teachers" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "teachers" TO hms_app
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY system_access ON "teachers" TO hms_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON "teachers" TO hms_app, hms_system;

ALTER TABLE "school_years" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_years" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "school_years" TO hms_app
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY system_access ON "school_years" TO hms_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON "school_years" TO hms_app, hms_system;

ALTER TABLE "semesters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "semesters" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "semesters" TO hms_app
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY system_access ON "semesters" TO hms_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON "semesters" TO hms_app, hms_system;

ALTER TABLE "subjects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subjects" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "subjects" TO hms_app
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY system_access ON "subjects" TO hms_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON "subjects" TO hms_app, hms_system;

ALTER TABLE "classes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "classes" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "classes" TO hms_app
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY system_access ON "classes" TO hms_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON "classes" TO hms_app, hms_system;

ALTER TABLE "class_students" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "class_students" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "class_students" TO hms_app
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY system_access ON "class_students" TO hms_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON "class_students" TO hms_app, hms_system;

ALTER TABLE "class_teachers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "class_teachers" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "class_teachers" TO hms_app
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY system_access ON "class_teachers" TO hms_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON "class_teachers" TO hms_app, hms_system;

ALTER TABLE "files" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "files" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "files" TO hms_app
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY system_access ON "files" TO hms_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON "files" TO hms_app, hms_system;

ALTER TABLE "assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assignments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "assignments" TO hms_app
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY system_access ON "assignments" TO hms_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON "assignments" TO hms_app, hms_system;

ALTER TABLE "assignment_targets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assignment_targets" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "assignment_targets" TO hms_app
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY system_access ON "assignment_targets" TO hms_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON "assignment_targets" TO hms_app, hms_system;

ALTER TABLE "assignment_attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assignment_attachments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "assignment_attachments" TO hms_app
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY system_access ON "assignment_attachments" TO hms_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON "assignment_attachments" TO hms_app, hms_system;

ALTER TABLE "grading_rubrics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "grading_rubrics" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "grading_rubrics" TO hms_app
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY system_access ON "grading_rubrics" TO hms_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON "grading_rubrics" TO hms_app, hms_system;

ALTER TABLE "rubric_criteria" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rubric_criteria" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "rubric_criteria" TO hms_app
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY system_access ON "rubric_criteria" TO hms_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON "rubric_criteria" TO hms_app, hms_system;

ALTER TABLE "questions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "questions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "questions" TO hms_app
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY system_access ON "questions" TO hms_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON "questions" TO hms_app, hms_system;

ALTER TABLE "question_options" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "question_options" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "question_options" TO hms_app
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY system_access ON "question_options" TO hms_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON "question_options" TO hms_app, hms_system;

ALTER TABLE "question_attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "question_attachments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "question_attachments" TO hms_app
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY system_access ON "question_attachments" TO hms_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON "question_attachments" TO hms_app, hms_system;

ALTER TABLE "submissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "submissions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "submissions" TO hms_app
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY system_access ON "submissions" TO hms_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON "submissions" TO hms_app, hms_system;

ALTER TABLE "submission_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "submission_versions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "submission_versions" TO hms_app
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY system_access ON "submission_versions" TO hms_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON "submission_versions" TO hms_app, hms_system;

ALTER TABLE "submission_answers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "submission_answers" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "submission_answers" TO hms_app
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY system_access ON "submission_answers" TO hms_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON "submission_answers" TO hms_app, hms_system;

ALTER TABLE "submission_attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "submission_attachments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "submission_attachments" TO hms_app
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY system_access ON "submission_attachments" TO hms_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON "submission_attachments" TO hms_app, hms_system;

ALTER TABLE "grades" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "grades" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "grades" TO hms_app
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY system_access ON "grades" TO hms_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON "grades" TO hms_app, hms_system;

ALTER TABLE "grade_details" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "grade_details" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "grade_details" TO hms_app
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY system_access ON "grade_details" TO hms_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON "grade_details" TO hms_app, hms_system;

ALTER TABLE "grade_detail_criteria" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "grade_detail_criteria" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "grade_detail_criteria" TO hms_app
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY system_access ON "grade_detail_criteria" TO hms_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON "grade_detail_criteria" TO hms_app, hms_system;

ALTER TABLE "grade_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "grade_history" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "grade_history" TO hms_app
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY system_access ON "grade_history" TO hms_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON "grade_history" TO hms_app, hms_system;

ALTER TABLE "ai_grading_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_grading_requests" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ai_grading_requests" TO hms_app
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY system_access ON "ai_grading_requests" TO hms_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON "ai_grading_requests" TO hms_app, hms_system;

ALTER TABLE "ai_grading_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_grading_jobs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ai_grading_jobs" TO hms_app
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY system_access ON "ai_grading_jobs" TO hms_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON "ai_grading_jobs" TO hms_app, hms_system;

ALTER TABLE "ai_grading_results" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_grading_results" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ai_grading_results" TO hms_app
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY system_access ON "ai_grading_results" TO hms_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON "ai_grading_results" TO hms_app, hms_system;

ALTER TABLE "ai_budget_periods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_budget_periods" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ai_budget_periods" TO hms_app
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY system_access ON "ai_budget_periods" TO hms_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON "ai_budget_periods" TO hms_app, hms_system;

ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "notifications" TO hms_app
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY system_access ON "notifications" TO hms_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON "notifications" TO hms_app, hms_system;

ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "audit_logs" TO hms_app
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY system_access ON "audit_logs" TO hms_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON "audit_logs" TO hms_app, hms_system;

-- Platform tables: hms_app may only read tenants (to resolve a school code) and platform settings (AI kill switch).
GRANT SELECT ON "tenants", "platform_settings" TO hms_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "tenants" TO hms_system;
GRANT SELECT, INSERT, UPDATE, DELETE ON "platform_users" TO hms_system;
GRANT SELECT, INSERT, UPDATE, DELETE ON "platform_sessions" TO hms_system;
GRANT SELECT, INSERT, UPDATE, DELETE ON "platform_settings" TO hms_system;
GRANT SELECT, INSERT, UPDATE, DELETE ON "platform_audit_logs" TO hms_system;

CREATE TRIGGER submission_versions_append_only BEFORE UPDATE OR DELETE ON "submission_versions"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_mutation();
CREATE TRIGGER submission_answers_append_only BEFORE UPDATE OR DELETE ON "submission_answers"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_mutation();
CREATE TRIGGER submission_attachments_append_only BEFORE UPDATE OR DELETE ON "submission_attachments"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_mutation();
CREATE TRIGGER grade_history_append_only BEFORE UPDATE OR DELETE ON "grade_history"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_mutation();
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_mutation();
CREATE TRIGGER platform_audit_logs_append_only BEFORE UPDATE OR DELETE ON "platform_audit_logs"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_mutation();

-- Partial / null-aware uniqueness (not expressible in Prisma schema)
CREATE UNIQUE INDEX class_students_active_uq ON "class_students" (class_id, student_id) WHERE left_at IS NULL;
CREATE UNIQUE INDEX class_teachers_active_uq ON "class_teachers" (class_id, teacher_id, subject_id, semester_id) NULLS NOT DISTINCT WHERE unassigned_at IS NULL;
CREATE UNIQUE INDEX school_years_current_uq ON "school_years" (tenant_id) WHERE is_current;
CREATE INDEX notifications_unread_idx ON "notifications" (tenant_id, user_id) WHERE read_at IS NULL;
CREATE INDEX audit_logs_sensitive_idx ON "audit_logs" (tenant_id, created_at DESC) WHERE is_sensitive;
CREATE INDEX assignments_scheduled_idx ON "assignments" (status, open_at) WHERE status = 'SCHEDULED';

-- Check constraints
ALTER TABLE "tenants" ADD CONSTRAINT tenants_slug_ck CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$');
ALTER TABLE "tenant_settings" ADD CONSTRAINT tenant_settings_ai_approval_ck
  CHECK (ai_enabled = false OR (ai_approval_ref IS NOT NULL AND ai_approved_at IS NOT NULL));
ALTER TABLE "tenant_settings" ADD CONSTRAINT tenant_settings_grace_ck CHECK (submit_grace_seconds BETWEEN 0 AND 120);
ALTER TABLE "school_years" ADD CONSTRAINT school_years_dates_ck CHECK (end_date > start_date);
ALTER TABLE "semesters" ADD CONSTRAINT semesters_dates_ck CHECK (end_date > start_date);
ALTER TABLE "class_students" ADD CONSTRAINT class_students_dates_ck CHECK (left_at IS NULL OR left_at >= joined_at);
ALTER TABLE "assignments" ADD CONSTRAINT assignments_window_ck CHECK (open_at IS NULL OR due_at IS NULL OR open_at < due_at);
ALTER TABLE "assignments" ADD CONSTRAINT assignments_late_ck CHECK (late_until IS NULL OR (due_at IS NOT NULL AND late_until >= due_at));
ALTER TABLE "assignments" ADD CONSTRAINT assignments_attempts_ck CHECK (max_attempts >= 1);
ALTER TABLE "assignments" ADD CONSTRAINT assignments_time_limit_ck CHECK (time_limit_minutes IS NULL OR time_limit_minutes > 0);
ALTER TABLE "assignments" ADD CONSTRAINT assignments_scores_ck CHECK (max_score >= 0 AND (pass_score IS NULL OR (pass_score >= 0 AND pass_score <= max_score)));
ALTER TABLE "assignments" ADD CONSTRAINT assignments_schedule_ck CHECK (status = 'DRAFT' OR (open_at IS NOT NULL AND due_at IS NOT NULL));
ALTER TABLE "assignment_targets" ADD CONSTRAINT assignment_targets_one_ck CHECK (
  (target_type = 'CLASS'   AND class_id IS NOT NULL AND student_id IS NULL AND group_id IS NULL) OR
  (target_type = 'STUDENT' AND student_id IS NOT NULL AND class_id IS NULL AND group_id IS NULL) OR
  (target_type = 'GROUP'   AND group_id IS NOT NULL AND class_id IS NULL AND student_id IS NULL));
CREATE UNIQUE INDEX assignment_targets_uq ON "assignment_targets" (assignment_id, target_type, class_id, student_id, group_id) NULLS NOT DISTINCT;
ALTER TABLE "questions" ADD CONSTRAINT questions_points_ck CHECK (points >= 0);
ALTER TABLE "rubric_criteria" ADD CONSTRAINT rubric_criteria_points_ck CHECK (max_points > 0);
ALTER TABLE "grades" ADD CONSTRAINT grades_score_ck CHECK (earned_score IS NULL OR (earned_score >= 0 AND earned_score <= max_score));
ALTER TABLE "grade_details" ADD CONSTRAINT grade_details_score_ck CHECK (earned_score IS NULL OR (earned_score >= 0 AND earned_score <= max_score));
ALTER TABLE "grade_details" ADD CONSTRAINT grade_details_official_ck CHECK (
  (status IN ('AUTO_GRADED', 'FINAL')) = (earned_score IS NOT NULL AND source IS NOT NULL));
ALTER TABLE "grade_detail_criteria" ADD CONSTRAINT grade_detail_criteria_score_ck CHECK (earned_score >= 0 AND earned_score <= max_score);
ALTER TABLE "ai_budget_periods" ADD CONSTRAINT ai_budget_ck CHECK (reserved_micros >= 0 AND spent_micros >= 0 AND limit_micros >= 0);
