-- Add new columns to meltdowns table for enhanced logging
ALTER TABLE public.meltdowns
ADD COLUMN IF NOT EXISTS location text,
ADD COLUMN IF NOT EXISTS environment_factors text[],
ADD COLUMN IF NOT EXISTS preceding_activities text[],
ADD COLUMN IF NOT EXISTS child_state text[],
ADD COLUMN IF NOT EXISTS duration text,
ADD COLUMN IF NOT EXISTS resolution_strategies text[],
ADD COLUMN IF NOT EXISTS confidence_level integer;

-- Add comment for documentation
COMMENT ON COLUMN public.meltdowns.location IS 'Address/location where meltdown occurred';
COMMENT ON COLUMN public.meltdowns.environment_factors IS 'Array of environmental factors: noisy, visually_overwhelming, smell, crowded, inside, outside';
COMMENT ON COLUMN public.meltdowns.preceding_activities IS 'What child was doing before meltdown';
COMMENT ON COLUMN public.meltdowns.child_state IS 'How child was feeling: tired, hungry, unwell, anxious, etc';
COMMENT ON COLUMN public.meltdowns.duration IS 'Duration of meltdown: 1min, 3min, 5min, 10min, 15min, 30min, or custom';
COMMENT ON COLUMN public.meltdowns.resolution_strategies IS 'What helped resolve the situation';
COMMENT ON COLUMN public.meltdowns.confidence_level IS 'How confident caregiver felt (1-5)';