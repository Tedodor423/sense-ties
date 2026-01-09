import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SignedUrl {
  path: string;
  url: string;
}

export function useSignedPhotoUrls(photoPaths: string[] | null | undefined) {
  const [signedUrls, setSignedUrls] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!photoPaths || photoPaths.length === 0) {
      setSignedUrls(new Map());
      return;
    }

    // Filter out paths we already have URLs for
    const pathsToFetch = photoPaths.filter(path => !signedUrls.has(path));
    
    if (pathsToFetch.length === 0) return;

    const fetchSignedUrls = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data, error: fnError } = await supabase.functions.invoke('get-photo-url', {
          body: { filePaths: pathsToFetch },
        });

        if (fnError) throw fnError;

        if (data?.urls) {
          setSignedUrls(prev => {
            const newMap = new Map(prev);
            data.urls.forEach((item: SignedUrl) => {
              newMap.set(item.path, item.url);
            });
            return newMap;
          });
        }
      } catch (err) {
        console.error('Error fetching signed URLs:', err);
        setError(err instanceof Error ? err.message : 'Failed to load photos');
      } finally {
        setLoading(false);
      }
    };

    fetchSignedUrls();
  }, [photoPaths]);

  return { signedUrls, loading, error };
}

// Helper to get a single signed URL
export async function getSignedPhotoUrl(filePath: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke('get-photo-url', {
      body: { filePath },
    });

    if (error) throw error;
    return data?.url || null;
  } catch (err) {
    console.error('Error getting signed URL:', err);
    return null;
  }
}
