import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';

interface InsightJob {
  id: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
}

interface InsightJobStatusProps {
  childId: string;
  childName: string;
}

export function InsightJobStatus({ childId, childName }: InsightJobStatusProps) {
  const [latestJob, setLatestJob] = useState<InsightJob | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLatestJob();
    
    // Subscribe to realtime updates
    const channel = supabase
      .channel(`job-status-${childId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'insight_jobs',
          filter: `child_id=eq.${childId}`,
        },
        () => {
          fetchLatestJob();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [childId]);

  const fetchLatestJob = async () => {
    try {
      const { data, error } = await supabase
        .from('insight_jobs')
        .select('id, status, created_at, completed_at, error_message')
        .eq('child_id', childId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setLatestJob(data);
    } catch (error) {
      console.error('Error fetching job status:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = () => {
    if (!latestJob) {
      return (
        <Badge variant="outline" className="text-muted-foreground">
          No insights yet
        </Badge>
      );
    }

    switch (latestJob.status) {
      case 'pending':
        return (
          <Badge variant="secondary" className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Pending
          </Badge>
        );
      case 'processing':
        return (
          <Badge variant="default" className="flex items-center gap-1 bg-primary/80">
            <Loader2 className="h-3 w-3 animate-spin" />
            Processing
          </Badge>
        );
      case 'completed':
        return (
          <Badge variant="default" className="flex items-center gap-1 bg-green-600">
            <CheckCircle2 className="h-3 w-3" />
            Insights up to date
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="destructive" className="flex items-center gap-1">
            <XCircle className="h-3 w-3" />
            Error
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            {latestJob.status}
          </Badge>
        );
    }
  };


  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Loading...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {getStatusBadge()}
      
      {latestJob?.status === 'error' && latestJob.error_message && (
        <p className="text-xs text-destructive mt-1 line-clamp-2">
          {latestJob.error_message}
        </p>
      )}
    </div>
  );
}