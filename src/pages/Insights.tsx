import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
import { Loader2, Sparkles, RefreshCw } from 'lucide-react';
import { formatAge } from '@/lib/validation';
import { InsightJobStatus } from '@/components/InsightJobStatus';
import { useChildTheme } from '@/hooks/useChildTheme';

interface Child {
  id: string;
  name: string;
  birth_month: number | null;
  birth_year: number | null;
  insights: string | null;
  rolling_summary: string | null;
  updated_at: string | null;
}

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

export default function Insights() {
  const [searchParams] = useSearchParams();
  const childIdFromUrl = searchParams.get('childId');
  
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>('');
  const [insights, setInsights] = useState<string>('');
  const [rollingSummary, setRollingSummary] = useState<string>('');
  const [triggerData, setTriggerData] = useState<TriggerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingJobs, setPendingJobs] = useState<InsightJob[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchChildren();
  }, []);

  useEffect(() => {
    if (selectedChildId) {
      fetchInsightsAndTriggers(selectedChildId);
      fetchPendingJobs(selectedChildId);
    }
  }, [selectedChildId]);

  // Subscribe to realtime updates for insights
  useEffect(() => {
    if (!selectedChildId) return;

    const channel = supabase
      .channel('insights-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'children',
          filter: `id=eq.${selectedChildId}`,
        },
        (payload) => {
          console.log('Received realtime update:', payload);
          const newData = payload.new as Child;
          setInsights(newData.insights || 'No insights available yet.');
          setRollingSummary(newData.rolling_summary || '');
          
          // Update the children list too
          setChildren(prev => prev.map(c => 
            c.id === selectedChildId ? { ...c, ...newData } : c
          ));
          
          toast({
            title: 'Insights Updated',
            description: 'New AI insights are now available!',
          });
        }
      )
      .subscribe();

    // Also subscribe to job status changes
    const jobChannel = supabase
      .channel('job-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'insight_jobs',
          filter: `child_id=eq.${selectedChildId}`,
        },
        () => {
          fetchPendingJobs(selectedChildId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(jobChannel);
    };
  }, [selectedChildId, toast]);

  const fetchChildren = async () => {
    try {
      const { data, error } = await supabase
        .from('children')
        .select('id, name, birth_month, birth_year, insights, rolling_summary, updated_at')
        .order('name');

      if (error) throw error;

      setChildren(data || []);
      if (data && data.length > 0) {
        const validChildId = childIdFromUrl && data.some(c => c.id === childIdFromUrl) 
          ? childIdFromUrl 
          : data[0].id;
        setSelectedChildId(validChildId);
      }
    } catch (error) {
      console.error('Error fetching children:', error);
      toast({
        title: 'Error',
        description: 'Failed to load children',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingJobs = async (childId: string) => {
    try {
      const { data } = await supabase
        .from('insight_jobs')
        .select('*')
        .eq('child_id', childId)
        .in('status', ['pending', 'processing'])
        .order('created_at', { ascending: false });

      setPendingJobs(data || []);
      setIsProcessing((data || []).length > 0);
    } catch (error) {
      console.error('Error fetching pending jobs:', error);
    }
  };

  const fetchInsightsAndTriggers = async (childId: string) => {
    try {
      // Fetch insights and rolling summary
      const { data: childData, error: childError } = await supabase
        .from('children')
        .select('insights, rolling_summary')
        .eq('id', childId)
        .single();

      if (childError) throw childError;
      setInsights(childData?.insights || 'No insights available yet. Log more meltdowns to generate insights.');
      setRollingSummary(childData?.rolling_summary || '');

      // Fetch meltdowns for trigger analysis
      const { data: meltdowns, error: meltdownError } = await supabase
        .from('meltdowns')
        .select('environment_trigger')
        .eq('child_id', childId);

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
      fetchPendingJobs(selectedChildId);
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
      <ProtectedRoute>
        <Layout>
          <div className="container mx-auto px-4 py-8 flex items-center justify-center min-h-[400px]">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </Layout>
      </ProtectedRoute>
    );
  }

  if (children.length === 0) {
    return (
      <ProtectedRoute>
        <Layout>
          <div className="container mx-auto px-4 py-8">
            <h1 className="text-3xl font-heading font-bold mb-8">Insights</h1>
            <Card className="rounded-2xl">
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">
                  No children found. Add a child to start tracking meltdowns and generate insights.
                </p>
              </CardContent>
            </Card>
          </div>
        </Layout>
      </ProtectedRoute>
    );
  }

  const selectedChild = children.find((c) => c.id === selectedChildId);
  
  // Apply child's theme color
  useChildTheme((selectedChild as any)?.theme_color);

  return (
    <ProtectedRoute>
      <Layout>
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-heading font-bold">Insights</h1>
            {isProcessing && (
              <Badge variant="secondary" className="flex items-center gap-2">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Processing updates...
              </Badge>
            )}
          </div>

          <div className="mb-6">
            <Select value={selectedChildId} onValueChange={setSelectedChildId}>
              <SelectTrigger className="w-full md:w-[300px]">
                <SelectValue placeholder="Select a child" />
              </SelectTrigger>
              <SelectContent>
                {children.map((child) => (
                  <SelectItem key={child.id} value={child.id}>
                    {child.name} ({formatAge(child.birth_month, child.birth_year)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-6">
            {/* AI Insights Card */}
            <Card className="rounded-2xl">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <CardTitle>AI Insights for {selectedChild?.name}</CardTitle>
                </div>
                {selectedChild?.updated_at && (
                  <p className="text-xs text-muted-foreground">
                    Last updated: {new Date(selectedChild.updated_at).toLocaleString()}
                  </p>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Job Status Indicator */}
                {selectedChildId && (
                  <InsightJobStatus childId={selectedChildId} childName={selectedChild?.name || ''} />
                )}
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

            {/* Pending Jobs Info (for debugging/transparency) */}
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
        </div>
      </Layout>
    </ProtectedRoute>
  );
}
