import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { 
  Volume2, Eye, Wind, Users, Home, TreePine, MapPin, Camera, Image,
  RefreshCw, Shuffle, Hand, Ban, MessageSquare, Zap, Clock, Smartphone,
  Brain, HelpCircle, Battery, Utensils, Thermometer, AlertCircle, Plus,
  Sofa, Grip, ToyBrick, Gamepad2, Calendar, Wind as Breathing, Gift, Hourglass, Check,
  User, ChevronRight, ChevronLeft
} from 'lucide-react';
import { Database } from '@/types/database';

type Child = Database['public']['Tables']['children']['Row'];

const ENVIRONMENT_OPTIONS = [
  { id: 'noisy', label: 'Noisy', icon: Volume2 },
  { id: 'visually_overwhelming', label: 'Visually overwhelming', icon: Eye },
  { id: 'smell', label: 'Smell', icon: Wind },
  { id: 'crowded', label: 'A lot of people', icon: Users },
];

const LOCATION_OPTIONS = [
  { id: 'inside', label: 'Inside', icon: Home },
  { id: 'outside', label: 'Outside', icon: TreePine },
];

const PRECEDING_OPTIONS = [
  { id: 'transition', label: 'Transition (changing activity, leaving, arriving)', icon: RefreshCw },
  { id: 'routine_change', label: 'Change in routine / unexpected change', icon: Shuffle },
  { id: 'demand', label: 'Demand placed (asked to do something)', icon: Hand },
  { id: 'denied_access', label: 'Denied access ("no", item taken away)', icon: Ban },
  { id: 'social', label: 'Social interaction (peer conflict, group work, sharing)', icon: MessageSquare },
  { id: 'sensory', label: 'Sensory trigger (noise, lights, smell, crowd)', icon: Zap },
  { id: 'waiting', label: 'Waiting (delay, queue)', icon: Clock },
  { id: 'screen_stopped', label: 'Screen time stopped / limited', icon: Smartphone },
  { id: 'hard_task', label: 'Hard task / too difficult', icon: Brain },
  { id: 'not_sure', label: 'Not sure', icon: HelpCircle },
];

const FEELING_OPTIONS = [
  { id: 'tired', label: 'Tired', icon: Battery },
  { id: 'hungry', label: 'Hungry', icon: Utensils },
  { id: 'unwell', label: 'Unwell', icon: Thermometer },
  { id: 'anxious', label: 'Anxious', icon: AlertCircle },
];

const DURATION_OPTIONS = [
  { value: '1min', label: '1 min' },
  { value: '3min', label: '3 min' },
  { value: '5min', label: '5 min' },
  { value: '10min', label: '10 min' },
  { value: '15min', label: '15 min' },
  { value: '30min', label: '30 min' },
  { value: 'custom', label: 'Enter manually' },
];

const RESOLUTION_OPTIONS = [
  { id: 'sensory_break', label: 'Sensory break / quiet space', icon: Sofa },
  { id: 'deep_pressure', label: 'Deep pressure (hug)', icon: Grip },
  { id: 'comfort_item', label: 'Favourite (comfort) item', icon: ToyBrick },
  { id: 'distraction', label: 'Distraction (change of activity)', icon: Gamepad2 },
  { id: 'visual_support', label: 'Visual support (schedule, timer, first–then)', icon: Calendar },
  { id: 'breathing', label: 'Breathing / calming exercises', icon: Breathing },
  { id: 'gave_wanted', label: 'Gave them what they wanted', icon: Gift },
  { id: 'waited', label: 'Did nothing / waited it out', icon: Hourglass },
];

export default function LogMeltdown() {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState('');
  const [loading, setLoading] = useState(false);
  const [childrenLoading, setChildrenLoading] = useState(true);
  
  // Environment (Step 2)
  const [location, setLocation] = useState('');
  const [environmentFactors, setEnvironmentFactors] = useState<string[]>([]);
  const [locationInOut, setLocationInOut] = useState<string>('');
  const [environmentDescription, setEnvironmentDescription] = useState('');
  
  // Preceding (Step 3)
  const [precedingActivities, setPrecedingActivities] = useState<string[]>([]);
  const [childState, setChildState] = useState<string[]>([]);
  const [otherFeeling, setOtherFeeling] = useState('');
  
  // Meltdown (Step 4)
  const [intensity, setIntensity] = useState([3]);
  const [eventDateTime, setEventDateTime] = useState(new Date().toISOString().slice(0, 16));
  const [duration, setDuration] = useState('');
  const [customDuration, setCustomDuration] = useState('');
  
  // Resolution (Step 5)
  const [resolutionStrategies, setResolutionStrategies] = useState<string[]>([]);
  const [otherResolution, setOtherResolution] = useState('');
  const [confidence, setConfidence] = useState([3]);
  
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      fetchChildren();
    }
  }, [user]);

  // Auto-skip step 1 if only one child
  useEffect(() => {
    if (!childrenLoading && children.length === 1) {
      setSelectedChildId(children[0].id);
      setStep(2);
    }
  }, [children, childrenLoading]);

  const fetchChildren = async () => {
    if (!user) return;
    setChildrenLoading(true);

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
    } finally {
      setChildrenLoading(false);
    }
  };

  const selectedChild = children.find(c => c.id === selectedChildId);

  const toggleOption = (
    value: string,
    currentValues: string[],
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    setter(prev =>
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
    );
  };

  const handleLocationInOut = (value: string) => {
    setLocationInOut(prev => prev === value ? '' : value);
  };

  const handlePhotoClick = () => {
    photoInputRef.current?.click();
  };

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      toast.success(`${files.length} photo(s) selected`);
    }
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
      // Combine child state with other feeling if provided
      const finalChildState = [...childState];
      if (otherFeeling.trim()) {
        finalChildState.push(otherFeeling.trim());
      }

      // Combine resolution strategies with other if provided
      const finalResolutions = [...resolutionStrategies];
      if (otherResolution.trim()) {
        finalResolutions.push(otherResolution.trim());
      }

      // Combine environment factors with inside/outside
      const finalEnvironment = [...environmentFactors];
      if (locationInOut) {
        finalEnvironment.push(locationInOut);
      }

      const { error } = await supabase.from('meltdowns').insert({
        child_id: selectedChildId,
        timestamp: new Date(eventDateTime).toISOString(),
        location: location || null,
        environment_factors: finalEnvironment.length > 0 ? finalEnvironment : null,
        environment_description: environmentDescription || null,
        preceding_activities: precedingActivities.length > 0 ? precedingActivities : null,
        child_state: finalChildState.length > 0 ? finalChildState : null,
        meltdown_level: intensity[0],
        duration: duration === 'custom' ? customDuration : duration || null,
        resolution_strategies: finalResolutions.length > 0 ? finalResolutions : null,
        confidence_level: confidence[0],
      } as any);

      if (error) throw error;

      toast.success('Event logged successfully!');
      
      // Generate insights for this child
      try {
        console.log('Generating insights for child:', selectedChildId);
        await supabase.functions.invoke('generate-insights', {
          body: { child_id: selectedChildId }
        });
      } catch (insightsErr) {
        console.error('Error calling insights function:', insightsErr);
      }
      
      // Reset form
      resetForm();
    } catch (error: any) {
      toast.error(error.message || 'Failed to log event');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    if (children.length === 1) {
      setStep(2);
    } else {
      setStep(1);
      setSelectedChildId('');
    }
    setLocation('');
    setEnvironmentFactors([]);
    setLocationInOut('');
    setEnvironmentDescription('');
    setPrecedingActivities([]);
    setChildState([]);
    setOtherFeeling('');
    setIntensity([3]);
    setEventDateTime(new Date().toISOString().slice(0, 16));
    setDuration('');
    setCustomDuration('');
    setResolutionStrategies([]);
    setOtherResolution('');
    setConfidence([3]);
  };

  const totalSteps = children.length === 1 ? 4 : 5;
  const displayStep = children.length === 1 ? step - 1 : step;

  const ProgressIndicator = () => (
    <div className="flex justify-center gap-2 mb-6">
      {Array.from({ length: totalSteps }, (_, i) => (
        <div
          key={i}
          className={`w-3 h-3 rounded-full transition-colors ${
            i + 1 <= displayStep ? 'bg-primary' : 'bg-muted'
          }`}
        />
      ))}
    </div>
  );

  const MultiSelectButton = ({ 
    id, 
    label, 
    icon: Icon, 
    selected, 
    onClick,
    compact = false
  }: { 
    id: string; 
    label: string; 
    icon: any; 
    selected: boolean; 
    onClick: () => void;
    compact?: boolean;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={`${compact ? 'p-3 rounded-lg' : 'p-4 rounded-xl'} border-2 transition-all flex items-center gap-2 text-left ${
        selected
          ? 'border-primary bg-primary/10'
          : 'border-border hover:border-primary/50'
      }`}
    >
      <Icon className={`${compact ? 'w-4 h-4' : 'w-5 h-5'} flex-shrink-0`} />
      <span className={`${compact ? 'text-xs' : 'text-sm'} font-medium`}>{label}</span>
    </button>
  );

  if (childrenLoading) {
    return (
      <ProtectedRoute>
        <Layout>
          <div className="container mx-auto px-4 py-8 max-w-2xl">
            <div className="animate-pulse space-y-4">
              <div className="h-8 bg-muted rounded w-1/3"></div>
              <div className="h-64 bg-muted rounded-2xl"></div>
            </div>
          </div>
        </Layout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <Layout>
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <h1 className="text-3xl font-heading font-bold mb-4">Log an Event</h1>
          <ProgressIndicator />

          {/* Step 1: Select Child (skip if only 1 child) */}
          {step === 1 && children.length > 1 && (
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="w-5 h-5" />
                  Select Child
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3">
                  {children.map(child => (
                    <button
                      key={child.id}
                      onClick={() => setSelectedChildId(child.id)}
                      className={`p-4 rounded-xl border-2 transition-all flex items-center gap-3 ${
                        selectedChildId === child.id
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <User className="w-6 h-6" />
                      <div className="text-left">
                        <div className="font-semibold">{child.name}</div>
                        <div className="text-sm text-muted-foreground">Age: {child.age}</div>
                      </div>
                    </button>
                  ))}
                </div>
                <Button
                  onClick={() => setStep(2)}
                  disabled={!selectedChildId}
                  className="w-full rounded-xl"
                >
                  Next <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Environment */}
          {step === 2 && (
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-5 h-5" />
                  Environment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Location</Label>
                  <Input
                    placeholder="Enter location..."
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="rounded-xl"
                  />
                </div>

                <div className="space-y-3">
                  <Label>Select all that apply</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {ENVIRONMENT_OPTIONS.map(option => (
                      <MultiSelectButton
                        key={option.id}
                        {...option}
                        selected={environmentFactors.includes(option.id)}
                        onClick={() => toggleOption(option.id, environmentFactors, setEnvironmentFactors)}
                        compact
                      />
                    ))}
                    {LOCATION_OPTIONS.map(option => (
                      <MultiSelectButton
                        key={option.id}
                        {...option}
                        selected={locationInOut === option.id}
                        onClick={() => handleLocationInOut(option.id)}
                        compact
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Additional Description (optional)</Label>
                  <Textarea
                    placeholder="Describe the environment..."
                    value={environmentDescription}
                    onChange={(e) => setEnvironmentDescription(e.target.value)}
                    className="rounded-xl"
                  />
                </div>

                <div className="space-y-2">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    ref={photoInputRef}
                    onChange={handlePhotoCapture}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handlePhotoClick}
                    className="w-full rounded-xl"
                  >
                    <Image className="w-4 h-4 mr-2" />
                    Upload Photos
                  </Button>
                </div>

                <div className="flex gap-2">
                  {children.length > 1 && (
                    <Button variant="outline" onClick={() => setStep(1)} className="rounded-xl">
                      <ChevronLeft className="w-4 h-4 mr-2" /> Back
                    </Button>
                  )}
                  <Button onClick={() => setStep(3)} className="flex-1 rounded-xl">
                    Next <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: What preceded the meltdown */}
          {step === 3 && (
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  What Preceded the Meltdown?
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <Label>What was {selectedChild?.name || 'the child'} doing just before?</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {PRECEDING_OPTIONS.map(option => (
                      <MultiSelectButton
                        key={option.id}
                        {...option}
                        selected={precedingActivities.includes(option.id)}
                        onClick={() => toggleOption(option.id, precedingActivities, setPrecedingActivities)}
                        compact
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <Label>Was {selectedChild?.name || 'the child'} feeling:</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {FEELING_OPTIONS.map(option => (
                      <MultiSelectButton
                        key={option.id}
                        {...option}
                        selected={childState.includes(option.id)}
                        onClick={() => toggleOption(option.id, childState, setChildState)}
                        compact
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <Plus className="w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Other feeling..."
                      value={otherFeeling}
                      onChange={(e) => setOtherFeeling(e.target.value)}
                      className="rounded-xl"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(2)} className="rounded-xl">
                    <ChevronLeft className="w-4 h-4 mr-2" /> Back
                  </Button>
                  <Button onClick={() => setStep(4)} className="flex-1 rounded-xl">
                    Next <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 4: Description of meltdown */}
          {step === 4 && (
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  Description of the Meltdown
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <Label>Intensity: {intensity[0]}/5</Label>
                  <Slider
                    value={intensity}
                    onValueChange={setIntensity}
                    max={5}
                    min={1}
                    step={1}
                    className="py-4 intensity-slider"
                    style={{
                      '--slider-color': `hsl(${120 - (intensity[0] - 1) * 30}, 70%, 45%)`
                    } as React.CSSProperties}
                  />
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>1 - Mild</span>
                    <span>5 - Severe</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Date and Time</Label>
                    <Input
                      type="datetime-local"
                      value={eventDateTime}
                      onChange={(e) => setEventDateTime(e.target.value)}
                      className="rounded-xl"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Duration</Label>
                    <Select value={duration} onValueChange={setDuration}>
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Select duration" />
                      </SelectTrigger>
                      <SelectContent>
                        {DURATION_OPTIONS.map(option => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                {duration === 'custom' && (
                  <Input
                    placeholder="Enter duration (e.g., 45min, 1 hour)"
                    value={customDuration}
                    onChange={(e) => setCustomDuration(e.target.value)}
                    className="rounded-xl"
                  />
                )}

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(3)} className="rounded-xl">
                    <ChevronLeft className="w-4 h-4 mr-2" /> Back
                  </Button>
                  <Button onClick={() => setStep(5)} className="flex-1 rounded-xl">
                    Next <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 5: Resolution */}
          {step === 5 && (
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Check className="w-5 h-5" />
                  Resolution
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <Label>What helped solving the situation?</Label>
                  <div className="grid gap-3">
                    {RESOLUTION_OPTIONS.map(option => (
                      <MultiSelectButton
                        key={option.id}
                        {...option}
                        selected={resolutionStrategies.includes(option.id)}
                        onClick={() => toggleOption(option.id, resolutionStrategies, setResolutionStrategies)}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <Plus className="w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Other..."
                      value={otherResolution}
                      onChange={(e) => setOtherResolution(e.target.value)}
                      className="rounded-xl"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <Label>How confident did you feel in solving the situation? {confidence[0]}/5</Label>
                  <Slider
                    value={confidence}
                    onValueChange={setConfidence}
                    max={5}
                    min={1}
                    step={1}
                    className="py-4 intensity-slider"
                    style={{
                      '--slider-color': `hsl(${30 + (confidence[0] - 1) * 45}, 70%, 50%)`
                    } as React.CSSProperties}
                  />
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>1 - Not confident</span>
                    <span>5 - Very confident</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(4)} className="rounded-xl">
                    <ChevronLeft className="w-4 h-4 mr-2" /> Back
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
