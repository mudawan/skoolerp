import React, { useState } from 'react';
import { User } from 'lucide-react';

interface StudentAvatarProps {
  photoUrl?: string;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export const StudentAvatar: React.FC<StudentAvatarProps> = ({
  photoUrl,
  name,
  size = 'md',
  className = '',
}) => {
  const [imgError, setImgError] = useState(false);

  const sizeClasses = {
    xs: 'w-6 h-6 text-[10px]',
    sm: 'w-8 h-8 text-xs',
    md: 'w-9 h-9 text-xs font-bold',
    lg: 'w-14 h-14 text-base font-bold',
    xl: 'w-24 h-24 text-2xl font-bold',
  };

  const iconSizes = {
    xs: 'w-3 h-3',
    sm: 'w-4 h-4',
    md: 'w-4 h-4',
    lg: 'w-7 h-7',
    xl: 'w-10 h-10',
  };

  const getInitials = (str: string) => {
    if (!str) return '';
    const parts = str.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  };

  const initials = getInitials(name);

  if (photoUrl && !imgError) {
    return (
      <div
        className={`rounded-full bg-slate-100 border border-slate-200/80 overflow-hidden shrink-0 flex items-center justify-center shadow-xs ${sizeClasses[size]} ${className}`}
      >
        <img
          src={photoUrl}
          alt={name}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }

  // Fallback initial badge with clean modern teal theme
  return (
    <div
      className={`rounded-full bg-teal-50 border border-teal-200/90 text-teal-700 font-bold flex items-center justify-center shrink-0 select-none shadow-2xs ${sizeClasses[size]} ${className}`}
      title={name}
    >
      {initials ? initials : <User className={`${iconSizes[size]} text-teal-500`} />}
    </div>
  );
};
