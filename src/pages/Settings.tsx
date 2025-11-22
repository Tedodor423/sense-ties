import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { Database } from '@/types/database';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Child = Database['public']['Tables']['children']['Row'];

export default function Settings() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>('new');
  const [childName, setChildName] = useState('');
  const [childAge, setChildAge] = useState('');
  const [shareEmail, setShareEmail] = useState('');
  const [sharedUsers, setSharedUsers] = useState<Array<{ id: string; email: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => {
    if (user?.role === 'Parent') {
      fetchChildren();
    }
  }, [user]);

  useEffect(() => {
    if (selectedChildId && selectedChildId !== 'new') {
      loadChildData();
      fetchSharedUsers();
    } else {
      setChildName('');
      setChildAge('');
      setSharedUsers([]);
    }
  }, [selectedChildId]);

  const fetchChildren = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('children')
        .select('*')
        .eq('parent_id', user.user.id);

      if (error) throw error;
      setChildren(data || []);
    } catch (error) {
      console.error('Error fetching children:', error);
    }
  };

  const loadChildData = () => {
    const child = children.find(c => c.id === selectedChildId);
    if (child) {
      setChildName(child.name);
      setChildAge(child.age.toString());
    }
  };

  const fetchSharedUsers = async () => {
    if (!selectedChildId || selectedChildId === 'new') return;

    try {
      const { data, error } = await supabase
        .from('child_access')
        .select('id, user_id')
        .eq('child_id', selectedChildId);

      if (error) throw error;

      // Fetch user emails using the database function
      const usersWithEmails = await Promise.all(
        (data || []).map(async (access: any) => {
          const { data: email } = await supabase.rpc('get_user_email_by_id', {
            _user_id: access.user_id
          });
          return {
            id: access.id,
            email: email || 'Unknown',
          };
        })
      );

      setSharedUsers(usersWithEmails);
    } catch (error) {
      console.error('Error fetching shared users:', error);
    }
  };

  const handleSaveChild = async () => {
    if (!childName || !childAge) {
      toast.error('Please fill in all fields');
      return;
    }

    setLoading(true);

    try {
      if (selectedChildId === 'new') {
        // Create new child
        const { error } = await supabase.from('children').insert({
          parent_id: user!.user.id,
          name: childName,
          age: parseInt(childAge),
        } as any);

        if (error) throw error;
        toast.success('Child added successfully!');
      } else {
        // Update existing child
        const { error }: any = await supabase
          .from('children')
          .update({
            name: childName,
            age: parseInt(childAge),
          })
          .eq('id', selectedChildId);

        if (error) throw error;
        toast.success('Child updated successfully!');
      }

      await fetchChildren();
      setSelectedChildId('new');
    } catch (error: any) {
      toast.error(error.message || 'Failed to save child');
    } finally {
      setLoading(false);
    }
  };

  const handleShareChild = async () => {
    if (!shareEmail || selectedChildId === 'new') {
      toast.error('Please enter an email address');
      return;
    }

    setLoading(true);

    try {
      // Find user by email using the database function
      const { data: targetUserId, error: lookupError } = await supabase.rpc('get_user_id_by_email', {
        _email: shareEmail
      });

      if (lookupError) throw lookupError;

      if (!targetUserId) {
        toast.error('User not found with this email');
        setLoading(false);
        return;
      }

      // Add access
      const { error } = await supabase.from('child_access').insert({
        child_id: selectedChildId,
        user_id: targetUserId,
      } as any);

      if (error) throw error;

      toast.success('Child shared successfully!');
      setShareEmail('');
      await fetchSharedUsers();
    } catch (error: any) {
      toast.error(error.message || 'Failed to share child');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveAccess = async (accessId: string) => {
    try {
      const { error } = await supabase
        .from('child_access')
        .delete()
        .eq('id', accessId);

      if (error) throw error;

      toast.success('Access removed successfully!');
      await fetchSharedUsers();
    } catch (error: any) {
      toast.error(error.message || 'Failed to remove access');
    }
  };

  const handleDeleteChild = async () => {
    if (selectedChildId === 'new') return;

    setLoading(true);

    try {
      const { error } = await supabase
        .from('children')
        .delete()
        .eq('id', selectedChildId);

      if (error) throw error;

      toast.success('Child data deleted successfully!');
      await fetchChildren();
      setSelectedChildId('new');
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete child');
    } finally {
      setLoading(false);
      setDeleteDialogOpen(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <ProtectedRoute>
      <Layout>
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <h1 className="text-3xl font-heading font-bold mb-8">Settings</h1>

          {user?.role === 'Parent' && (
            <Card className="rounded-2xl mb-6">
              <CardHeader>
                <CardTitle>Manage Children</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Select Child</Label>
                  <Select value={selectedChildId} onValueChange={setSelectedChildId}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">Add New Child</SelectItem>
                      {children.map(child => (
                        <SelectItem key={child.id} value={child.id}>
                          {child.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    placeholder="Child's name"
                    value={childName}
                    onChange={(e) => setChildName(e.target.value)}
                    className="rounded-xl"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Age</Label>
                  <Input
                    type="number"
                    placeholder="Age"
                    value={childAge}
                    onChange={(e) => setChildAge(e.target.value)}
                    className="rounded-xl"
                  />
                </div>

                <Button
                  onClick={handleSaveChild}
                  disabled={loading}
                  className="w-full rounded-xl"
                >
                  {selectedChildId === 'new' ? 'Add Child' : 'Update Child'}
                </Button>

                {selectedChildId !== 'new' && (
                  <>
                    <div className="border-t pt-4 space-y-4">
                      <Label>Share with User</Label>
                      <div className="flex gap-2">
                        <Input
                          type="email"
                          placeholder="user@example.com"
                          value={shareEmail}
                          onChange={(e) => setShareEmail(e.target.value)}
                          className="rounded-xl"
                        />
                        <Button
                          onClick={handleShareChild}
                          disabled={loading}
                          className="rounded-xl"
                        >
                          Share
                        </Button>
                      </div>

                      {sharedUsers.length > 0 && (
                        <div className="space-y-2">
                          <Label>Shared with:</Label>
                          {sharedUsers.map(user => (
                            <div
                              key={user.id}
                              className="flex items-center justify-between p-2 bg-muted rounded-xl"
                            >
                              <span>{user.email}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemoveAccess(user.id)}
                                className="h-8 w-8"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <Button
                      variant="destructive"
                      onClick={() => setDeleteDialogOpen(true)}
                      className="w-full rounded-xl"
                    >
                      Delete All Data
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="rounded-2xl">
            <CardContent className="pt-6">
              <Button
                variant="outline"
                onClick={handleLogout}
                className="w-full rounded-xl"
              >
                Log Out
              </Button>
            </CardContent>
          </Card>
        </div>

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete all data for this child,
                including all recorded meltdowns.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteChild} className="bg-destructive text-destructive-foreground">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Layout>
    </ProtectedRoute>
  );
}
