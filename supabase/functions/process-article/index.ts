import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";
import OpenAI from "https://deno.land/x/openai@v4.20.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CHUNK_SIZE = 1500; // Characters per chunk for embedding
const CHUNK_OVERLAP = 200; // Overlap between chunks

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { article_id } = await req.json();
    console.log("Processing article:", article_id);

    if (!article_id) {
      return new Response(JSON.stringify({ error: "article_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Initialize Supabase client with user's auth token
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify user is admin
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user has Admin role
    const { data: roleData } = await userClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (!roleData || roleData.role !== "Admin") {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role for the actual operations
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch article
    const { data: article, error: articleError } = await supabase
      .from("scientific_articles")
      .select("*")
      .eq("id", article_id)
      .single();

    if (articleError || !article) {
      console.error("Article not found:", articleError);
      return new Response(JSON.stringify({ error: "Article not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update status to processing
    await supabase
      .from("scientific_articles")
      .update({ status: "processing" })
      .eq("id", article_id);

    // Get the file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("scientific-articles")
      .download(article.file_path);

    if (downloadError || !fileData) {
      console.error("Error downloading file:", downloadError);
      await supabase
        .from("scientific_articles")
        .update({ status: "error", error_message: "Failed to download file" })
        .eq("id", article_id);
      return new Response(JSON.stringify({ error: "Failed to download file" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract text from PDF (basic text extraction)
    // For production, you'd want to use a proper PDF parsing library
    const text = await extractTextFromFile(fileData, article.filename);
    
    if (!text || text.length < 100) {
      console.error("Failed to extract meaningful text from file");
      await supabase
        .from("scientific_articles")
        .update({ status: "error", error_message: "Failed to extract text from PDF" })
        .eq("id", article_id);
      return new Response(JSON.stringify({ error: "Failed to extract text" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Extracted ${text.length} characters from ${article.filename}`);

    // Chunk the text
    const chunks = chunkText(text, CHUNK_SIZE, CHUNK_OVERLAP);
    console.log(`Created ${chunks.length} chunks`);

    // Generate embeddings for each chunk
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      await supabase
        .from("scientific_articles")
        .update({ status: "error", error_message: "OpenAI API key not configured" })
        .eq("id", article_id);
      return new Response(JSON.stringify({ error: "OpenAI API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

    // Delete any existing embeddings for this article
    await supabase
      .from("article_embeddings")
      .delete()
      .eq("article_id", article_id);

    // Process chunks in batches
    const BATCH_SIZE = 10;
    let processedChunks = 0;

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      
      // Generate embeddings for batch
      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: batch,
      });

      // Insert embeddings
      const embeddings = embeddingResponse.data.map((e, idx) => ({
        article_id,
        chunk_index: i + idx,
        chunk_text: batch[idx],
        embedding: JSON.stringify(e.embedding),
      }));

      const { error: insertError } = await supabase
        .from("article_embeddings")
        .insert(embeddings);

      if (insertError) {
        console.error("Error inserting embeddings:", insertError);
      }

      processedChunks += batch.length;
      console.log(`Processed ${processedChunks}/${chunks.length} chunks`);
    }

    // Update article status
    await supabase
      .from("scientific_articles")
      .update({ 
        status: "ready", 
        chunk_count: chunks.length,
        updated_at: new Date().toISOString(),
      })
      .eq("id", article_id);

    console.log("Article processing complete:", article_id);

    return new Response(JSON.stringify({ 
      success: true, 
      chunks_created: chunks.length 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in process-article function:", error);
    return new Response(JSON.stringify({ error: "Failed to process article" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Helper function to extract text from file
async function extractTextFromFile(blob: Blob, filename: string): Promise<string> {
  const lowerName = filename.toLowerCase();
  
  if (lowerName.endsWith('.txt') || lowerName.endsWith('.md')) {
    return await blob.text();
  }
  
  if (lowerName.endsWith('.pdf')) {
    // Basic PDF text extraction - for production use a proper library
    // This is a simplified approach that extracts readable text from PDF binary
    const arrayBuffer = await blob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const text = new TextDecoder('utf-8', { fatal: false }).decode(uint8Array);
    
    // Extract text between stream...endstream markers (PDF text objects)
    const textMatches = text.match(/\((.*?)\)/g) || [];
    const extractedText = textMatches
      .map(m => m.slice(1, -1))
      .filter(t => t.length > 2 && /[a-zA-Z]/.test(t))
      .join(' ');
    
    // Clean up the text
    return extractedText
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  // Fallback: try to read as text
  return await blob.text();
}

// Helper function to chunk text with overlap
function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start = end - overlap;
    
    if (start >= text.length) break;
  }
  
  return chunks.filter(c => c.trim().length > 50);
}
