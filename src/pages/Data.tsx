import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Layout } from '@/components/Layout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tables } from '@/integrations/supabase/types';
import { format } from 'date-fns';
import { ImageIcon, ChevronDown, ChevronUp } from 'lucide-react';
import { useSignedPhotoUrls } from '@/hooks/useSignedPhotoUrls';

type Child = Tables<'children'>;
type Meltdown = Tables<'meltdowns'>;

function MeltdownRow({ meltdown }: { meltdown: Meltdown }) {
  const [expanded, setExpanded] = useState(false);
  const { signedUrls } = useSignedPhotoUrls(expanded ? meltdown.photos : null);

  return (
    <>
      <TableRow 
        className="cursor-pointer hover:bg-muted/50" 
        onClick={() => setExpanded(!expanded)}
      >
        <TableCell className="font-medium whitespace-nowrap">
          {format(new Date(meltdown.timestamp), 'PPpp')}
        </TableCell>
        <TableCell>
          <Badge variant={meltdown.meltdown_level >= 4 ? 'destructive' : 'secondary'}>
            {meltdown.meltdown_level}/5
          </Badge>
        </TableCell>
        <TableCell>{meltdown.location || '-'}</TableCell>
        <TableCell>{meltdown.duration || '-'}</TableCell>
        <TableCell>{meltdown.environment_trigger || '-'}</TableCell>
        <TableCell>{meltdown.noise_level || '-'}</TableCell>
        <TableCell>
          {meltdown.photos && meltdown.photos.length > 0 && (
            <Badge variant="outline" className="gap-1">
              <ImageIcon className="h-3 w-3" />
              {meltdown.photos.length}
            </Badge>
          )}
        </TableCell>
        <TableCell>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </TableCell>
      </TableRow>
      
      {expanded && (
        <TableRow>
          <TableCell colSpan={8} className="bg-muted/30 p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
              {/* Child State */}
              {meltdown.child_state && meltdown.child_state.length > 0 && (
                <div>
                  <span className="text-muted-foreground font-medium">Child State:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {meltdown.child_state.map((state, i) => (
                      <Badge key={i} variant="outline">{state}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Preceding Activities */}
              {meltdown.preceding_activities && meltdown.preceding_activities.length > 0 && (
                <div>
                  <span className="text-muted-foreground font-medium">Preceding Activities:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {meltdown.preceding_activities.map((activity, i) => (
                      <Badge key={i} variant="outline">{activity}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Environment Factors */}
              {meltdown.environment_factors && meltdown.environment_factors.length > 0 && (
                <div>
                  <span className="text-muted-foreground font-medium">Environment Factors:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {meltdown.environment_factors.map((factor, i) => (
                      <Badge key={i} variant="outline">{factor}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Resolution Strategies */}
              {meltdown.resolution_strategies && meltdown.resolution_strategies.length > 0 && (
                <div>
                  <span className="text-muted-foreground font-medium">Resolution Strategies:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {meltdown.resolution_strategies.map((strategy, i) => (
                      <Badge key={i} variant="outline">{strategy}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Confidence Level */}
              {meltdown.confidence_level && (
                <div>
                  <span className="text-muted-foreground font-medium">Confidence Level:</span>
                  <p className="mt-1">{meltdown.confidence_level}/5</p>
                </div>
              )}

              {/* Environment Description */}
              {meltdown.environment_description && (
                <div className="md:col-span-2">
                  <span className="text-muted-foreground font-medium">Environment Description:</span>
                  <p className="mt-1">{meltdown.environment_description}</p>
                </div>
              )}

              {/* Description */}
              {meltdown.description && (
                <div className="md:col-span-2 lg:col-span-3">
                  <span className="text-muted-foreground font-medium">Description:</span>
                  <p className="mt-1">{meltdown.description}</p>
                </div>
              )}

              {/* Photos */}
              {meltdown.photos && meltdown.photos.length > 0 && (
                <div className="md:col-span-2 lg:col-span-3">
                  <span className="text-muted-foreground font-medium">Photos:</span>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {meltdown.photos.map((photo, i) => {
                      const url = signedUrls.get(photo);
                      return (
                        <div key={i} className="w-24 h-24 bg-muted rounded-lg overflow-hidden">
                          {url ? (
                            <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export default function Data() {
  const { user } = useAuth();
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState('');
  const [meltdowns, setMeltdowns] = useState<Meltdown[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      fetchChildren();
    }
  }, [user]);

  useEffect(() => {
    if (selectedChildId) {
      fetchMeltdowns();
    }
  }, [selectedChildId]);

  const fetchChildren = async () => {
    if (!user) return;

    try {
      const { data: accessData } = await supabase
        .from('child_access')
        .select('child_id')
        .eq('user_id', user.user.id);

      const childIds = (accessData || []).map((a: any) => a.child_id);
      
      const { data, error } = await supabase
        .from('children')
        .select('*')
        .in('id', childIds);

      if (error) throw error;
      setChildren(data || []);
    } catch (error) {
      console.error('Error fetching children:', error);
    }
  };

  const fetchMeltdowns = async () => {
    if (!selectedChildId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('meltdowns')
        .select('*')
        .eq('child_id', selectedChildId)
        .order('timestamp', { ascending: false });

      if (error) throw error;
      setMeltdowns(data || []);
    } catch (error) {
      console.error('Error fetching meltdowns:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedRoute allowedRoles={['Clinician']}>
      <Layout>
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-3xl font-heading font-bold mb-8">Data</h1>

          <Card className="rounded-2xl mb-6">
            <CardHeader>
              <CardTitle>Select Child</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={selectedChildId} onValueChange={setSelectedChildId}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Select a child to view their data" />
                </SelectTrigger>
                <SelectContent>
                  {children.map(child => (
                    <SelectItem key={child.id} value={child.id}>
                      {child.name} (Age: {child.age})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {selectedChildId && (
            <Card className="rounded-2xl">
              <CardContent className="p-0">
                {loading ? (
                  <div className="py-12 text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
                  </div>
                ) : meltdowns.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">
                    No meltdown data recorded for this child yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date & Time</TableHead>
                          <TableHead>Intensity</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead>Duration</TableHead>
                          <TableHead>Trigger</TableHead>
                          <TableHead>Noise Level</TableHead>
                          <TableHead>Photos</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {meltdowns.map((meltdown) => (
                          <MeltdownRow key={meltdown.id} meltdown={meltdown} />
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </Layout>
    </ProtectedRoute>
  );
}
