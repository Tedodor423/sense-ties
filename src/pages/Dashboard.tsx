import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Card, CardContent } from '@/components/ui/card';
import { User } from 'lucide-react';
import { Database } from '@/types/database';
import { formatAge } from '@/lib/validation';
import { InsightJobStatus } from '@/components/InsightJobStatus';

type Child = Database['public']['Tables']['children']['Row'];

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchChildren();
    }
  }, [user]);

  const fetchChildren = async () => {
    if (!user) return;

    try {
      let query;

      if (user.role === 'Parent') {
        // Parents see children they created
        query = supabase
          .from('children')
          .select('*')
          .eq('parent_id', user.user.id);
      } else {
        // Teachers and Practitioners see children shared with them
        const { data: accessData } = await supabase
          .from('child_access')
          .select('child_id')
          .eq('user_id', user.user.id);

        const childIds = (accessData || []).map((a: any) => a.child_id);
        
        query = supabase
          .from('children')
          .select('*')
          .in('id', childIds);
      }

      const { data, error } = await query;

      if (error) throw error;
      setChildren(data || []);
    } catch (error) {
      console.error('Error fetching children:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedRoute>
      <Layout>
        <div className="container mx-auto px-4 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-heading font-bold">
              Hello, {user?.firstName}!
            </h1>
            <p className="text-muted-foreground mt-2">
              {user?.role === 'Parent' ? 'Your children' : 'Children you have access to'}
            </p>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            </div>
          ) : children.length === 0 ? (
            <Card className="rounded-2xl">
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">
                  {user?.role === 'Parent' 
                    ? 'No children added yet. Go to Settings to add a child.' 
                    : 'No children have been shared with you yet.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {children.map((child) => (
                <Card
                  key={child.id}
                  className="rounded-2xl cursor-pointer hover:shadow-lg transition-all"
                  onClick={() => navigate(`/child/${child.id}`)}
                >
                  <CardContent className="pt-6">
                    <div className="text-center mb-4">
                      <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                        <User className="w-10 h-10 text-primary" />
                      </div>
                      <h3 className="text-xl font-heading font-bold">{child.name}</h3>
                      <p className="text-muted-foreground mt-1">{formatAge(child.birth_month, child.birth_year)}</p>
                    </div>
                    
                    {/* Job Status Section */}
                    <div className="border-t pt-4 mt-4">
                      <InsightJobStatus childId={child.id} childName={child.name} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </Layout>
    </ProtectedRoute>
  );
}
