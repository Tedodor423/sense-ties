import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SignedUrl {
  path: string;
  url: string;
}

export function useSignedPhotoUrls(photoPaths: string[] | null | undefined) {
  const [signedUrls, setSignedUrls] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Use a ref to track previously fetched paths to avoid infinite loops
  const fetchedPathsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!photoPaths || photoPaths.length === 0) {
      return;
    }

    // Filter out paths we already fetched
    const pathsToFetch = photoPaths.filter(path => !fetchedPathsRef.current.has(path));
    
    if (pathsToFetch.length === 0) return;

    const fetchSignedUrls = async () => {
      setLoading(true);
      setError(null);

      // Mark paths as being fetched
      pathsToFetch.forEach(path => fetchedPathsRef.current.add(path));

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
        // Remove failed paths so they can be retried
        pathsToFetch.forEach(path => fetchedPathsRef.current.delete(path));
      } finally {
        setLoading(false);
      }
    };

    fetchSignedUrls();
  }, [photoPaths?.join(',')]); // Use stable string comparison

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
