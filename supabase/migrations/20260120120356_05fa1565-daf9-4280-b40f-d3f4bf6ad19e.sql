CREATE OR REPLACE FUNCTION queue_insight_job()
RETURNS trigger AS $$
BEGIN
 INSERT INTO insight_jobs (child_id, meltdown_id, job_type, status, created_at)
 VALUES (NEW.child_id, NEW.id, 'meltdown_added', 'pending', now());
 RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_queue_insight_job ON meltdowns;
CREATE TRIGGER trg_queue_insight_job
AFTER INSERT ON meltdowns
FOR EACH ROW EXECUTE FUNCTION queue_insight_job();