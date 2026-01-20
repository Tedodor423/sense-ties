import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";
import OpenAI from "https://deno.land/x/openai@v4.20.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Types
interface InsightJob {
  id: string;
  child_id: string;
  meltdown_id: string | null;
  job_type: string;
  status: string;
  created_at: string;
}

interface Meltdown {
  id: string;
  child_id: string;
  timestamp: string;
  meltdown_level: number;
  environment_trigger: string | null;
  noise_level: string | null;
  location: string | null;
  duration: string | null;
  description: string | null;
  environment_description: string | null;
  preceding_activities: string[] | null;
  child_state: string[] | null;
  resolution_strategies: string[] | null;
}

interface AnalysisResult {
  summary: string;
  stats: {
    count: number;
    avg_duration_seconds: number | "missing_data";
    median_level: number;
  };
  top_triggers: Array<{
    trigger: string;
    count: number;
    supporting_examples: string[];
  }>;
  time_patterns: Array<{
    pattern: string;
    description: string;
    count: number;
  }>;
  resolution_effectiveness: Array<{
    strategy: string;
    helped_count: number;
    not_helped_count: number;
    notes: string;
  }>;
  safety_flags: string[];
}

interface ChildContext {
  child_name: string;
  child_id: string;
  birth_month: number | null;
  birth_year: number | null;
}

interface EvidenceRef {
  article_id: string;
  chunk_index: number;
  chunk_text: string;
  score: number;
}

interface TriggerEvidence {
  trigger: string;
  refs: EvidenceRef[];
}

interface Evidence {
  evidence_refs: TriggerEvidence[];
  formattedContext: string;
  // Keep sources for backward compatibility with generateInsight
  sources: Array<{
    title: string;
    chunk: string;
    similarity: number;
  }>;
}

interface InsightDraft {
  narrative: string;
  recommendations: string[];
  evidenceUsed: string[];
}

interface SafetyResult {
  output: string;
  isUrgent: boolean;
  safeguardingNotes: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

  try {
    // Parse optional job_id from request body
    let targetJobId: string | null = null;
    try {
      const body = await req.json();
      targetJobId = body?.job_id || null;
    } catch {
      // No body or invalid JSON - process next pending job
    }

    // Step 1: Fetch pending job (specific or next available)
    const job = await selectJobPending(supabase, targetJobId);
    
    if (!job) {
      console.log("No pending jobs found");
      return new Response(JSON.stringify({ message: "No pending jobs" }), {
        status: 204,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 2: Mark job as processing
    await updateJob(supabase, job.id, { 
      status: "processing", 
      started_at: new Date().toISOString() 
    });

    console.log(`Processing job ${job.id} for child ${job.child_id}`);

    try {
      // Step 3: Load child + recent meltdowns (last 30 days)
      const meltdowns = await loadMeltdowns(supabase, job.child_id, { windowDays: 30 });
      
      if (meltdowns.length === 0) {
        throw new Error("No meltdowns found for analysis");
      }

      // Step 4: Generate meltdown embedding if this job has a meltdown_id
      if (job.meltdown_id) {
        await generateMeltdownEmbedding(supabase, openai, job.meltdown_id);
      }

      // Step 5: Analyze meltdowns - produce analysis JSON
      const childContext = await getChildContext(supabase, job.child_id);
      const analysis = await analyzeMeltdowns(openai, meltdowns, childContext);
      console.log("Analysis complete:", analysis.top_triggers.length, "triggers identified");

      // Step 6: Retrieve RAG evidence based on analysis
      const queryTerms = [
        analysis.summary,
        ...analysis.top_triggers.map(t => t.trigger),
        ...analysis.safety_flags,
      ].filter(Boolean);
      const evidence = await retrieveEvidence(supabase, openai, queryTerms);
      console.log("Retrieved", evidence.sources.length, "evidence sources");

      // Step 7: Generate insight narrative
      const childData = await getChildData(supabase, job.child_id);
      const draft = await generateInsight(openai, analysis, evidence, childData, meltdowns);
      console.log("Generated insight draft");

      // Step 8: Safety check - flag urgent concerns
      const safeResult = await applySafetyRules(openai, draft, analysis);
      console.log("Safety check complete, urgent:", safeResult.isUrgent);

      // Step 9: Save insight to children table
      await saveInsight(supabase, job.child_id, safeResult);

      // Step 10: Mark job completed
      await updateJob(supabase, job.id, { 
        status: "completed", 
        completed_at: new Date().toISOString() 
      });

      console.log(`Job ${job.id} completed successfully`);

      return new Response(JSON.stringify({ 
        success: true, 
        job_id: job.id,
        child_id: job.child_id,
        is_urgent: safeResult.isUrgent,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } catch (err) {
      console.error(`Error processing job ${job.id}:`, err);
      await updateJob(supabase, job.id, { 
        status: "error", 
        error_message: err instanceof Error ? err.message : "Unknown error",
        completed_at: new Date().toISOString(),
      });

      return new Response(JSON.stringify({ 
        success: false,
        job_id: job.id,
        error: err instanceof Error ? err.message : "Unknown error",
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

  } catch (error) {
    console.error("Error in process-insight-job function:", error);
    return new Response(JSON.stringify({ error: "Failed to process job" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ============================================================================
// Database Operations
// ============================================================================

async function selectJobPending(
  supabase: SupabaseClient, 
  jobId: string | null
): Promise<InsightJob | null> {
  if (jobId) {
    // Fetch specific job by ID
    const { data, error } = await supabase
      .from("insight_jobs")
      .select("*")
      .eq("id", jobId)
      .eq("status", "pending")
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Error fetching job:", error);
      return null;
    }
    return data as InsightJob | null;
  }

  // Fetch next pending job
  const { data, error } = await supabase
    .from("insight_jobs")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    console.error("Error fetching job:", error);
    return null;
  }

  return data && data.length > 0 ? data[0] as InsightJob : null;
}

async function updateJob(
  supabase: SupabaseClient, 
  jobId: string, 
  updates: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase
    .from("insight_jobs")
    .update(updates)
    .eq("id", jobId);

  if (error) {
    console.error("Error updating job:", error);
    throw new Error(`Failed to update job: ${error.message}`);
  }
}

async function loadMeltdowns(
  supabase: SupabaseClient, 
  childId: string, 
  options: { windowDays: number }
): Promise<Meltdown[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - options.windowDays);

  const { data, error } = await supabase
    .from("meltdowns")
    .select("*")
    .eq("child_id", childId)
    .gte("timestamp", cutoffDate.toISOString())
    .order("timestamp", { ascending: false });

  if (error) {
    console.error("Error loading meltdowns:", error);
    throw new Error(`Failed to load meltdowns: ${error.message}`);
  }

  return (data || []) as Meltdown[];
}

async function getChildContext(
  supabase: SupabaseClient, 
  childId: string
): Promise<ChildContext> {
  const { data, error } = await supabase
    .from("children")
    .select("id, name, birth_month, birth_year")
    .eq("id", childId)
    .single();

  if (error) {
    console.error("Error fetching child context:", error);
    throw new Error(`Failed to fetch child context: ${error.message}`);
  }

  return {
    child_id: data.id,
    child_name: data.name,
    birth_month: data.birth_month,
    birth_year: data.birth_year,
  };
}

// Helper to calculate age from birth month/year
function calculateAge(birthMonth: number | null, birthYear: number | null): number | null {
  if (!birthMonth || !birthYear) return null;
  
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  
  let age = currentYear - birthYear;
  if (currentMonth < birthMonth) {
    age -= 1;
  }
  
  return age;
}

async function getChildData(
  supabase: SupabaseClient, 
  childId: string
): Promise<{ name: string; rolling_summary: string | null }> {
  const { data, error } = await supabase
    .from("children")
    .select("name, rolling_summary")
    .eq("id", childId)
    .single();

  if (error) {
    console.error("Error fetching child:", error);
    throw new Error(`Failed to fetch child data: ${error.message}`);
  }

  return data;
}

async function saveInsight(
  supabase: SupabaseClient, 
  childId: string, 
  result: SafetyResult
): Promise<void> {
  // Build final insight text with urgency marker if needed
  let finalInsight = result.output;
  if (result.isUrgent && result.safeguardingNotes) {
    finalInsight = `⚠️ URGENT ATTENTION REQUIRED\n\n${result.safeguardingNotes}\n\n---\n\n${result.output}`;
  }

  const { error } = await supabase
    .from("children")
    .update({ 
      insights: finalInsight,
      updated_at: new Date().toISOString(),
    })
    .eq("id", childId);

  if (error) {
    console.error("Error saving insight:", error);
    throw new Error(`Failed to save insight: ${error.message}`);
  }
}

// ============================================================================
// Step 4: Analyze Meltdowns (with exact prompts from spec)
// ============================================================================

const SYSTEM_PROMPT_ANALYZE = `You are an objective data analyst. You MUST output only valid JSON (no extra commentary) following the schema exactly. Be conservative: use hedged language like "may", "associated with", "possible", and never claim diagnosis. Output must include: summary, stats, top_triggers, time_patterns, resolution_effectiveness, safety_flags.`;

async function analyzeMeltdowns(
  openai: OpenAI, 
  meltdowns: Meltdown[],
  context: ChildContext
): Promise<AnalysisResult> {
  // Prepare meltdown objects for the prompt
  const meltdownObjects = meltdowns.map(m => ({
    timestamp: m.timestamp,
    location: m.location || null,
    environment_factors: [
      m.environment_trigger,
      m.noise_level ? `noise:${m.noise_level}` : null,
      ...(m.child_state || []),
    ].filter(Boolean),
    meltdown_level: m.meltdown_level,
    duration_seconds: parseDurationToSeconds(m.duration),
    resolution_strategies: m.resolution_strategies || [],
    description: m.description || "",
  }));

  const age = calculateAge(context.birth_month, context.birth_year);
  const ageStr = age !== null ? `${age}` : 'unknown';
  
  const userPrompt = `INPUT:
- child: ${context.child_name}, id ${context.child_id}, age ${ageStr}
- MELTDOWNS (array): ${JSON.stringify(meltdownObjects)}

TASK:
1) Produce JSON with these keys:
 {
   "summary": "short 1-2 sentence summary",
   "stats": { "count": int, "avg_duration_seconds": number, "median_level": number },
   "top_triggers": [ { "trigger": "noisy", "count": int, "supporting_examples":[...]} ],
   "time_patterns": [ { "pattern": "after-school", "description":"", "count": int } ],
   "resolution_effectiveness": [ { "strategy":"deep pressure", "helped_count": int, "not_helped_count": int, "notes":"" } ],
   "safety_flags": [ "long_duration", "self_injury_possible" ]  // can be empty
 }

2) Use only the supplied meltdown array to compute these numbers (no hallucination).
3) Where durations are missing, state "missing_data" and estimate only if at least 60% complete.
4) Keep the output valid JSON only.`;

  // Retry logic: up to 3 attempts (1 initial + 2 retries)
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const messages: Array<{ role: "system" | "user"; content: string }> = [
        { role: "system", content: SYSTEM_PROMPT_ANALYZE },
        { role: "user", content: attempt > 1 
          ? userPrompt + "\n\nOutput valid JSON only — do not include commentary."
          : userPrompt 
        },
      ];

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        max_tokens: 1500,
        temperature: 0.2,
      });

      const content = response.choices[0].message.content || "{}";
      
      // Extract JSON from response (handle potential markdown code blocks)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }
      
      const parsed = JSON.parse(jsonMatch[0]) as AnalysisResult;
      
      // Validate required fields exist
      if (!parsed.summary || !parsed.stats || !parsed.top_triggers) {
        throw new Error("Missing required fields in analysis result");
      }
      
      return parsed;
    } catch (e) {
      console.error(`Attempt ${attempt} failed to parse analysis JSON:`, e);
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }

  // All retries failed - return default structure
  console.error("All analysis attempts failed:", lastError);
  const triggers = [...new Set(meltdowns.map(m => m.environment_trigger).filter(Boolean))] as string[];
  
  return {
    summary: `${meltdowns.length} meltdown events recorded. Manual review recommended.`,
    stats: {
      count: meltdowns.length,
      avg_duration_seconds: "missing_data",
      median_level: Math.round(meltdowns.reduce((sum, m) => sum + m.meltdown_level, 0) / meltdowns.length),
    },
    top_triggers: triggers.slice(0, 3).map(t => ({
      trigger: t,
      count: meltdowns.filter(m => m.environment_trigger === t).length,
      supporting_examples: [],
    })),
    time_patterns: [],
    resolution_effectiveness: [],
    safety_flags: [],
  };
}

// Helper to parse duration strings to seconds
function parseDurationToSeconds(duration: string | null): number | null {
  if (!duration) return null;
  
  const lower = duration.toLowerCase();
  
  // Handle common patterns
  if (lower.includes("minute")) {
    const match = lower.match(/(\d+)/);
    if (match) return parseInt(match[1]) * 60;
  }
  if (lower.includes("hour")) {
    const match = lower.match(/(\d+)/);
    if (match) return parseInt(match[1]) * 3600;
  }
  if (lower.includes("second")) {
    const match = lower.match(/(\d+)/);
    if (match) return parseInt(match[1]);
  }
  
  // Try direct numeric value
  const numeric = parseInt(duration);
  if (!isNaN(numeric)) return numeric * 60; // Assume minutes if just a number
  
  return null;
}

// ============================================================================
// Step 5: Retrieve Evidence (RAG) - Per-trigger vector search
// ============================================================================

async function retrieveEvidence(
  supabase: SupabaseClient, 
  openai: OpenAI, 
  triggers: string[]
): Promise<Evidence> {
  const evidence_refs: TriggerEvidence[] = [];
  const allSources: Evidence["sources"] = [];

  // Process each trigger with its own embedding and vector search
  for (const trigger of triggers) {
    if (!trigger || trigger.trim() === "") continue;

    try {
      // Generate embedding for this trigger
      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: trigger,
      });

      const queryEmbedding = embeddingResponse.data[0].embedding;

      // Run pgvector nearest-neighbor search
      // SQL: SELECT id, article_id, chunk_index, chunk_text, 1 - (embedding <#> query_embedding) AS similarity
      //      FROM article_embeddings ORDER BY embedding <#> query_embedding LIMIT 3;
      const { data: matches, error } = await supabase.rpc('search_article_embeddings', {
        query_embedding: JSON.stringify(queryEmbedding),
        match_count: 3,
      });

      if (error) {
        console.log(`Vector search failed for trigger "${trigger}":`, error.message);
        // Try fallback with raw SQL via RPC if available
        const fallbackResult = await searchWithFallback(supabase, queryEmbedding);
        if (fallbackResult.length > 0) {
          evidence_refs.push({
            trigger,
            refs: fallbackResult,
          });
          // Add to sources for formatted context
          fallbackResult.forEach(ref => {
            allSources.push({
              title: `Article (trigger: ${trigger})`,
              chunk: ref.chunk_text,
              similarity: ref.score,
            });
          });
        }
        continue;
      }

      if (matches && matches.length > 0) {
        const refs: EvidenceRef[] = matches.map((m: any) => ({
          article_id: m.article_id,
          chunk_index: m.chunk_index,
          chunk_text: m.chunk_text,
          score: m.similarity || m.score || 0,
        }));

        evidence_refs.push({
          trigger,
          refs,
        });

        // Add to sources for formatted context
        refs.forEach(ref => {
          allSources.push({
            title: `Research (${trigger})`,
            chunk: ref.chunk_text,
            similarity: ref.score,
          });
        });
      }
    } catch (err) {
      console.error(`Error processing trigger "${trigger}":`, err);
    }
  }

  // Deduplicate sources by chunk_text
  const uniqueSources = allSources.filter((source, index, self) => 
    index === self.findIndex(s => s.chunk === source.chunk)
  );

  // Format context for insight generation
  const formattedContext = evidence_refs.length > 0
    ? evidence_refs.map(te => 
        `[Trigger: ${te.trigger}]\n` + 
        te.refs.map((ref, i) => 
          `  ${i + 1}. (score: ${ref.score.toFixed(2)}) ${ref.chunk_text.slice(0, 300)}...`
        ).join('\n')
      ).join('\n\n---\n\n')
    : "No relevant research articles found in the knowledge base.";

  console.log(`Retrieved evidence for ${evidence_refs.length} triggers, ${uniqueSources.length} unique sources`);

  return { evidence_refs, sources: uniqueSources, formattedContext };
}

// Fallback search when RPC is not available
async function searchWithFallback(
  supabase: SupabaseClient,
  queryEmbedding: number[]
): Promise<EvidenceRef[]> {
  // Try the older match_article_embeddings RPC
  const { data, error } = await supabase.rpc('match_article_embeddings', {
    query_embedding: JSON.stringify(queryEmbedding),
    match_threshold: 0.5,
    match_count: 3,
  });

  if (!error && data && data.length > 0) {
    return data.map((m: any) => ({
      article_id: m.article_id || m.id,
      chunk_index: m.chunk_index || 0,
      chunk_text: m.chunk_text,
      score: m.similarity || 0,
    }));
  }

  // Last resort: fetch some chunks without vector search
  const { data: fallbackChunks } = await supabase
    .from("article_embeddings")
    .select("id, article_id, chunk_index, chunk_text")
    .limit(3);

  if (fallbackChunks) {
    return fallbackChunks.map((c: any) => ({
      article_id: c.article_id,
      chunk_index: c.chunk_index,
      chunk_text: c.chunk_text,
      score: 0.3, // Low score for non-vector matches
    }));
  }

  return [];
}

// ============================================================================
// Step 6: Generate Insight
// ============================================================================

async function generateInsight(
  openai: OpenAI,
  analysis: AnalysisResult,
  evidence: Evidence,
  child: { name: string; rolling_summary: string | null },
  meltdowns: Meltdown[]
): Promise<InsightDraft> {
  const prompt = `Generate personalized insights for ${child.name} based on the following analysis.

BEHAVIORAL ANALYSIS:
${JSON.stringify(analysis, null, 2)}

HISTORICAL CONTEXT:
${child.rolling_summary || "This is the first analysis for this child."}

RESEARCH EVIDENCE:
${evidence.formattedContext}

RECENT EVENT COUNT: ${meltdowns.length} meltdowns in the last 30 days

Generate a compassionate, actionable insight report that:
1. Summarizes the key patterns observed
2. Provides evidence-based recommendations (cite research when applicable)
3. Suggests practical strategies parents can implement
4. Acknowledges what's working well (if any positive patterns exist)
5. Offers hope and encouragement

Write in a warm, supportive tone. Avoid clinical jargon. Keep the total response under 400 words.

Format your response as a cohesive narrative, not bullet points.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { 
        role: "system", 
        content: "You are a supportive child behavior specialist helping parents understand and manage their child's meltdowns. Be warm, practical, and evidence-based." 
      },
      { role: "user", content: prompt }
    ],
    max_tokens: 600,
    temperature: 0.7,
  });

  const narrative = response.choices[0].message.content || "";

  return {
    narrative,
    recommendations: analysis.top_triggers.map(t => `Monitor and prepare for ${t.trigger} situations`),
    evidenceUsed: evidence.sources.map(s => s.title),
  };
}

// ============================================================================
// Step 7: Safety Check
// ============================================================================

async function applySafetyRules(
  openai: OpenAI,
  draft: InsightDraft,
  analysis: AnalysisResult
): Promise<SafetyResult> {
  // Check for risk indicators that need safeguarding
  const riskKeywords = [
    "self-harm", "self harm", "suicide", "hurt themselves", "hurting themselves",
    "danger", "emergency", "hospital", "injury", "injuries",
    "aggressive", "violence", "hitting", "biting", "choking",
    "extreme distress", "uncontrollable", "hours long",
  ];

  // Use safety_flags from analysis instead of riskIndicators
  const allText = [
    ...analysis.safety_flags,
    analysis.summary,
    draft.narrative,
  ].join(" ").toLowerCase();

  const flaggedRisks = riskKeywords.filter(kw => allText.includes(kw));
  const isUrgent = flaggedRisks.length > 0 || analysis.safety_flags.length > 0;

  let safeguardingNotes: string | null = null;

  if (isUrgent) {
    // Generate safeguarding message
    const allFlags = [...new Set([...flaggedRisks, ...analysis.safety_flags])];
    const safetyPrompt = `Based on the following risk indicators, generate a brief safeguarding notice for parents:

Risk indicators found: ${allFlags.join(", ")}

The notice should:
1. Acknowledge the concerning patterns
2. Recommend consulting a healthcare professional
3. Provide crisis resource information if relevant
4. Be supportive, not alarming

Keep it under 100 words.`;

    const safetyResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { 
          role: "system", 
          content: "You are a child safety specialist. Provide supportive, actionable safeguarding guidance." 
        },
        { role: "user", content: safetyPrompt }
      ],
      max_tokens: 200,
      temperature: 0.3,
    });

    safeguardingNotes = safetyResponse.choices[0].message.content || 
      "We've noticed some patterns that may benefit from professional guidance. Please consider consulting your child's healthcare provider or a behavioral specialist for personalized support.";
  }

  return {
    output: draft.narrative,
    isUrgent,
    safeguardingNotes,
  };
}

// ============================================================================
// Meltdown Embedding Generation
// ============================================================================

async function generateMeltdownEmbedding(
  supabase: SupabaseClient, 
  openai: OpenAI, 
  meltdownId: string
): Promise<void> {
  const { data: meltdown, error } = await supabase
    .from("meltdowns")
    .select("*")
    .eq("id", meltdownId)
    .single();

  if (error || !meltdown) {
    console.error("Meltdown not found:", meltdownId);
    return;
  }

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
    `Resolution Strategies: ${meltdown.resolution_strategies?.join(', ') || 'None'}`,
  ].join('\n');

  const embeddingResponse = await openai.embeddings.create({
    model: "text-embedding-ada-002",
    input: summaryText,
  });

  const embedding = embeddingResponse.data[0].embedding;

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
