-- Enable pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Create RPC function for per-trigger vector search using extensions.vector
CREATE OR REPLACE FUNCTION public.search_article_embeddings(
  query_embedding text,
  match_count int DEFAULT 3
)
RETURNS TABLE (
  id uuid,
  article_id uuid,
  chunk_index int,
  chunk_text text,
  similarity float
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT 
    ae.id,
    ae.article_id,
    ae.chunk_index,
    ae.chunk_text,
    1 - (ae.embedding <#> query_embedding::extensions.vector) AS similarity
  FROM article_embeddings ae
  WHERE ae.embedding IS NOT NULL
  ORDER BY ae.embedding <#> query_embedding::extensions.vector
  LIMIT match_count;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.search_article_embeddings TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_article_embeddings TO service_role;