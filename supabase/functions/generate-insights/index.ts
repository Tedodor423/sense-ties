import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";
import OpenAI from "https://deno.land/x/openai@v4.20.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get and validate authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("Missing authorization header");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { child_id } = await req.json();
    console.log("Generating insights for child:", child_id);

    // Validate child_id format
    if (!child_id || typeof child_id !== "string") {
      console.error("child_id is required");
      return new Response(JSON.stringify({ error: "child_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!UUID_REGEX.test(child_id)) {
      console.error("Invalid child_id format:", child_id);
      return new Response(JSON.stringify({ error: "Invalid child_id format" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Initialize Supabase client with user's auth token to respect RLS
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify user has access to this child (RLS will enforce this)
    const { data: childAccess, error: accessError } = await userClient
      .from("children")
      .select("id, updated_at")
      .eq("id", child_id)
      .single();

    if (accessError || !childAccess) {
      console.error("Child not found or access denied:", accessError?.message);
      return new Response(JSON.stringify({ error: "Child not found or access denied" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limiting: check if insights were generated in the last 5 minutes
    if (childAccess.updated_at) {
      const lastUpdate = new Date(childAccess.updated_at);
      const minutesSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60);
      if (minutesSinceUpdate < 5) {
        console.log("Rate limited: insights generated recently");
        return new Response(JSON.stringify({ error: "Please wait at least 5 minutes between insight generations" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Now use service role for the actual operations (after access check)
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch meltdowns for this child (limit to recent 100 for performance)
    const { data: meltdowns, error: fetchError } = await supabase
      .from("meltdowns")
      .select("*")
      .eq("child_id", child_id)
      .order("timestamp", { ascending: false })
      .limit(100);

    if (fetchError) {
      console.error("Error fetching meltdowns:", fetchError);
      return new Response(JSON.stringify({ error: "Failed to fetch data" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Found ${meltdowns?.length || 0} meltdowns for child`);

    // Format meltdowns data for ChatGPT
    const meltdownsText =
      meltdowns
        ?.map(
          (m, idx) =>
            `Event ${idx + 1}:
- Date: ${new Date(m.timestamp).toLocaleDateString()}
- Intensity: ${m.meltdown_level}/5
- Environment: ${m.environment_trigger || "Not specified"}
- Noise Level: ${m.noise_level || "Not specified"}
- Description: ${m.description || "No description"}
- Environment Details: ${m.environment_description || "None"}`,
        )
        .join("\n\n") || "No meltdown data available yet.";

    let insights = "-blank-";

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (OPENAI_API_KEY) {
      try {
        // Initialize OpenAI client
        const client = new OpenAI({
          apiKey: OPENAI_API_KEY,
        });

        // Call OpenAI API using the SDK with correct model name
        const response = await client.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "You are a helpful assistant that analyzes meltdown data for children and provides insights to help parents and caregivers understand patterns and triggers.",
            },
            {
              role: "user",
              content: `Generate insights over this data in a simple text format, maximum 2 paragraphs. It should be very readable by an amateur audience:\n\n${meltdownsText}`,
            },
          ],
        });

        insights =
          response.choices[0].message.content || "No insights generated";
        console.log("Generated insights successfully");
      } catch (error) {
        console.error("OpenAI API error:", error);
        insights = `Unable to generate AI insights at this time. Data summary: ${meltdowns?.length || 0} events recorded.`;
      }
    } else {
      console.warn("OPENAI_API_KEY not set");
      insights = `Insights generation is not configured yet. Please add your OpenAI API key to enable AI-powered insights.\n\nData summary: ${meltdowns?.length || 0} events recorded.`;
    }

    // Update the children table with the insights
    const { error: updateError } = await supabase.from("children").update({ insights }).eq("id", child_id);

    if (updateError) {
      console.error("Error updating insights:", updateError);
      return new Response(JSON.stringify({ error: "Failed to save insights" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Insights updated successfully for child:", child_id);

    return new Response(JSON.stringify({ success: true, insights }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in generate-insights function:", error);
    return new Response(JSON.stringify({ error: "Failed to generate insights" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
