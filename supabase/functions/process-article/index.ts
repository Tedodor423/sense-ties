import { createClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";
import OpenAI from "https://deno.land/x/openai@v4.20.1/mod.ts";

// Declare EdgeRuntime for Supabase Edge Functions
declare const EdgeRuntime: {
  waitUntil: (promise: Promise<unknown>) => void;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 200;

// Background processing function
async function processArticleInBackground(
  article_id: string,
  supabaseUrl: string,
  supabaseServiceKey: string
) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log("Background processing started for article:", article_id);

    // Fetch article
    const { data: article, error: articleError } = await supabase
      .from("scientific_articles")
      .select("*")
      .eq("id", article_id)
      .single();

    if (articleError || !article) {
      console.error("Article not found:", articleError);
      await supabase
        .from("scientific_articles")
        .update({ status: "error", error_message: "Article not found" })
        .eq("id", article_id);
      return;
    }

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
      return;
    }

    // Extract text from PDF
    const text = await extractTextFromFile(fileData, article.filename);

    if (!text || text.length < 100) {
      console.error("Failed to extract meaningful text from file");
      await supabase
        .from("scientific_articles")
        .update({ status: "error", error_message: "Failed to extract text from PDF. Try a text-based PDF." })
        .eq("id", article_id);
      return;
    }

    console.log(`Extracted ${text.length} characters from ${article.filename}`);

    // Chunk the text
    const chunks = chunkText(text, CHUNK_SIZE, CHUNK_OVERLAP);
    console.log(`Created ${chunks.length} chunks`);

    // Generate embeddings
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      await supabase
        .from("scientific_articles")
        .update({ status: "error", error_message: "OpenAI API key not configured" })
        .eq("id", article_id);
      return;
    }

    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

    // Delete any existing embeddings for this article
    await supabase
      .from("article_embeddings")
      .delete()
      .eq("article_id", article_id);

    // Process chunks in smaller batches to reduce memory usage
    const BATCH_SIZE = 5;
    let processedChunks = 0;

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);

      try {
        const embeddingResponse = await openai.embeddings.create({
          model: "text-embedding-ada-002",
          input: batch,
        });

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
      } catch (embeddingError) {
        console.error("Error generating embeddings for batch:", embeddingError);
      }
    }

    // Update article status to ready
    await supabase
      .from("scientific_articles")
      .update({
        status: "ready",
        chunk_count: chunks.length,
        updated_at: new Date().toISOString(),
      })
      .eq("id", article_id);

    console.log("Article processing complete:", article_id);
  } catch (error) {
    console.error("Background processing error:", error);
    await supabase
      .from("scientific_articles")
      .update({ status: "error", error_message: String(error) })
      .eq("id", article_id);
  }
}

// Main handler
Deno.serve(async (req) => {
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
    console.log("Processing article request:", article_id);

    if (!article_id) {
      return new Response(JSON.stringify({ error: "article_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

    // Update status to processing immediately
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    await supabase
      .from("scientific_articles")
      .update({ status: "processing" })
      .eq("id", article_id);

    // Start background processing using EdgeRuntime.waitUntil
    EdgeRuntime.waitUntil(
      processArticleInBackground(article_id, supabaseUrl, supabaseServiceKey)
    );

    // Return immediately
    return new Response(JSON.stringify({
      success: true,
      message: "Processing started in background"
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in process-article function:", error);
    return new Response(JSON.stringify({ error: "Failed to start processing" }), {
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
    // Memory-conscious PDF text extraction (best-effort)
    // Scans bytes for literal strings within ( ... ) which often contain PDF text.
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const decoder = new TextDecoder('latin1', { fatal: false });

    const parts: string[] = [];
    let buf: number[] = [];
    let inParen = false;
    let escaped = false;
    let totalChars = 0;
    const MAX_EXTRACTED_CHARS = 250_000; // safety cap to prevent memory blowups

    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];

      if (!inParen) {
        if (b === 0x28) { // '('
          inParen = true;
          escaped = false;
          buf = [];
        }
        continue;
      }

      // inParen
      if (escaped) {
        buf.push(b);
        escaped = false;
        continue;
      }

      if (b === 0x5c) { // '\\'
        escaped = true;
        continue;
      }

      if (b === 0x29) { // ')'
        if (buf.length > 2) {
          const s = decoder.decode(new Uint8Array(buf));
          if (/[a-zA-Z]/.test(s)) {
            parts.push(s);
            totalChars += s.length;
            if (totalChars >= MAX_EXTRACTED_CHARS) break;
          }
        }
        inParen = false;
        buf = [];
        continue;
      }

      // Skip obvious binary noise
      if (b === 0x00) continue;
      buf.push(b);

      // Prevent pathological long strings
      if (buf.length > 5000) {
        inParen = false;
        buf = [];
      }
    }

    return parts
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

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
