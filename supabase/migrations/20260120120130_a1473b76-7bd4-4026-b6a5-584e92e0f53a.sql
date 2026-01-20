-- Add HNSW indexes for vector search (more memory-efficient than ivfflat)
CREATE INDEX IF NOT EXISTS idx_article_embeddings_embedding 
  ON article_embeddings USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_meltdown_embeddings_embedding 
  ON meltdown_embeddings USING hnsw (embedding vector_cosine_ops);