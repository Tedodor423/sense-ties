import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Camera, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useSignedPhotoUrls } from '@/hooks/useSignedPhotoUrls';
import { ImageCropEditor } from './ImageCropEditor';

interface ChildAvatarUploadProps {
  childId: string;
  childName: string;
  currentAvatarPath: string | null;
  onAvatarChange: (path: string | null) => void;
}

export function ChildAvatarUpload({
  childId,
  childName,
  currentAvatarPath,
  onAvatarChange,
}: ChildAvatarUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showCropEditor, setShowCropEditor] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { signedUrls } = useSignedPhotoUrls(currentAvatarPath ? [currentAvatarPath] : []);
  const avatarUrl = currentAvatarPath ? signedUrls.get(currentAvatarPath) : null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    // Open crop editor
    setSelectedFile(file);
    setShowCropEditor(true);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    setShowCropEditor(false);
    setSelectedFile(null);
    setUploading(true);

    try {
      // Create FormData for upload with cropped image
      const formData = new FormData();
      formData.append('file', croppedBlob, `avatar_${childId}_${Date.now()}.jpg`);
      formData.append('childId', childId);

      // Get current session for auth
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `https://wudwwgobdpimqbgjypvq.supabase.co/functions/v1/upload-photo`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          body: formData,
        }
      );

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      if (data?.fileName) {
        onAvatarChange(data.fileName);
        toast.success('Avatar uploaded successfully!');
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.message || 'Failed to upload avatar');
    } finally {
      setUploading(false);
    }
  };

  const handleCropCancel = () => {
    setShowCropEditor(false);
    setSelectedFile(null);
  };

  const handleRemoveAvatar = () => {
    onAvatarChange(null);
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <Avatar className="h-20 w-20">
          <AvatarImage src={avatarUrl || undefined} alt={childName} />
          <AvatarFallback className="text-lg bg-primary/10 text-primary">
            {getInitials(childName || 'C')}
          </AvatarFallback>
        </Avatar>
        {currentAvatarPath && (
          <Button
            variant="destructive"
            size="icon"
            className="absolute -top-1 -right-1 h-6 w-6 rounded-full"
            onClick={handleRemoveAvatar}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
      
      <div className="space-y-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="rounded-xl"
        >
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Camera className="h-4 w-4 mr-2" />
              {currentAvatarPath ? 'Change Photo' : 'Add Photo'}
            </>
          )}
        </Button>
        <p className="text-xs text-muted-foreground">Max 5MB, JPG or PNG</p>
      </div>

      {selectedFile && (
        <ImageCropEditor
          imageFile={selectedFile}
          open={showCropEditor}
          onClose={handleCropCancel}
          onCropComplete={handleCropComplete}
        />
      )}
    </div>
  );
}
