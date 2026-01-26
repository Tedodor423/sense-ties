-- Add avatar_path and theme_color columns to children table
ALTER TABLE public.children
ADD COLUMN avatar_path text,
ADD COLUMN theme_color text DEFAULT 'default';

-- Add comment for clarity
COMMENT ON COLUMN public.children.avatar_path IS 'Path to child profile picture in Backblaze B2 storage';
COMMENT ON COLUMN public.children.theme_color IS 'Theme color used when this child is selected in the UI';