
interface AvatarProps {
  name: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  shape?: 'circle' | 'square';
  className?: string;
  id?: number;
}

const colorPairs = [
  ['#fcd34d', '#f59e0b'], // amber
  ['#86efac', '#22c55e'], // green
  ['#93c5fd', '#3b82f6'], // blue
  ['#c4b5fd', '#8b5cf6'], // violet
  ['#f9a8d4', '#ec4899'], // pink
  ['#fca5a5', '#ef4444'], // red
  ['#5eead4', '#14b8a6'], // teal
];

const getInitials = (name: string) => {
  if (!name) return 'L';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 1).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};

const hashString = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
};

import { useState } from 'react';

export default function Avatar({ name, src, size = 'md', shape = 'circle', className = '', id }: AvatarProps) {
  const [imageError, setImageError] = useState(false);
  
  const initials = getInitials(name);
  const hash = id != null ? id : hashString(name);
  const colorPair = colorPairs[hash % colorPairs.length];

  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-lg',
  };

  const shapeClasses = {
    circle: 'rounded-full',
    square: 'rounded-xl',
  };

  const baseClasses = `flex items-center justify-center font-bold text-white shadow-sm shrink-0 overflow-hidden ${sizeClasses[size]} ${shapeClasses[shape]} ${className}`;

  if (src && !imageError) {
    return (
      <img
        src={src}
        alt={name}
        title={name}
        className={`${baseClasses} object-cover`}
        onError={() => setImageError(true)}
      />
    );
  }

  return (
    <div
      className={baseClasses}
      style={{ background: `linear-gradient(135deg, ${colorPair[0]}, ${colorPair[1]})` }}
      title={name}
    >
      {initials}
    </div>
  );
}
