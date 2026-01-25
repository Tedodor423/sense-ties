-- Drop existing triggers first, then function with CASCADE
DROP TRIGGER IF EXISTS trigger_queue_insight_job ON public.meltdowns;
DROP TRIGGER IF EXISTS queue_insight_on_meltdown ON public.meltdowns;
DROP TRIGGER IF EXISTS trg_queue_insight_job ON public.meltdowns;
DROP FUNCTION IF EXISTS public.queue_insight_job() CASCADE;

-- Create rate-limited queue_insight_job function
CREATE OR REPLACE FUNCTION public.queue_insight_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  recent_job_exists boolean;
  rate_limit_minutes integer := 5;
BEGIN
  -- Check if there's already a pending or processing job for this child
  -- OR if a job was created within the last 5 minutes
  SELECT EXISTS (
    SELECT 1 FROM insight_jobs 
    WHERE child_id = NEW.child_id 
    AND (
      status IN ('pending', 'processing')
      OR (status = 'completed' AND created_at > now() - (rate_limit_minutes || ' minutes')::interval)
    )
  ) INTO recent_job_exists;
  
  -- Only create a new job if rate limit allows
  IF NOT recent_job_exists THEN
    INSERT INTO insight_jobs (child_id, meltdown_id, job_type, status, created_at)
    VALUES (NEW.child_id, NEW.id, 'meltdown_added', 'pending', now());
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Recreate trigger
CREATE TRIGGER trigger_queue_insight_job
AFTER INSERT ON public.meltdowns
FOR EACH ROW
EXECUTE FUNCTION public.queue_insight_job();