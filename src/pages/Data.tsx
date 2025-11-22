import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Layout } from '@/components/Layout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Database } from '@/types/database';
import { format } from 'date-fns';

type Child = Database['public']['Tables']['children']['Row'];
type Meltdown = Database['public']['Tables']['meltdowns']['Row'];

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
                      {child.name}
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
                          <TableHead>Environment</TableHead>
                          <TableHead>Noise Level</TableHead>
                          <TableHead>Description</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {meltdowns.map((meltdown) => (
                          <TableRow key={meltdown.id}>
                            <TableCell className="font-medium">
                              {format(new Date(meltdown.timestamp), 'PPpp')}
                            </TableCell>
                            <TableCell>{meltdown.meltdown_level}/5</TableCell>
                            <TableCell>{meltdown.environment_trigger || '-'}</TableCell>
                            <TableCell>{meltdown.noise_level || '-'}</TableCell>
                            <TableCell className="max-w-xs truncate">
                              {meltdown.description || '-'}
                            </TableCell>
                          </TableRow>
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
