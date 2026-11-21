-- BR-10: pass_score <= max_score is required when an assignment is published, not while drafting
-- (a new draft has max_score = 0 until questions are added).
ALTER TABLE "assignments" DROP CONSTRAINT assignments_scores_ck;
ALTER TABLE "assignments" ADD CONSTRAINT assignments_scores_ck
  CHECK (max_score >= 0 AND (pass_score IS NULL OR (pass_score >= 0 AND (status = 'DRAFT' OR pass_score <= max_score))));
