-- Create a table to store admin-configurable settings like AI prompts
CREATE TABLE public.app_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  value text NOT NULL,
  description text,
  updated_at timestamp with time zone DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can manage settings
CREATE POLICY "Admins can manage settings"
ON public.app_settings
FOR ALL
USING (has_role(auth.uid(), 'Admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'Admin'::app_role));

-- Authenticated users can read settings (needed for edge functions context)
CREATE POLICY "Authenticated users can view settings"
ON public.app_settings
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Insert default AI prompt
INSERT INTO public.app_settings (key, value, description) VALUES (
  'insight_prompt',
  'You are a child development specialist analyzing meltdown patterns. Based on the child''s meltdown history and scientific research, provide:

1. **Pattern Summary**: Key patterns observed in triggers, timing, and environmental factors
2. **Evidence-Based Insights**: Connect observations to relevant research findings
3. **Actionable Strategies**: Specific, practical recommendations for caregivers

Be compassionate, specific, and focus on actionable advice. Avoid medical diagnoses.',
  'System prompt used when generating AI insights for meltdown analysis'
);