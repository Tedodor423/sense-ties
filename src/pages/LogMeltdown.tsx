import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Volume2, VolumeX, Sun, Moon, Home, TreePine, Users, UserX, Wind, Gauge, Camera } from 'lucide-react';
import { Database } from '@/types/database';

type Child = Database['public']['Tables']['children']['Row'];

export default function LogMeltdown() {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState('');
  const [environment, setEnvironment] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [intensity, setIntensity] = useState([3]);
  const [loading, setLoading] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);

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
        query = supabase
          .from('children')
          .select('*')
          .eq('parent_id', user.user.id);
      } else {
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
    }
  };

  const environmentOptions = [
    { id: 'noisy', label: 'Noisy', icon: Volume2 },
    { id: 'quiet', label: 'Quiet', icon: VolumeX },
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'dark', label: 'Dark', icon: Moon },
    { id: 'outside', label: 'Outside', icon: TreePine },
    { id: 'inside', label: 'Inside', icon: Home },
    { id: 'crowded', label: 'A lot of people', icon: Users },
    { id: 'few-people', label: 'Not many people', icon: UserX },
    { id: 'smell', label: 'Smell', icon: Wind },
    { id: 'movement', label: 'Movement', icon: Gauge },
  ];

  const toggleEnvironment = (id: string) => {
    setEnvironment(prev =>
      prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]
    );
  };

  const handleCameraClick = () => {
    cameraInputRef.current?.click();
  };

  const handleVideoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      console.log('Video captured:', file);
      toast.success('Video recorded successfully!');
      // Video captured but not used yet
    }
    // Reset input value to allow capturing again
    if (e.target) {
      e.target.value = '';
    }
  };

  const handleSubmit = async () => {
    if (!selectedChildId) {
      toast.error('Please select a child');
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.from('meltdowns').insert({
        child_id: selectedChildId,
        timestamp: new Date().toISOString(),
        environment_trigger: environment.join(', '),
        noise_level: environment.includes('noisy') ? 'Noisy' : environment.includes('quiet') ? 'Quiet' : null,
        environment_description: description || null,
        meltdown_level: intensity[0],
        description: description || null,
      } as any);

      if (error) throw error;

      toast.success('Meltdown logged successfully!');
      
      // Generate insights for this child
      try {
        console.log('Generating insights for child:', selectedChildId);
        const { error: insightsError } = await supabase.functions.invoke('generate-insights', {
          body: { child_id: selectedChildId }
        });
        
        if (insightsError) {
          console.error('Error generating insights:', insightsError);
          toast.error('Failed to generate insights, but meltdown was logged');
        } else {
          console.log('Insights generated successfully');
        }
      } catch (insightsErr) {
        console.error('Error calling insights function:', insightsErr);
      }
      
      // Reset form
      setStep(1);
      setSelectedChildId('');
      setEnvironment([]);
      setDescription('');
      setIntensity([3]);
    } catch (error: any) {
      toast.error(error.message || 'Failed to log meltdown');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedRoute>
      <Layout>
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <h1 className="text-3xl font-heading font-bold mb-8">Log a Meltdown</h1>

          {step === 1 && (
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle>Step 1: Select Child</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Child</Label>
                  <Select value={selectedChildId} onValueChange={setSelectedChildId}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Select a child" />
                    </SelectTrigger>
                    <SelectContent>
                      {children.map(child => (
                        <SelectItem key={child.id} value={child.id}>
                          {child.name} (Age: {child.age})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={() => setStep(2)}
                  disabled={!selectedChildId}
                  className="w-full rounded-xl"
                >
                  Next
                </Button>
              </CardContent>
            </Card>
          )}

          {step === 2 && (
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle>Step 2: Describe Environment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-3">
                  {environmentOptions.map(option => {
                    const Icon = option.icon;
                    const isSelected = environment.includes(option.id);
                    return (
                      <button
                        key={option.id}
                        onClick={() => toggleEnvironment(option.id)}
                        className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                          isSelected
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <Icon className="w-6 h-6" />
                        <span className="text-sm font-semibold">{option.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="space-y-2">
                  <input
                    type="file"
                    accept="video/*"
                    capture="user"
                    ref={cameraInputRef}
                    onChange={handleVideoCapture}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCameraClick}
                    className="w-full rounded-xl"
                  >
                    <Camera className="w-4 h-4 mr-2" />
                    Record Short Video
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label>Additional Description (optional)</Label>
                  <Textarea
                    placeholder="Describe the environment in more detail..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="rounded-xl"
                  />
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(1)} className="rounded-xl">
                    Back
                  </Button>
                  <Button onClick={() => setStep(3)} className="flex-1 rounded-xl">
                    Next
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {step === 3 && (
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle>Step 3: Intensity Slider</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <Label>Intensity of the meltdown: {intensity[0]}/5</Label>
                  <Slider
                    value={intensity}
                    onValueChange={setIntensity}
                    max={5}
                    min={0}
                    step={1}
                    className="py-4"
                  />
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>0 - Minimal</span>
                    <span>5 - Severe</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(2)} className="rounded-xl">
                    Back
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={loading}
                    className="flex-1 rounded-xl"
                  >
                    {loading ? 'Saving...' : 'Save Event'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </Layout>
    </ProtectedRoute>
  );
}
