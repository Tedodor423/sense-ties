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

    console.log('User authenticated:', user.id);

    // Parse the multipart form data
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const childId = formData.get('childId') as string;

    if (!file) {
      return new Response(
        JSON.stringify({ error: 'No file provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Uploading file:', file.name, 'Size:', file.size, 'Type:', file.type);

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

    // Generate unique filename
    const timestamp = Date.now();
    const randomId = crypto.randomUUID().slice(0, 8);
    const extension = file.name.split('.').pop() || 'jpg';
    const fileName = `${user.id}/${childId}/${timestamp}-${randomId}.${extension}`;

    console.log('Uploading to path:', fileName);

    // Read file content
    const fileBuffer = await file.arrayBuffer();
    const fileBytes = new Uint8Array(fileBuffer);

    // Create S3-compatible upload URL
    const uploadUrl = `https://${endpoint}/${bucketName}/${fileName}`;

    // Calculate SHA256 hash for content verification
    const hashBuffer = await crypto.subtle.digest('SHA-256', fileBytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const sha256Hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Create date strings for AWS Signature v4
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    
    // Extract region from endpoint (e.g., s3.us-west-004.backblazeb2.com -> us-west-004)
    const regionMatch = endpoint.match(/s3\.([^.]+)\.backblazeb2\.com/);
    const region = regionMatch ? regionMatch[1] : 'us-west-004';

    // AWS Signature Version 4 signing
    const service = 's3';
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';

    // Canonical request
    const canonicalUri = `/${bucketName}/${fileName}`;
    const canonicalQueryString = '';
    const canonicalHeaders = 
      `content-type:${file.type}\n` +
      `host:${endpoint}\n` +
      `x-amz-content-sha256:${sha256Hash}\n` +
      `x-amz-date:${amzDate}\n`;
    
    const canonicalRequest = 
      `PUT\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${sha256Hash}`;

    // String to sign
    const canonicalRequestHash = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalRequest)))
    ).map(b => b.toString(16).padStart(2, '0')).join('');

    const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;

    // Signing key
    const encoder = new TextEncoder();
    
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

    const authorizationHeader = 
      `${algorithm} Credential=${keyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    // Upload to Backblaze B2
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type,
        'x-amz-date': amzDate,
        'x-amz-content-sha256': sha256Hash,
        'Authorization': authorizationHeader,
      },
      body: fileBytes,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('Backblaze upload error:', uploadResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to upload file', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Construct the public URL
    const publicUrl = `https://${bucketName}.${endpoint}/${fileName}`;
    
    console.log('Upload successful:', publicUrl);

    return new Response(
      JSON.stringify({ 
        success: true, 
        url: publicUrl,
        fileName: fileName
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Upload error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
