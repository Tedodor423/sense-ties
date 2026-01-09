import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    
    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { filePath, filePaths } = await req.json();
    
    // Support both single file and multiple files
    const pathsToSign = filePaths || (filePath ? [filePath] : []);
    
    if (pathsToSign.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No file path(s) provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Generating signed URLs for:', pathsToSign);

    // AUTHORIZATION CHECK: Verify user has access to all requested photos
    // Path format: userId/childId/timestamp-uuid.ext
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const childIdsToCheck = new Set<string>();

    for (const path of pathsToSign) {
      const pathParts = path.split('/');
      if (pathParts.length < 2) {
        return new Response(
          JSON.stringify({ error: 'Invalid file path format' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      const childId = pathParts[1];
      if (!uuidRegex.test(childId)) {
        return new Response(
          JSON.stringify({ error: 'Invalid childId in file path' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      childIdsToCheck.add(childId);
    }

    // Check access for all unique child IDs using RLS
    for (const childId of childIdsToCheck) {
      const { data: childData, error: childError } = await supabaseClient
        .from('children')
        .select('id')
        .eq('id', childId)
        .single();

      if (childError || !childData) {
        console.error('Photo access denied for user:', user.id, 'child:', childId);
        return new Response(
          JSON.stringify({ error: 'Access denied to requested photo(s)' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log('Access verified for', childIdsToCheck.size, 'child(ren)');

    // Get Backblaze credentials
    const keyId = Deno.env.get('B2_KEY_ID');
    const applicationKey = Deno.env.get('B2_APPLICATION_KEY');
    const bucketName = Deno.env.get('B2_BUCKET_NAME');
    const endpoint = Deno.env.get('B2_ENDPOINT');

    if (!keyId || !applicationKey || !bucketName || !endpoint) {
      console.error('Missing Backblaze configuration');
      return new Response(
        JSON.stringify({ error: 'Storage not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate presigned URLs for each file
    const signedUrls: { path: string; url: string }[] = [];
    const expiresIn = 3600; // 1 hour

    for (const path of pathsToSign) {
      // Generate presigned URL using AWS Signature v4
      const now = new Date();
      const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
      const dateStamp = amzDate.slice(0, 8);
      
      // Extract region from endpoint
      const regionMatch = endpoint.match(/s3\.([^.]+)\.backblazeb2\.com/);
      const region = regionMatch ? regionMatch[1] : 'us-west-004';

      const service = 's3';
      const algorithm = 'AWS4-HMAC-SHA256';
      const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
      const signedHeaders = 'host';
      
      // Build canonical query string for presigned URL
      const canonicalUri = `/${bucketName}/${path}`;
      const queryParams = new URLSearchParams({
        'X-Amz-Algorithm': algorithm,
        'X-Amz-Credential': `${keyId}/${credentialScope}`,
        'X-Amz-Date': amzDate,
        'X-Amz-Expires': expiresIn.toString(),
        'X-Amz-SignedHeaders': signedHeaders,
      });
      
      // Sort query parameters
      const sortedParams = new URLSearchParams([...queryParams.entries()].sort());
      const canonicalQueryString = sortedParams.toString();
      
      const canonicalHeaders = `host:${endpoint}\n`;
      
      const canonicalRequest = 
        `GET\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\nUNSIGNED-PAYLOAD`;

      // String to sign
      const encoder = new TextEncoder();
      const canonicalRequestHash = Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(canonicalRequest)))
      ).map(b => b.toString(16).padStart(2, '0')).join('');

      const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;

      // Signing key
      async function hmacSha256(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
        const keyData = key instanceof Uint8Array ? key : new Uint8Array(key);
        const cryptoKey = await crypto.subtle.importKey(
          'raw',
          keyData as BufferSource,
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        );
        return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
      }

      const kDate = await hmacSha256(encoder.encode(`AWS4${applicationKey}`).buffer, dateStamp);
      const kRegion = await hmacSha256(kDate, region);
      const kService = await hmacSha256(kRegion, service);
      const kSigning = await hmacSha256(kService, 'aws4_request');
      
      const signatureBuffer = await hmacSha256(kSigning, stringToSign);
      const signature = Array.from(new Uint8Array(signatureBuffer))
        .map(b => b.toString(16).padStart(2, '0')).join('');

      // Build the final presigned URL
      const presignedUrl = `https://${endpoint}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
      
      signedUrls.push({ path, url: presignedUrl });
    }

    console.log('Generated', signedUrls.length, 'signed URLs');

    // Return single URL or array based on input
    if (filePath && !filePaths) {
      return new Response(
        JSON.stringify({ url: signedUrls[0].url }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ urls: signedUrls }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error generating signed URL:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
