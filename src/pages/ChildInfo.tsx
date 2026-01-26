import { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tables } from '@/integrations/supabase/types';
import { format } from 'date-fns';
import { PlusCircle, Lightbulb, MapPin, Gauge, Calendar, ImageIcon } from 'lucide-react';
import { useSignedPhotoUrls } from '@/hooks/useSignedPhotoUrls';
import { useChildTheme } from '@/hooks/useChildTheme';
import { ChildAvatar } from '@/components/ChildAvatar';

type Child = Tables<'children'>;
type Meltdown = Tables<'meltdowns'>;

export default function ChildInfo() {
  const { childId } = useParams<{ childId: string }>();
  const [child, setChild] = useState<Child | null>(null);
  const [meltdowns, setMeltdowns] = useState<Meltdown[]>([]);
  const [loading, setLoading] = useState(true);

  // Get all photo paths from the latest 5 meltdowns
  const latestMeltdowns = meltdowns.slice(0, 5);
  const allPhotoPaths = useMemo(() => {
    return latestMeltdowns
      .flatMap(m => m.photos || [])
      .filter(Boolean) as string[];
  }, [latestMeltdowns]);

  const { signedUrls, loading: photosLoading } = useSignedPhotoUrls(allPhotoPaths);

  // Apply child's theme color - must be called unconditionally before any early returns
  useChildTheme(child?.theme_color);

  useEffect(() => {
    if (childId) {
      fetchChildData();
    }
  }, [childId]);

  const fetchChildData = async () => {
    if (!childId) return;

    try {
      const { data: childData, error: childError } = await supabase
        .from('children')
        .select('*')
        .eq('id', childId)
        .single();

      if (childError) throw childError;
      setChild(childData);

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
                <div className="flex items-center gap-4">
                  <ChildAvatar 
                    avatarPath={child.avatar_path} 
                    name={child.name} 
                    size="lg" 
                  />
                  <h1 className="text-3xl font-heading font-bold">{child.name}'s Profile</h1>
                </div>
                <div className="flex gap-3">
                  <Button asChild>
                    <Link to={`/log-meltdown?childId=${childId}`}>
                      <PlusCircle className="h-4 w-4 mr-2" />
                      Log an event
                    </Link>
                  </Button>
                  <Button variant="outline" asChild>
                    <Link to={`/insights?childId=${childId}`}>
                      <Lightbulb className="h-4 w-4 mr-2" />
                      Insights
                    </Link>
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
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

              {/* Recent Meltdowns Section */}
              {latestMeltdowns.length > 0 && (
                <div className="space-y-4">
                  <h2 className="text-xl font-heading font-semibold">Recent Events</h2>
                  <div className="grid gap-4">
                    {latestMeltdowns.map((meltdown) => {
                      const firstPhoto = meltdown.photos?.[0];
                      const photoUrl = firstPhoto ? signedUrls.get(firstPhoto) : null;

                      return (
                        <Card key={meltdown.id} className="rounded-2xl overflow-hidden">
                          <div className="flex flex-col sm:flex-row">
                            {/* Photo Section */}
                            <div className="sm:w-32 sm:h-32 w-full h-40 bg-muted flex-shrink-0">
                              {photoUrl ? (
                                <img
                                  src={photoUrl}
                                  alt="Meltdown context"
                                  className="w-full h-full object-cover"
                                />
                              ) : photosLoading && firstPhoto ? (
                                <div className="w-full h-full flex items-center justify-center">
                                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                                </div>
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                  <ImageIcon className="h-8 w-8" />
                                </div>
                              )}
                            </div>

                            {/* Info Section */}
                            <CardContent className="flex-1 p-4">
                              <div className="flex flex-wrap gap-4 text-sm">
                                <div className="flex items-center gap-2">
                                  <Calendar className="h-4 w-4 text-muted-foreground" />
                                  <span>{format(new Date(meltdown.timestamp), 'MMM d, yyyy h:mm a')}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Gauge className="h-4 w-4 text-muted-foreground" />
                                  <span>Intensity: <strong>{meltdown.meltdown_level}/5</strong></span>
                                </div>
                                {meltdown.location && (
                                  <div className="flex items-center gap-2">
                                    <MapPin className="h-4 w-4 text-muted-foreground" />
                                    <span>{meltdown.location}</span>
                                  </div>
                                )}
                              </div>
                              {meltdown.environment_trigger && (
                                <p className="mt-2 text-sm text-muted-foreground">
                                  Trigger: {meltdown.environment_trigger}
                                </p>
                              )}
                            </CardContent>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-center text-muted-foreground">Child not found</p>
          )}
        </div>
      </Layout>
    </ProtectedRoute>
  );
}