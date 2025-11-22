-- Add insights column to children table
ALTER TABLE public.children
ADD COLUMN insights text;

COMMENT ON COLUMN public.children.insights IS 'AI-generated insights based on meltdown history';