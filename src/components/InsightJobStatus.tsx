import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, XCircle, Clock, Sparkles, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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
  const navigate = useNavigate();

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
            Ready
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

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
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
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">AI Insights</span>
        </div>
        {getStatusBadge()}
      </div>
      
      {latestJob && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Last run: {formatTime(latestJob.completed_at || latestJob.created_at)}
          </span>
          {latestJob.status === 'completed' && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/insights?childId=${childId}`);
              }}
            >
              View Report
              <ExternalLink className="h-3 w-3 ml-1" />
            </Button>
          )}
        </div>
      )}
      
      {latestJob?.status === 'error' && latestJob.error_message && (
        <p className="text-xs text-destructive mt-1 line-clamp-2">
          {latestJob.error_message}
        </p>
      )}
    </div>
  );
}