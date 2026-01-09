-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Add rolling_summary column to children table
ALTER TABLE public.children 
ADD COLUMN IF NOT EXISTS rolling_summary TEXT;

-- Create scientific_articles table for storing article metadata
CREATE TABLE public.scientific_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'error')),
  error_message TEXT,
  chunk_count INTEGER DEFAULT 0,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create article_embeddings table for chunked article content with vectors
CREATE TABLE public.article_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES public.scientific_articles(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding extensions.vector(1536),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create meltdown_embeddings table for meltdown vectors
CREATE TABLE public.meltdown_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meltdown_id UUID NOT NULL REFERENCES public.meltdowns(id) ON DELETE CASCADE,
  embedding extensions.vector(1536),
  summary_text TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(meltdown_id)
);

-- Create insight_jobs queue table
CREATE TABLE public.insight_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  meltdown_id UUID REFERENCES public.meltdowns(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL CHECK (job_type IN ('meltdown_added', 'article_added', 'manual')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Create index for job processing
CREATE INDEX IF NOT EXISTS insight_jobs_status_idx ON public.insight_jobs(status, created_at);

-- Enable RLS on all new tables
ALTER TABLE public.scientific_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.article_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meltdown_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insight_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for scientific_articles (admin only for write, all authenticated for read)
CREATE POLICY "Admins can manage articles"
ON public.scientific_articles
FOR ALL
USING (public.has_role(auth.uid(), 'Admin'))
WITH CHECK (public.has_role(auth.uid(), 'Admin'));

CREATE POLICY "Authenticated users can view articles"
ON public.scientific_articles
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- RLS Policies for article_embeddings (read only for authenticated)
CREATE POLICY "Authenticated users can view article embeddings"
ON public.article_embeddings
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- RLS Policies for meltdown_embeddings (users can view their children's embeddings)
CREATE POLICY "Users can view embeddings for accessible children"
ON public.meltdown_embeddings
FOR SELECT
USING (
  meltdown_id IN (
    SELECT m.id FROM public.meltdowns m
    JOIN public.children c ON m.child_id = c.id
    WHERE c.parent_id = auth.uid() 
    OR c.id IN (SELECT child_id FROM public.child_access WHERE user_id = auth.uid())
  )
);

-- RLS Policies for insight_jobs (users can view jobs for their children)
CREATE POLICY "Users can view jobs for accessible children"
ON public.insight_jobs
FOR SELECT
USING (
  child_id IN (
    SELECT id FROM public.children
    WHERE parent_id = auth.uid() 
    OR id IN (SELECT child_id FROM public.child_access WHERE user_id = auth.uid())
  )
);

-- Create function to queue insight job when meltdown is inserted
CREATE OR REPLACE FUNCTION public.queue_insight_job()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.insight_jobs (child_id, meltdown_id, job_type)
  VALUES (NEW.child_id, NEW.id, 'meltdown_added');
  RETURN NEW;
END;
$$;

-- Create trigger on meltdowns table
DROP TRIGGER IF EXISTS queue_insight_on_meltdown ON public.meltdowns;
CREATE TRIGGER queue_insight_on_meltdown
AFTER INSERT ON public.meltdowns
FOR EACH ROW
EXECUTE FUNCTION public.queue_insight_job();

-- Enable realtime for children table (for insights updates)
ALTER PUBLICATION supabase_realtime ADD TABLE public.children;

-- Create storage bucket for article PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('scientific-articles', 'scientific-articles', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for scientific-articles bucket
CREATE POLICY "Admins can upload articles"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'scientific-articles' 
  AND public.has_role(auth.uid(), 'Admin')
);

CREATE POLICY "Admins can delete articles"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'scientific-articles' 
  AND public.has_role(auth.uid(), 'Admin')
);

CREATE POLICY "Authenticated users can view articles storage"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'scientific-articles' 
  AND auth.uid() IS NOT NULL
);