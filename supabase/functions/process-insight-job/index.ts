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

// Full child object for generateInsightForChild
interface ChildForInsight {
  id: string;
  name: string;
  month_of_birth: number | null;
  year_of_birth: number | null;
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
  sources: Array<{
    title: string;
    chunk: string;
    similarity: number;
  }>;
}

// New structured insight output from generateInsightForChild
interface GeneratedInsight {
  child_id: string;
  child_name: string;
  child_age_years: number;
  narrative_markdown: string;
  evidence: Array<{
    article_id: string;
    chunk_index: number;
    excerpt: string;
  }>;
  recommendations: string[];
  escalation_triggers: string[];
  safety: {
    flags: string[];
    escalation_text: string;
  };
  meta: {
    generated_at: string;
    model: string;
  };
}

interface SafetyResult {
  output: string;
  isUrgent: boolean;
  safeguardingNotes: string | null;
}

// New SafetyCheck result interface
interface SafetyCheckResult {
  output_text: string;
  flags: string[];
  escalation_text: string;
}

// LLM Safety Review result interface
interface SafetyReviewResult {
  ok: boolean;
  issues?: string[];
  edits?: string;
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

      // Step 7: Build child object for insight generation
      const child: ChildForInsight = {
        id: childContext.child_id,
        name: childContext.child_name,
        month_of_birth: childContext.birth_month,
        year_of_birth: childContext.birth_year,
      };

      // Step 8: Generate structured insight using new function
      const generatedInsight = await generateInsightForChild(openai, analysis, evidence, child);
      console.log("Generated structured insight for child:", child.name);

      // Step 9: Run LLM safety review on draft insight
      const reviewedNarrative = await safetyReview(openai, generatedInsight);
      console.log("LLM safety review complete");

      // Step 10: Run deterministic safety check on analysis + reviewed insight
      const safetyCheckResult = safetyCheck(analysis, meltdowns, reviewedNarrative);
      console.log("Deterministic safety check complete, flags:", safetyCheckResult.flags);

      // Step 11: Merge safety check results with generated insight
      const finalNarrative = safetyCheckResult.output_text;
      const allFlags = [...new Set([...generatedInsight.safety.flags, ...safetyCheckResult.flags])];
      const escalationText = safetyCheckResult.escalation_text || generatedInsight.safety.escalation_text;

      // Step 12: Build extended insight data for history
      const extendedInsight = {
        safeResult: {
          output: finalNarrative,
          isUrgent: allFlags.length > 0,
          safeguardingNotes: escalationText || null,
        },
        narrative_markdown: finalNarrative,
        evidence: generatedInsight.evidence,
        recommendations: generatedInsight.recommendations,
        escalation_triggers: generatedInsight.escalation_triggers,
        safety_flags: allFlags,
        model: generatedInsight.meta?.model || "GPT-4o-mini",
      };

      // Step 13: Save insight to children table AND history
      await saveInsightWithHistory(supabase, job.child_id, job.id, extendedInsight);

      // Step 14: Mark job completed
      await updateJob(supabase, job.id, { 
        status: "completed", 
        completed_at: new Date().toISOString() 
      });

      console.log(`Job ${job.id} completed successfully`);

      return new Response(JSON.stringify({ 
        success: true, 
        job_id: job.id,
        child_id: job.child_id,
        is_urgent: extendedInsight.safeResult.isUrgent,
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

// Helper to calculate age from birth month/year (for analysis context)
function calculateAge(birthMonth: number | null, birthYear: number | null): number | null {
  if (!birthMonth || !birthYear) return null;
  return computeAgeYears(birthMonth, birthYear);
}

// Compute child age in years (rounded down) - used for LLM prompts
function computeAgeYears(month: number, year: number, now: Date = new Date()): number {
  const birthDate = new Date(year, month - 1, 1); // month is 1-12
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const m = now.getUTCMonth() - birthDate.getUTCMonth();
  if (m < 0) age--;
  return Math.max(0, age);
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

interface ExtendedInsight {
  safeResult: SafetyResult;
  narrative_markdown: string;
  evidence: Array<{ article_id: string; chunk_index: number; excerpt: string }>;
  recommendations: string[];
  escalation_triggers: string[];
  safety_flags: string[];
  model: string;
}

async function saveInsightWithHistory(
  supabase: SupabaseClient, 
  childId: string,
  jobId: string,
  insight: ExtendedInsight
): Promise<void> {
  const { safeResult } = insight;
  
  // Build final insight text with urgency marker if needed
  let finalInsight = safeResult.output;
  if (safeResult.isUrgent && safeResult.safeguardingNotes) {
    finalInsight = `⚠️ URGENT ATTENTION REQUIRED\n\n${safeResult.safeguardingNotes}\n\n---\n\n${safeResult.output}`;
  }

  // Update children.insights with latest
  const { error: childError } = await supabase
    .from("children")
    .update({ 
      insights: finalInsight,
      updated_at: new Date().toISOString(),
    })
    .eq("id", childId);

  if (childError) {
    console.error("Error saving insight to children:", childError);
    throw new Error(`Failed to save insight: ${childError.message}`);
  }

  // Also save to history table
  const { error: historyError } = await supabase
    .from("child_insights_history")
    .insert({
      child_id: childId,
      job_id: jobId,
      insight_text: finalInsight,
      narrative_markdown: insight.narrative_markdown,
      evidence: insight.evidence,
      recommendations: insight.recommendations,
      escalation_triggers: insight.escalation_triggers,
      safety_flags: insight.safety_flags,
      is_urgent: safeResult.isUrgent,
      model: insight.model,
      generated_at: new Date().toISOString(),
    });

  if (historyError) {
    // Log but don't fail - history is secondary
    console.error("Error saving insight to history:", historyError);
  } else {
    console.log("Insight saved to history for child:", childId);
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
// Safety Check - Deterministic safety validation
// ============================================================================

const URGENT_SAFEGUARDING_TEXT = `URGENT: We've detected events that may indicate risk. Please contact the child's healthcare provider or emergency services if the child is in immediate danger. For school settings, escalate to your safeguarding lead. This system is NOT a diagnostic tool.`;

// Patterns for concerning keywords in descriptions
const CONCERNING_KEYWORDS = [
  /\bcut\b/i,
  /\bhurt\s*(them)?sel(f|ves)\b/i,
  /\bhit\s*head\b/i,
  /\bran\s*away\b/i,
  /\beloped?\b/i,
  /\bself[- ]?harm/i,
  /\bself[- ]?injur/i,
  /\bsuicid/i,
  /\bbite\s*(them)?sel(f|ves)\b/i,
  /\bbang(ing|ed)?\s*head\b/i,
];

// Patterns for diagnostic language to redact
const DIAGNOSTIC_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { 
    pattern: /\b(your child|the child|this child)\s+(has|is diagnosed with|suffers from)\s+([a-zA-Z\s-]+)(disorder|syndrome|condition)?\b/gi,
    replacement: "this pattern may be consistent with $3; consider discussing with a clinician"
  },
  {
    pattern: /\bthis (is|indicates|shows|confirms|proves)\s+(that\s+)?(your child|the child)\s+(has|is)\s+([a-zA-Z\s-]+)\b/gi,
    replacement: "this may be consistent with $5; consider discussing with a clinician"
  },
  {
    pattern: /\bdefinitely\s+(has|is|shows?)\b/gi,
    replacement: "may be consistent with"
  },
  {
    pattern: /\bdiagnos(is|ed|tic)\b/gi,
    replacement: "pattern assessment"
  },
  {
    pattern: /\b(clear(ly)?|obvious(ly)?|certain(ly)?)\s+(indicat(es?|ing)|shows?|has)\b/gi,
    replacement: "may indicate"
  },
  {
    pattern: /\byou should (know|understand|accept)\s+that\s+(your child|the child)\s+(has|is)\b/gi,
    replacement: "you may want to discuss with a clinician whether the child may have"
  },
];

/**
 * Deterministic safety check function
 * Runs AFTER LLM generation to flag urgent issues and redact diagnostic language
 */
function safetyCheck(
  analysis: AnalysisResult,
  meltdowns: Meltdown[],
  draftText: string
): SafetyCheckResult {
  const flags: string[] = [];
  
  // ========== Check 1: Duration thresholds ==========
  const durations = meltdowns
    .map(m => parseDurationToSeconds(m.duration))
    .filter((d): d is number => d !== null);
  
  // Check if any meltdown > 30 minutes (1800 seconds)
  const maxDuration = durations.length > 0 ? Math.max(...durations) : 0;
  if (maxDuration > 1800) {
    flags.push("long_duration");
    console.log(`Safety flag: long_duration (max: ${maxDuration}s)`);
  }
  
  // Check if median duration > 20 minutes (1200 seconds)
  if (durations.length > 0) {
    const sorted = [...durations].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const medianDuration = sorted.length % 2 !== 0 
      ? sorted[mid] 
      : (sorted[mid - 1] + sorted[mid]) / 2;
    
    if (medianDuration > 1200) {
      flags.push("median_duration_high");
      console.log(`Safety flag: median_duration_high (median: ${medianDuration}s)`);
    }
  }
  
  // ========== Check 2: Concerning keywords in descriptions ==========
  for (const meltdown of meltdowns) {
    const textToCheck = [
      meltdown.description,
      meltdown.environment_description,
    ].filter(Boolean).join(" ").toLowerCase();
    
    for (const pattern of CONCERNING_KEYWORDS) {
      if (pattern.test(textToCheck)) {
        const flagName = pattern.source.replace(/[\\^$.*+?()[\]{}|]/g, '').slice(0, 20);
        if (!flags.includes(`concerning_text_${flagName}`)) {
          flags.push(`concerning_text_${flagName}`);
          console.log(`Safety flag: concerning text found matching pattern`);
        }
      }
    }
  }
  
  // ========== Check 3: Resolution effectiveness ==========
  // Flag if no successful strategies across many events
  if (analysis.resolution_effectiveness && analysis.resolution_effectiveness.length > 0) {
    const totalHelped = analysis.resolution_effectiveness.reduce((sum, r) => sum + r.helped_count, 0);
    const totalEvents = meltdowns.length;
    
    // Flag if we have 5+ events and no strategies helped
    if (totalEvents >= 5 && totalHelped === 0) {
      flags.push("no_effective_strategies");
      console.log(`Safety flag: no_effective_strategies (${totalEvents} events, 0 helped)`);
    }
    
    // Also flag if common strategies never help
    for (const strategy of analysis.resolution_effectiveness) {
      if (strategy.helped_count === 0 && strategy.not_helped_count >= 3) {
        if (!flags.includes("strategy_ineffective")) {
          flags.push("strategy_ineffective");
          console.log(`Safety flag: strategy_ineffective (${strategy.strategy} never helped)`);
        }
      }
    }
  }
  
  // ========== Check 4: Include safety flags from analysis ==========
  for (const flag of analysis.safety_flags) {
    if (!flags.includes(flag)) {
      flags.push(flag);
    }
  }
  
  // ========== Redact diagnostic language ==========
  let outputText = draftText;
  for (const { pattern, replacement } of DIAGNOSTIC_PATTERNS) {
    outputText = outputText.replace(pattern, replacement);
  }
  
  // ========== Determine if urgent and build escalation text ==========
  const isUrgent = flags.length > 0;
  let escalationText = "";
  
  if (isUrgent) {
    escalationText = URGENT_SAFEGUARDING_TEXT;
  }
  
  return {
    output_text: outputText,
    flags,
    escalation_text: escalationText,
  };
}

// ============================================================================
// LLM Safety Review - Second pass review for diagnostic claims
// ============================================================================

const SYSTEM_PROMPT_SAFETY_REVIEW = `You are a safety reviewer. Your job: scan the draft JSON and return either {"ok":true} or {"ok":false, "issues":[...], "edits":"<new narrative markdown>"} — only valid JSON.`;

/**
 * LLM-based safety review to catch diagnostic claims and unsafe recommendations
 * Runs after generateInsightForChild but before the deterministic safetyCheck
 */
async function safetyReview(
  openai: OpenAI,
  draft: GeneratedInsight
): Promise<string> {
  const draftJson = JSON.stringify(draft, null, 2);
  
  const userPrompt = `DRAFT_JSON: ${draftJson}

RULES:
- If draft contains diagnostic claims -> ok:false, issues:[...], provide edits replacing diagnostic claim with hedged language.
- If draft suggests ignoring urgent actions when safety flags present -> ok:false.
- If ok:true, just return {"ok":true}
- If ok:false, return {"ok":false, "issues":["issue1", "issue2"], "edits":"<corrected narrative_markdown with hedged language>"}

Return ONLY valid JSON. No commentary.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT_SAFETY_REVIEW },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 2000,
      temperature: 0.1, // Low temperature for consistent safety review
    });

    const content = response.choices[0].message.content || '{"ok":true}';
    
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log("Safety review: No JSON found, using original narrative");
      return draft.narrative_markdown;
    }
    
    const reviewResult = JSON.parse(jsonMatch[0]) as SafetyReviewResult;
    
    if (reviewResult.ok) {
      console.log("Safety review: OK, no issues found");
      return draft.narrative_markdown;
    }
    
    // ok: false - apply edits if provided
    console.log("Safety review: Issues found:", reviewResult.issues);
    
    if (reviewResult.edits && reviewResult.edits.trim()) {
      console.log("Safety review: Applying LLM edits");
      return reviewResult.edits;
    }
    
    // No edits provided, return original
    console.log("Safety review: No edits provided, using original");
    return draft.narrative_markdown;
    
  } catch (error) {
    console.error("Safety review failed:", error);
    // On error, return original - the deterministic safetyCheck will still run
    return draft.narrative_markdown;
  }
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
// Step 7: Generate Insight for Child (new structured format)
// ============================================================================

const SYSTEM_PROMPT_INSIGHT = `You are a careful, conservative clinical-style writer producing a short, child-specific insight. ALWAYS:
- Use hedged language ("may", "is associated with", "consider") and avoid diagnostic claims.
- Only quote or summarize the evidence supplied in the "EVIDENCE" input. Do not invent facts.
- Include these sections (as Markdown inside the narrative string): 
  1) "What we observed" (3–5 concise bullets),
  2) "Why this might be happening" (1–3 bullets),
  3) "What to try next" (3 recommended, practical actions),
  4) "When to escalate" (clear, actionable triggers).
- If any safety flags exist, prepend the standard URGENT safeguarding paragraph (see safety rules).
- Output only valid JSON; do not include any commentary outside the JSON.
- JSON must follow the schema described in the user prompt.`;

async function generateInsightForChild(
  openai: OpenAI,
  analysis: AnalysisResult,
  evidence: Evidence,
  child: ChildForInsight
): Promise<GeneratedInsight> {
  // Compute child age in years
  const childAgeYears = (child.month_of_birth && child.year_of_birth)
    ? computeAgeYears(child.month_of_birth, child.year_of_birth)
    : 0;

  const userPrompt = `INPUT:
- CHILD: { "id": "${child.id}", "name": "${child.name}", "month_of_birth": ${child.month_of_birth || 'null'}, "year_of_birth": ${child.year_of_birth || 'null'}, "age_years": ${childAgeYears} }
- ANALYSIS_JSON: ${JSON.stringify(analysis)}
- EVIDENCE_REFS: ${JSON.stringify(evidence.evidence_refs)}
- SAFETY_FLAGS: ${JSON.stringify(analysis.safety_flags)}

TASK:
Produce a single JSON object (valid JSON only) with these keys exactly:

{
  "child_id": "<uuid>",
  "child_name": "<full name>",
  "child_age_years": <integer>,
  "narrative_markdown": "<markdown string with the sections: What we observed; Why this might be happening; What to try next; When to escalate>",
  "evidence": [
    { "article_id": "<uuid>", "chunk_index": <int>, "excerpt": "<up to 50 words excerpt>"}
  ],
  "recommendations": [ "<short action 1>", "<short action 2>", "<short action 3>" ],
  "escalation_triggers": [ "<condition 1>", "<condition 2>" ],
  "safety": {
     "flags": [ "long_duration", "elopement", ... ],
     "escalation_text": "<if flagged, include the URGENT paragraph here; otherwise empty string>"
  },
  "meta": { "generated_at": "<ISO 8601 UTC timestamp>", "model": "GPT-4o-mini" }
}

REQUIREMENTS:
1. Use only the ANALYSIS_JSON numbers and the supplied EVIDENCE_REFS — do not hallucinate additional data.
2. Narrative must be child-focused and mention the child's age where helpful ("The child is X years old").
3. If SAFETY_FLAGS is non-empty, include the URGENT safeguarding paragraph exactly as specified in the app settings and list clear escalation_triggers.
4. Evidence entries must reference only returned article chunk(s) and include short excerpts (no more than ~50 words). Do not invent article titles — provide article_id + chunk_index + excerpt.
5. Output MUST be valid JSON. If you cannot produce any field, set it to null or an empty array as appropriate.`;

  // Retry logic: up to 2 attempts
  let lastError: string = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const messages: Array<{ role: "system" | "user"; content: string }> = [
        { role: "system", content: SYSTEM_PROMPT_INSIGHT },
        { role: "user", content: attempt > 1 
          ? userPrompt + `\n\nOutput valid JSON only — fields missing or invalid: ${lastError}`
          : userPrompt 
        },
      ];

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        max_tokens: 2000,
        temperature: 0.3,
      });

      const content = response.choices[0].message.content || "{}";
      
      // Extract JSON from response (handle potential markdown code blocks)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        lastError = "No JSON object found in response";
        throw new Error(lastError);
      }
      
      const parsed = JSON.parse(jsonMatch[0]) as GeneratedInsight;
      
      // Validate required fields
      const missingFields: string[] = [];
      if (!parsed.child_id) missingFields.push("child_id");
      if (!parsed.child_name) missingFields.push("child_name");
      if (parsed.child_age_years === undefined) missingFields.push("child_age_years");
      if (!parsed.narrative_markdown) missingFields.push("narrative_markdown");
      if (!Array.isArray(parsed.recommendations)) missingFields.push("recommendations");
      if (!parsed.safety) missingFields.push("safety");
      if (!parsed.meta) missingFields.push("meta");
      
      if (missingFields.length > 0) {
        lastError = missingFields.join(", ");
        throw new Error(`Missing fields: ${lastError}`);
      }
      
      // Ensure meta has generated_at
      if (!parsed.meta.generated_at) {
        parsed.meta.generated_at = new Date().toISOString();
      }
      if (!parsed.meta.model) {
        parsed.meta.model = "GPT-4o-mini";
      }
      
      console.log("Successfully generated structured insight on attempt", attempt);
      return parsed;
      
    } catch (e) {
      console.error(`Attempt ${attempt} failed to generate insight:`, e);
      if (attempt === 2) {
        // All retries failed - return fallback structure
        console.error("All insight generation attempts failed, using fallback");
        return createFallbackInsight(child, childAgeYears, analysis, evidence);
      }
    }
  }
  
  // TypeScript requires a return here even though we always return above
  return createFallbackInsight(child, childAgeYears, analysis, evidence);
}

// Create a fallback insight when LLM fails
function createFallbackInsight(
  child: ChildForInsight,
  childAgeYears: number,
  analysis: AnalysisResult,
  evidence: Evidence
): GeneratedInsight {
  const narrativeMarkdown = `## What we observed

${analysis.top_triggers.slice(0, 5).map(t => `- ${t.trigger} (${t.count} occurrences)`).join('\n') || '- Data analysis in progress'}

## Why this might be happening

- Multiple factors may be contributing to these patterns
- Further observation is recommended

## What to try next

- Monitor for identified triggers
- Try resolution strategies that have worked before
- Consider consulting with a specialist

## When to escalate

- If meltdowns increase in frequency or intensity
- If new concerning behaviors emerge`;

  return {
    child_id: child.id,
    child_name: child.name,
    child_age_years: childAgeYears,
    narrative_markdown: narrativeMarkdown,
    evidence: evidence.evidence_refs.slice(0, 3).flatMap(te => 
      te.refs.slice(0, 1).map(ref => ({
        article_id: ref.article_id,
        chunk_index: ref.chunk_index,
        excerpt: ref.chunk_text.slice(0, 200),
      }))
    ),
    recommendations: analysis.top_triggers.slice(0, 3).map(t => `Monitor and prepare for ${t.trigger} situations`),
    escalation_triggers: ["Significant increase in frequency", "Safety concerns emerge"],
    safety: {
      flags: analysis.safety_flags,
      escalation_text: analysis.safety_flags.length > 0 
        ? "⚠️ URGENT: Safety concerns have been identified. Please consult with a healthcare professional or behavioral specialist as soon as possible."
        : "",
    },
    meta: {
      generated_at: new Date().toISOString(),
      model: "GPT-4o-mini (fallback)",
    },
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
