import { useState } from 'react';
import { Layout } from '@/components/Layout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { MessageSquare, Send, Loader2 } from 'lucide-react';

const ratingOptions = [
  { value: 1, emoji: '😞', label: 'Very Dissatisfied' },
  { value: 2, emoji: '😕', label: 'Dissatisfied' },
  { value: 3, emoji: '😐', label: 'Neutral' },
  { value: 4, emoji: '🙂', label: 'Satisfied' },
  { value: 5, emoji: '😊', label: 'Very Satisfied' },
];

export default function Feedback() {
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!rating) {
      toast({
        title: 'Please select a rating',
        description: 'Let us know how you feel about SenseTies',
        variant: 'destructive',
      });
      return;
    }

    if (!message.trim()) {
      toast({
        title: 'Please enter your feedback',
        description: 'We want to hear what you think!',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke('send-feedback', {
        body: {
          rating,
          message: message.trim(),
          isAnonymous,
        },
      });

      if (error) throw error;

      setIsSubmitted(true);
      toast({
        title: 'Thank you for your feedback!',
        description: 'Your feedback helps us improve SenseTies.',
      });
    } catch (error: any) {
      console.error('Error submitting feedback:', error);
      toast({
        title: 'Failed to submit feedback',
        description: error.message || 'Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <ProtectedRoute>
        <Layout>
          <div className="container mx-auto px-4 py-8 max-w-2xl">
            <Card>
              <CardContent className="pt-8 text-center">
                <div className="text-6xl mb-4">🎉</div>
                <h2 className="text-2xl font-bold mb-2">Thank You!</h2>
                <p className="text-muted-foreground mb-6">
                  Your feedback has been sent to our team. We appreciate you taking the time to help us improve SenseTies.
                </p>
                <Button onClick={() => {
                  setIsSubmitted(false);
                  setRating(null);
                  setMessage('');
                  setIsAnonymous(false);
                }}>
                  Submit More Feedback
                </Button>
              </CardContent>
            </Card>
          </div>
        </Layout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <Layout>
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <MessageSquare className="h-6 w-6 text-primary" />
                <CardTitle>Give Feedback</CardTitle>
              </div>
              <CardDescription>
                Help us improve SenseTies by sharing your thoughts and suggestions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Rating Selection */}
                <div className="space-y-3">
                  <Label className="text-base font-medium">
                    Do you like the SenseTies app?
                  </Label>
                  <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                    {ratingOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setRating(option.value)}
                        className={`flex flex-col items-center p-3 rounded-lg border-2 transition-all min-w-[80px] ${
                          rating === option.value
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-primary/50 hover:bg-muted'
                        }`}
                      >
                        <span className="text-3xl mb-1">{option.emoji}</span>
                        <span className="text-xs text-muted-foreground text-center">
                          {option.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Message */}
                <div className="space-y-2">
                  <Label htmlFor="message" className="text-base font-medium">
                    Your Feedback
                  </Label>
                  <Textarea
                    id="message"
                    placeholder="Tell us what you think, what could be improved, or any features you'd like to see..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={5}
                    maxLength={5000}
                    className="resize-none"
                  />
                  <p className="text-xs text-muted-foreground text-right">
                    {message.length}/5000 characters
                  </p>
                </div>

                {/* Anonymous Checkbox */}
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="anonymous"
                    checked={isAnonymous}
                    onCheckedChange={(checked) => setIsAnonymous(checked === true)}
                  />
                  <Label htmlFor="anonymous" className="text-sm cursor-pointer">
                    Send anonymously (your email won't be included)
                  </Label>
                </div>

                {/* Submit Button */}
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Send Feedback
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </Layout>
    </ProtectedRoute>
  );
}
