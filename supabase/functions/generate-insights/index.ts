import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { child_id } = await req.json();
    console.log("Generating insights for child:", child_id);

    if (!child_id) {
      throw new Error("child_id is required");
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      console.warn("OPENAI_API_KEY not set, using placeholder");
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all meltdowns for this child
    const { data: meltdowns, error: fetchError } = await supabase
      .from("meltdowns")
      .select("*")
      .eq("child_id", child_id)
      .order("timestamp", { ascending: true });

    if (fetchError) {
      console.error("Error fetching meltdowns:", fetchError);
      throw fetchError;
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

    let insights = "";

    if (OPENAI_API_KEY && OPENAI_API_KEY !== "placeholder") {
      // Call ChatGPT API - using gpt-3.5-turbo for universal compatibility
      console.log(OPENAI_API_KEY);
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-5-mini",
          messages: [
            {
              role: "system",
              content:
                "You are a helpful assistant that analyzes meltdown data for children and provides insights to help parents and caregivers understand patterns and triggers.",
            },
            {
              role: "user",
              content: `Generate insights over this data:\n\n${meltdownsText}`,
            },
          ],
          temperature: 0.7,
          max_tokens: 500,
        }),
      });

      console.log(response);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("OpenAI API error:", response.status, errorText);
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      insights = data.choices[0].message.content;
      console.log("Generated insights successfully");
    } else {
      insights = `Insights generation is not configured yet. Please add your OpenAI API key to enable AI-powered insights.\n\nData summary: ${meltdowns?.length || 0} events recorded.`;
    }

    // Update the children table with the insights
    const { error: updateError } = await supabase.from("children").update({ insights }).eq("id", child_id);

    if (updateError) {
      console.error("Error updating insights:", updateError);
      throw updateError;
    }

    console.log("Insights updated successfully for child:", child_id);

    return new Response(JSON.stringify({ success: true, insights }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in generate-insights function:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
