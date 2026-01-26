import { useState, useEffect } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User } from 'lucide-react';
import { getSignedPhotoUrl } from '@/hooks/useSignedPhotoUrls';
import { cn } from '@/lib/utils';

interface ChildAvatarProps {
  avatarPath: string | null | undefined;
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'h-8 w-8',
  md: 'h-12 w-12',
  lg: 'h-20 w-20',
};

const iconSizes = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-10 w-10',
};

export function ChildAvatar({ avatarPath, name, size = 'md', className }: ChildAvatarProps) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (avatarPath) {
      getSignedPhotoUrl(avatarPath).then(setAvatarUrl);
    } else {
      setAvatarUrl(null);
    }
  }, [avatarPath]);

  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <Avatar className={cn(sizeClasses[size], className)}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
      <AvatarFallback className="bg-primary/10">
        {avatarPath ? (
          initials || <User className={cn(iconSizes[size], 'text-primary')} />
        ) : (
          <User className={cn(iconSizes[size], 'text-primary')} />
        )}
      </AvatarFallback>
    </Avatar>
  );
}
