import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Database } from '@/types/database';
import { format } from 'date-fns';
import { PlusCircle, Lightbulb } from 'lucide-react';
type Child = Database['public']['Tables']['children']['Row'];
type Meltdown = Database['public']['Tables']['meltdowns']['Row'];

export default function ChildInfo() {
  const { childId } = useParams<{ childId: string }>();
  const [child, setChild] = useState<Child | null>(null);
  const [meltdowns, setMeltdowns] = useState<Meltdown[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (childId) {
      fetchChildData();
    }
  }, [childId]);

  const fetchChildData = async () => {
    if (!childId) return;

    try {
      // Fetch child info
      const { data: childData, error: childError } = await supabase
        .from('children')
        .select('*')
        .eq('id', childId)
        .single();

      if (childError) throw childError;
      setChild(childData);

      // Fetch meltdowns
      const { data: meltdownData, error: meltdownError } = await supabase
        .from('meltdowns')
        .select('*')
        .eq('child_id', childId)
        .order('timestamp', { ascending: false });

      if (meltdownError) throw meltdownError;
      setMeltdowns(meltdownData || []);
    } catch (error) {
      console.error('Error fetching child data:', error);
    } finally {
      setLoading(false);
    }
  };

  const lastMeltdown = meltdowns[0];

  return (
    <ProtectedRoute>
      <Layout>
        <div className="container mx-auto px-4 py-8">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            </div>
          ) : child ? (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                <h1 className="text-3xl font-heading font-bold">{child.name}'s Profile</h1>
                <div className="flex gap-3">
                  <Button asChild>
                    <Link to="/log-meltdown">
                      <PlusCircle className="h-4 w-4 mr-2" />
                      Log an event
                    </Link>
                  </Button>
                  <Button variant="outline" asChild>
                    <Link to="/insights">
                      <Lightbulb className="h-4 w-4 mr-2" />
                      Insights
                    </Link>
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="rounded-2xl">
                  <CardHeader>
                    <CardTitle>Statistics</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-4xl font-heading font-bold text-primary">
                      {meltdowns.length}
                    </div>
                    <p className="text-muted-foreground mt-2">Total meltdowns recorded</p>
                  </CardContent>
                </Card>

                {lastMeltdown && (
                  <Card className="rounded-2xl">
                    <CardHeader>
                      <CardTitle>Last Meltdown</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div>
                        <span className="text-sm text-muted-foreground">Date:</span>
                        <p className="font-semibold">
                          {format(new Date(lastMeltdown.timestamp), 'PPpp')}
                        </p>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">Intensity:</span>
                        <p className="font-semibold">{lastMeltdown.meltdown_level}/5</p>
                      </div>
                      {lastMeltdown.environment_trigger && (
                        <div>
                          <span className="text-sm text-muted-foreground">Trigger:</span>
                          <p className="font-semibold">{lastMeltdown.environment_trigger}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            </>
          ) : (
            <p className="text-center text-muted-foreground">Child not found</p>
          )}
        </div>
      </Layout>
    </ProtectedRoute>
  );
}
