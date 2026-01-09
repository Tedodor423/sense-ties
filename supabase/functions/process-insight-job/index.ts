import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";
import OpenAI from "https://deno.land/x/openai@v4.20.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // This function can be called by a cron job or manually
    // Use service role for all operations
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY not configured");
      return new Response(JSON.stringify({ error: "OpenAI API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

    // Fetch pending jobs (limit to 5 at a time for performance)
    const { data: jobs, error: jobsError } = await supabase
      .from("insight_jobs")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(5);

    if (jobsError) {
      console.error("Error fetching jobs:", jobsError);
      return new Response(JSON.stringify({ error: "Failed to fetch jobs" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!jobs || jobs.length === 0) {
      console.log("No pending jobs found");
      return new Response(JSON.stringify({ message: "No pending jobs" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Processing ${jobs.length} jobs`);

    for (const job of jobs) {
      try {
        // Mark job as processing
        await supabase
          .from("insight_jobs")
          .update({ status: "processing", started_at: new Date().toISOString() })
          .eq("id", job.id);

        console.log(`Processing job ${job.id} for child ${job.child_id}`);

        // Step 1: Generate embedding for new meltdown (if applicable)
        if (job.meltdown_id) {
          await generateMeltdownEmbedding(supabase, openai, job.meltdown_id);
        }

        // Step 2: Update rolling summary
        await updateRollingSummary(supabase, openai, job.child_id);

        // Step 3: Generate new insights using vector search + articles
        await generateInsights(supabase, openai, job.child_id);

        // Mark job as completed
        await supabase
          .from("insight_jobs")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("id", job.id);

        console.log(`Job ${job.id} completed successfully`);

      } catch (jobError) {
        console.error(`Error processing job ${job.id}:`, jobError);
        await supabase
          .from("insight_jobs")
          .update({ 
            status: "failed", 
            error_message: jobError instanceof Error ? jobError.message : "Unknown error",
            completed_at: new Date().toISOString(),
          })
          .eq("id", job.id);
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      processed: jobs.length 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in process-insight-job function:", error);
    return new Response(JSON.stringify({ error: "Failed to process jobs" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Generate embedding for a meltdown entry
async function generateMeltdownEmbedding(
  supabase: any, 
  openai: OpenAI, 
  meltdownId: string
) {
  // Fetch meltdown data
  const { data: meltdown, error } = await supabase
    .from("meltdowns")
    .select("*")
    .eq("id", meltdownId)
    .single();

  if (error || !meltdown) {
    console.error("Meltdown not found:", meltdownId);
    return;
  }

  // Create a summary text for embedding
  const summaryText = [
    `Date: ${new Date(meltdown.timestamp).toLocaleDateString()}`,
    `Intensity: ${meltdown.meltdown_level}/5`,
    `Environment: ${meltdown.environment_trigger || 'Not specified'}`,
    `Location: ${meltdown.location || 'Not specified'}`,
    `Noise Level: ${meltdown.noise_level || 'Not specified'}`,
    `Duration: ${meltdown.duration || 'Not specified'}`,
    `Preceding Activities: ${meltdown.preceding_activities?.join(', ') || 'None'}`,
    `Child State: ${meltdown.child_state?.join(', ') || 'None'}`,
    `Description: ${meltdown.description || 'No description'}`,
    `Environment Details: ${meltdown.environment_description || 'None'}`,
    `Resolution Strategies: ${meltdown.resolution_strategies?.join(', ') || 'None'}`,
  ].join('\n');

  // Generate embedding
  const embeddingResponse = await openai.embeddings.create({
    model: "text-embedding-ada-002",
    input: summaryText,
  });

  const embedding = embeddingResponse.data[0].embedding;

  // Upsert embedding
  const { error: upsertError } = await supabase
    .from("meltdown_embeddings")
    .upsert({
      meltdown_id: meltdownId,
      embedding: JSON.stringify(embedding),
      summary_text: summaryText,
    }, { onConflict: 'meltdown_id' });

  if (upsertError) {
    console.error("Error upserting meltdown embedding:", upsertError);
  } else {
    console.log("Generated embedding for meltdown:", meltdownId);
  }
}

// Update rolling summary for a child
async function updateRollingSummary(
  supabase: any, 
  openai: OpenAI, 
  childId: string
) {
  // Fetch recent meltdowns (last 30)
  const { data: meltdowns } = await supabase
    .from("meltdowns")
    .select("*")
    .eq("child_id", childId)
    .order("timestamp", { ascending: false })
    .limit(30);

  if (!meltdowns || meltdowns.length === 0) {
    return;
  }

  // Fetch existing rolling summary
  const { data: child } = await supabase
    .from("children")
    .select("rolling_summary, name")
    .eq("id", childId)
    .single();

  // Create a summary prompt
  const meltdownsSummary = meltdowns.map((m: any, idx: number) => 
    `Event ${idx + 1}: ${new Date(m.timestamp).toLocaleDateString()} - ` +
    `Intensity ${m.meltdown_level}/5, ` +
    `Trigger: ${m.environment_trigger || 'Unknown'}, ` +
    `Duration: ${m.duration || 'Unknown'}`
  ).join('\n');

  const prompt = `You are analyzing meltdown patterns for a child. Based on the following data, create a concise rolling summary (max 200 words) that captures:
1. Frequency patterns (time of day, day of week)
2. Common triggers and their frequency
3. Intensity trends over time
4. Notable changes or new patterns

${child?.rolling_summary ? `Previous summary: ${child.rolling_summary}\n\n` : ''}
Recent meltdown events:
${meltdownsSummary}

Provide an updated rolling summary:`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are an analyst helping parents understand their child's behavioral patterns. Be concise and factual." },
      { role: "user", content: prompt }
    ],
    max_tokens: 300,
  });

  const newSummary = response.choices[0].message.content;

  // Update child's rolling summary
  await supabase
    .from("children")
    .update({ rolling_summary: newSummary })
    .eq("id", childId);

  console.log("Updated rolling summary for child:", childId);
}

// Generate insights using vector search and scientific articles
async function generateInsights(
  supabase: any, 
  openai: OpenAI, 
  childId: string
) {
  // Fetch configurable system prompt from app_settings
  const { data: promptSetting } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "insight_prompt")
    .single();
  
  const systemPrompt = promptSetting?.value || 
    "You are a supportive child behavior specialist helping parents understand and manage their child's meltdowns. Provide evidence-based, actionable insights.";

  // Fetch child data
  const { data: child } = await supabase
    .from("children")
    .select("name, rolling_summary")
    .eq("id", childId)
    .single();

  if (!child) return;

  // Fetch recent meltdowns
  const { data: recentMeltdowns } = await supabase
    .from("meltdowns")
    .select("*")
    .eq("child_id", childId)
    .order("timestamp", { ascending: false })
    .limit(10);

  // Create query embedding for semantic search
  const queryText = `Child behavioral patterns: ${child.rolling_summary || 'No summary yet'}. ` +
    `Recent triggers: ${recentMeltdowns?.map((m: any) => m.environment_trigger).filter(Boolean).join(', ') || 'none'}`;

  const queryEmbedding = await openai.embeddings.create({
    model: "text-embedding-ada-002",
    input: queryText,
  });

  // Search for relevant article chunks using vector similarity
  const { data: relevantArticles } = await supabase.rpc('match_article_embeddings', {
    query_embedding: JSON.stringify(queryEmbedding.data[0].embedding),
    match_threshold: 0.7,
    match_count: 5,
  }).catch(() => ({ data: null }));

  // Fallback if RPC doesn't exist - fetch some article chunks
  let articleContext = "";
  if (!relevantArticles) {
    const { data: articles } = await supabase
      .from("article_embeddings")
      .select("chunk_text, scientific_articles(title)")
      .limit(5);
    
    if (articles && articles.length > 0) {
      articleContext = articles.map((a: any) => 
        `[From: ${a.scientific_articles?.title || 'Research'}]\n${a.chunk_text}`
      ).join('\n\n');
    }
  } else {
    articleContext = relevantArticles.map((a: any) => 
      `[Relevance: ${(a.similarity * 100).toFixed(0)}%]\n${a.chunk_text}`
    ).join('\n\n');
  }

  // Format recent meltdowns for context
  const meltdownsText = recentMeltdowns?.map((m: any, idx: number) =>
    `Event ${idx + 1}:
- Date: ${new Date(m.timestamp).toLocaleDateString()}
- Intensity: ${m.meltdown_level}/5
- Environment: ${m.environment_trigger || 'Not specified'}
- Duration: ${m.duration || 'Not specified'}
- Description: ${m.description || 'No description'}`
  ).join('\n\n') || 'No recent events.';

  // Generate comprehensive insights
  const insightPrompt = `CHILD'S ROLLING SUMMARY:
${child.rolling_summary || 'No summary yet - this is the first analysis.'}

RECENT MELTDOWN EVENTS:
${meltdownsText}

${articleContext ? `RELEVANT RESEARCH CONTEXT:
${articleContext}

Use these research findings to provide evidence-based recommendations where applicable.` : ''}

Generate personalized insights for this child's behavioral patterns.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: insightPrompt }
    ],
    max_tokens: 600,
  });

  const insights = response.choices[0].message.content;

  // Update child's insights
  await supabase
    .from("children")
    .update({ 
      insights,
      updated_at: new Date().toISOString(),
    })
    .eq("id", childId);

  console.log("Generated new insights for child:", childId);
}
