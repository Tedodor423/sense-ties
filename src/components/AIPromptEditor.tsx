import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Save, RotateCcw } from 'lucide-react';

const DEFAULT_PROMPT = `You are a child development specialist analyzing meltdown patterns. Based on the child's meltdown history and scientific research, provide:

1. **Pattern Summary**: Key patterns observed in triggers, timing, and environmental factors
2. **Evidence-Based Insights**: Connect observations to relevant research findings
3. **Actionable Strategies**: Specific, practical recommendations for caregivers

Be compassionate, specific, and focus on actionable advice. Avoid medical diagnoses.`;

export function AIPromptEditor() {
  const [prompt, setPrompt] = useState('');
  const [originalPrompt, setOriginalPrompt] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchPrompt();
  }, []);

  const fetchPrompt = async () => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'insight_prompt')
        .single();

      if (error) throw error;
      
      const promptValue = data?.value || DEFAULT_PROMPT;
      setPrompt(promptValue);
      setOriginalPrompt(promptValue);
    } catch (error) {
      console.error('Error fetching prompt:', error);
      setPrompt(DEFAULT_PROMPT);
      setOriginalPrompt(DEFAULT_PROMPT);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('app_settings')
        .update({ 
          value: prompt.trim(),
          updated_at: new Date().toISOString(),
          updated_by: user?.id 
        })
        .eq('key', 'insight_prompt');

      if (error) throw error;

      setOriginalPrompt(prompt.trim());
      toast.success('AI prompt updated successfully');
    } catch (error: any) {
      console.error('Error saving prompt:', error);
      toast.error(error.message || 'Failed to save prompt');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setPrompt(DEFAULT_PROMPT);
  };

  const hasChanges = prompt.trim() !== originalPrompt;

  if (loading) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>AI Insight Prompt</CardTitle>
        <p className="text-sm text-muted-foreground">
          Customize the system prompt used when generating insights from meltdown data
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>System Prompt</Label>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Enter the AI system prompt..."
            className="min-h-[200px] rounded-xl font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            This prompt instructs the AI how to analyze meltdown patterns and generate insights.
            The AI will also have access to the child's meltdown history and relevant scientific articles.
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="flex-1 rounded-xl"
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={saving}
            className="rounded-xl"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset to Default
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
