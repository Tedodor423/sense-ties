import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
import { Loader2, Sparkles, RefreshCw } from 'lucide-react';
import { InsightJobStatus } from '@/components/InsightJobStatus';

interface TriggerData {
  trigger: string;
  count: number;
}

interface InsightJob {
  id: string;
  status: string;
  job_type: string;
  created_at: string;
}

interface AIInsightsSectionProps {
  childId: string;
  childName: string;
  updatedAt?: string | null;
}

export function AIInsightsSection({ childId, childName, updatedAt }: AIInsightsSectionProps) {
  const [insights, setInsights] = useState<string>('');
  const [rollingSummary, setRollingSummary] = useState<string>('');
  const [triggerData, setTriggerData] = useState<TriggerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingJobs, setPendingJobs] = useState<InsightJob[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (childId) {
      fetchInsightsAndTriggers(childId);
      fetchPendingJobs(childId);
    }
  }, [childId]);

  // Subscribe to realtime updates for insights
  useEffect(() => {
    if (!childId) return;

    const channel = supabase
      .channel(`insights-updates-${childId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'children',
          filter: `id=eq.${childId}`,
        },
        (payload) => {
          console.log('Received realtime update:', payload);
          const newData = payload.new as { insights?: string; rolling_summary?: string };
          setInsights(newData.insights || 'No insights available yet.');
          setRollingSummary(newData.rolling_summary || '');
          
          toast({
            title: 'Insights Updated',
            description: 'New AI insights are now available!',
          });
        }
      )
      .subscribe();

    // Also subscribe to job status changes
    const jobChannel = supabase
      .channel(`job-updates-${childId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'insight_jobs',
          filter: `child_id=eq.${childId}`,
        },
        () => {
          fetchPendingJobs(childId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(jobChannel);
    };
  }, [childId, toast]);

  const fetchPendingJobs = async (id: string) => {
    try {
      const { data } = await supabase
        .from('insight_jobs')
        .select('*')
        .eq('child_id', id)
        .in('status', ['pending', 'processing'])
        .order('created_at', { ascending: false });

      setPendingJobs(data || []);
      setIsProcessing((data || []).length > 0);
    } catch (error) {
      console.error('Error fetching pending jobs:', error);
    }
  };

  const fetchInsightsAndTriggers = async (id: string) => {
    try {
      setLoading(true);
      
      // Fetch insights and rolling summary
      const { data: childData, error: childError } = await supabase
        .from('children')
        .select('insights, rolling_summary')
        .eq('id', id)
        .single();

      if (childError) throw childError;
      setInsights(childData?.insights || 'No insights available yet. Log more meltdowns to generate insights.');
      setRollingSummary(childData?.rolling_summary || '');

      // Fetch meltdowns for trigger analysis
      const { data: meltdowns, error: meltdownError } = await supabase
        .from('meltdowns')
        .select('environment_trigger')
        .eq('child_id', id);

      if (meltdownError) throw meltdownError;

      // Aggregate trigger data
      const triggerCounts: Record<string, number> = {};
      meltdowns?.forEach((m) => {
        const trigger = m.environment_trigger || 'Not specified';
        triggerCounts[trigger] = (triggerCounts[trigger] || 0) + 1;
      });

      const chartData = Object.entries(triggerCounts)
        .map(([trigger, count]) => ({ trigger, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      setTriggerData(chartData);
    } catch (error) {
      console.error('Error fetching insights:', error);
      toast({
        title: 'Error',
        description: 'Failed to load insights',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const triggerJobProcessing = async () => {
    try {
      const { error } = await supabase.functions.invoke('process-insight-job');
      if (error) throw error;
      toast({
        title: 'Processing Started',
        description: 'Background processing has been triggered.',
      });
      fetchPendingJobs(childId);
    } catch (error) {
      console.error('Error triggering processing:', error);
      toast({
        title: 'Error',
        description: 'Failed to trigger processing',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Processing Badge */}
      {isProcessing && (
        <Badge variant="secondary" className="flex items-center gap-2 w-fit">
          <RefreshCw className="h-3 w-3 animate-spin" />
          Processing updates...
        </Badge>
      )}

      {/* AI Insights Card */}
      <Card className="rounded-2xl">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle>AI Insights for {childName}</CardTitle>
          </div>
          {updatedAt && (
            <p className="text-xs text-muted-foreground">
              Last updated: {new Date(updatedAt).toLocaleString()}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Job Status Indicator */}
          <InsightJobStatus childId={childId} childName={childName} />
          <p className="text-foreground whitespace-pre-wrap">{insights}</p>
        </CardContent>
      </Card>

      {/* Rolling Summary Card */}
      {rollingSummary && (
        <Card className="rounded-2xl border-primary/20">
          <CardHeader>
            <CardTitle className="text-lg">Pattern Summary</CardTitle>
            <p className="text-xs text-muted-foreground">
              AI-generated summary of behavioral patterns over time
            </p>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {rollingSummary}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Trigger Chart */}
      {triggerData.length > 0 && (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Most Common Triggers</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                count: {
                  label: 'Count',
                  color: 'hsl(var(--primary))',
                },
              }}
              className="h-[300px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={triggerData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="trigger"
                    stroke="hsl(var(--foreground))"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="hsl(var(--foreground))"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* Pending Jobs Info */}
      {pendingJobs.length > 0 && (
        <Card className="rounded-2xl border-yellow-500/20 bg-yellow-50/5">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin text-yellow-600" />
                <span className="text-sm text-muted-foreground">
                  {pendingJobs.length} update{pendingJobs.length > 1 ? 's' : ''} processing...
                </span>
              </div>
              <button
                onClick={triggerJobProcessing}
                className="text-xs text-primary hover:underline"
              >
                Refresh now
              </button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
