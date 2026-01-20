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
  keyFindings: string[];
  patterns: {
    frequencyPattern: string;
    commonTriggers: string[];
    intensityTrend: string;
    timePatterns: string;
  };
  riskIndicators: string[];
  summary: string;
}

interface Evidence {
  sources: Array<{
    title: string;
    chunk: string;
    similarity: number;
  }>;
  formattedContext: string;
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
      const analysis = await analyzeMeltdowns(openai, meltdowns);
      console.log("Analysis complete:", analysis.keyFindings.length, "key findings");

      // Step 6: Retrieve RAG evidence based on analysis
      const evidence = await retrieveEvidence(supabase, openai, analysis.keyFindings);
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
// Step 4: Analyze Meltdowns
// ============================================================================

async function analyzeMeltdowns(
  openai: OpenAI, 
  meltdowns: Meltdown[]
): Promise<AnalysisResult> {
  const meltdownData = meltdowns.map((m, idx) => ({
    index: idx + 1,
    date: new Date(m.timestamp).toLocaleDateString(),
    dayOfWeek: new Date(m.timestamp).toLocaleDateString('en-US', { weekday: 'long' }),
    timeOfDay: new Date(m.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    intensity: m.meltdown_level,
    trigger: m.environment_trigger || 'Unknown',
    location: m.location || 'Unknown',
    noiseLevel: m.noise_level || 'Unknown',
    duration: m.duration || 'Unknown',
    precedingActivities: m.preceding_activities?.join(', ') || 'None',
    childState: m.child_state?.join(', ') || 'Unknown',
    description: m.description || 'No description',
    resolutionStrategies: m.resolution_strategies?.join(', ') || 'None',
  }));

  const prompt = `Analyze the following meltdown data for a child and extract patterns.

MELTDOWN DATA (${meltdowns.length} events in the last 30 days):
${JSON.stringify(meltdownData, null, 2)}

Provide your analysis as JSON with this exact structure:
{
  "keyFindings": ["finding 1", "finding 2", ...],
  "patterns": {
    "frequencyPattern": "description of frequency patterns",
    "commonTriggers": ["trigger1", "trigger2", ...],
    "intensityTrend": "description of intensity changes over time",
    "timePatterns": "description of time-of-day or day-of-week patterns"
  },
  "riskIndicators": ["any concerning patterns that may need attention"],
  "summary": "2-3 sentence overall summary"
}

Focus on:
1. Environmental triggers that appear frequently
2. Time patterns (morning vs evening, weekday vs weekend)
3. Intensity trends (getting better, worse, or stable)
4. Successful resolution strategies
5. Any concerning patterns that parents should know about

Return ONLY valid JSON, no additional text.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { 
        role: "system", 
        content: "You are a child behavior analyst. Analyze meltdown patterns and return structured JSON. Be factual and evidence-based." 
      },
      { role: "user", content: prompt }
    ],
    max_tokens: 1000,
    temperature: 0.3,
  });

  const content = response.choices[0].message.content || "{}";
  
  try {
    // Extract JSON from response (handle potential markdown code blocks)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }
    return JSON.parse(jsonMatch[0]) as AnalysisResult;
  } catch (e) {
    console.error("Failed to parse analysis JSON:", e);
    // Return default structure on parse failure
    return {
      keyFindings: ["Unable to extract detailed patterns"],
      patterns: {
        frequencyPattern: `${meltdowns.length} events in last 30 days`,
        commonTriggers: [...new Set(meltdowns.map(m => m.environment_trigger).filter(Boolean))] as string[],
        intensityTrend: "Analysis pending",
        timePatterns: "Analysis pending",
      },
      riskIndicators: [],
      summary: `${meltdowns.length} meltdown events recorded. Manual review recommended.`,
    };
  }
}

// ============================================================================
// Step 5: Retrieve Evidence (RAG)
// ============================================================================

async function retrieveEvidence(
  supabase: SupabaseClient, 
  openai: OpenAI, 
  keyFindings: string[]
): Promise<Evidence> {
  // Create query embedding from key findings
  const queryText = keyFindings.join(". ");
  
  const embeddingResponse = await openai.embeddings.create({
    model: "text-embedding-ada-002",
    input: queryText,
  });

  const queryEmbedding = embeddingResponse.data[0].embedding;

  // Try vector search via RPC first
  const { data: matches, error: rpcError } = await supabase.rpc('match_article_embeddings', {
    query_embedding: JSON.stringify(queryEmbedding),
    match_threshold: 0.65,
    match_count: 5,
  });

  let sources: Evidence["sources"] = [];

  if (!rpcError && matches && matches.length > 0) {
    sources = matches.map((m: any) => ({
      title: m.article_title || "Research Article",
      chunk: m.chunk_text,
      similarity: m.similarity,
    }));
  } else {
    // Fallback: fetch recent article chunks without vector search
    console.log("Vector search unavailable, using fallback");
    const { data: fallbackChunks } = await supabase
      .from("article_embeddings")
      .select(`
        chunk_text,
        scientific_articles (title)
      `)
      .limit(3);

    if (fallbackChunks) {
      sources = fallbackChunks.map((c: any) => ({
        title: c.scientific_articles?.title || "Research",
        chunk: c.chunk_text,
        similarity: 0.5,
      }));
    }
  }

  // Format context for insight generation
  const formattedContext = sources.length > 0
    ? sources.map((s, i) => 
        `[Source ${i + 1}: ${s.title}]\n${s.chunk}`
      ).join("\n\n---\n\n")
    : "No relevant research articles found in the knowledge base.";

  return { sources, formattedContext };
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
    recommendations: analysis.patterns.commonTriggers.map(t => `Monitor and prepare for ${t} situations`),
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

  const allText = [
    ...analysis.riskIndicators,
    analysis.summary,
    draft.narrative,
  ].join(" ").toLowerCase();

  const flaggedRisks = riskKeywords.filter(kw => allText.includes(kw));
  const isUrgent = flaggedRisks.length > 0 || analysis.riskIndicators.length > 0;

  let safeguardingNotes: string | null = null;

  if (isUrgent) {
    // Generate safeguarding message
    const safetyPrompt = `Based on the following risk indicators, generate a brief safeguarding notice for parents:

Risk indicators found: ${[...flaggedRisks, ...analysis.riskIndicators].join(", ")}

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
