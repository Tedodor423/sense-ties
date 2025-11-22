import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
import { Loader2 } from 'lucide-react';

interface Child {
  id: string;
  name: string;
  age: number;
  insights: string | null;
}

interface TriggerData {
  trigger: string;
  count: number;
}

export default function Insights() {
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>('');
  const [insights, setInsights] = useState<string>('');
  const [triggerData, setTriggerData] = useState<TriggerData[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchChildren();
  }, []);

  useEffect(() => {
    if (selectedChildId) {
      fetchInsightsAndTriggers(selectedChildId);
    }
  }, [selectedChildId]);

  const fetchChildren = async () => {
    try {
      const { data, error } = await supabase
        .from('children')
        .select('id, name, age, insights')
        .order('name');

      if (error) throw error;

      setChildren(data || []);
      if (data && data.length > 0) {
        setSelectedChildId(data[0].id);
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

  const fetchInsightsAndTriggers = async (childId: string) => {
    try {
      // Fetch insights
      const { data: childData, error: childError } = await supabase
        .from('children')
        .select('insights')
        .eq('id', childId)
        .single();

      if (childError) throw childError;
      setInsights(childData?.insights || 'No insights available yet. Log more meltdowns to generate insights.');

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

  return (
    <ProtectedRoute>
      <Layout>
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-3xl font-heading font-bold mb-8">Insights</h1>

          <div className="mb-6">
            <Select value={selectedChildId} onValueChange={setSelectedChildId}>
              <SelectTrigger className="w-full md:w-[300px]">
                <SelectValue placeholder="Select a child" />
              </SelectTrigger>
              <SelectContent>
                {children.map((child) => (
                  <SelectItem key={child.id} value={child.id}>
                    {child.name} ({child.age} years old)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-6">
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle>AI Insights for {selectedChild?.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-foreground whitespace-pre-wrap">{insights}</p>
              </CardContent>
            </Card>

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
          </div>
        </div>
      </Layout>
    </ProtectedRoute>
  );
}
