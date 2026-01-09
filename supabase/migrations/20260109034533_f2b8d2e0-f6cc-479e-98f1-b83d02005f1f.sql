-- Add photos column to meltdowns table to store photo URLs
ALTER TABLE public.meltdowns 
ADD COLUMN IF NOT EXISTS photos TEXT[] DEFAULT NULL;