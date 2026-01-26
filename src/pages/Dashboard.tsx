import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { formatAge } from '@/lib/validation';
import { ChildAvatar } from '@/components/ChildAvatar';
import { getThemeColorHsl } from '@/components/ChildColorPicker';
import { Tables } from '@/integrations/supabase/types';

type Child = Tables<'children'>;

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
                <p className="text-muted-foreground mb-6">
                  {user?.role === 'Parent' 
                    ? 'No children added yet. Add your first child to get started.' 
                    : 'No children have been shared with you yet.'}
                </p>
                {user?.role === 'Parent' && (
                  <Button
                    size="lg"
                    className="rounded-xl text-lg px-8 py-6"
                    onClick={() => navigate('/settings')}
                  >
                    <Plus className="w-5 h-5 mr-2" />
                    Add Your First Child
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              {user?.role === 'Parent' && (
                <div className="mb-6">
                  <Button
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => navigate('/settings')}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add New Child
                  </Button>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {children.map((child) => {
                const themeColor = child.theme_color && child.theme_color !== 'default' 
                  ? getThemeColorHsl(child.theme_color) 
                  : null;
                
                return (
                  <Card
                    key={child.id}
                    className="rounded-2xl cursor-pointer hover:shadow-lg transition-all overflow-hidden"
                    style={themeColor ? {
                      borderColor: `hsl(${themeColor} / 0.3)`,
                      borderWidth: '2px',
                    } : undefined}
                    onClick={() => navigate(`/child/${child.id}`)}
                  >
                    {themeColor && (
                      <div 
                        className="h-2 w-full" 
                        style={{ backgroundColor: `hsl(${themeColor})` }}
                      />
                    )}
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <div className="mx-auto mb-4">
                          <ChildAvatar 
                            avatarPath={child.avatar_path} 
                            name={child.name} 
                            size="lg"
                            className="mx-auto"
                          />
                        </div>
                        <h3 className="text-xl font-heading font-bold">{child.name}</h3>
                        <p className="text-muted-foreground mt-1">{formatAge(child.birth_month, child.birth_year)}</p>
                      </div>
                      <Button
                        variant="outline"
                        className="w-full mt-4 rounded-xl"
                        style={themeColor ? {
                          borderColor: `hsl(${themeColor})`,
                          color: `hsl(${themeColor})`,
                        } : undefined}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/log-meltdown?childId=${child.id}`);
                        }}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Log an event
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
              </div>
            </>
          )}
        </div>
      </Layout>
    </ProtectedRoute>
  );
}
