import { useEffect, useState } from 'react';

interface ContactAvatarProps {
  name?: string | null;
  profilePicUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  rounded?: 'full' | 'lg' | '2xl';
}

const sizeClasses = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-11 h-11 text-sm',
  lg: 'w-16 h-16 text-2xl',
};

export function ContactAvatar({
  name,
  profilePicUrl,
  size = 'md',
  className = '',
  rounded = 'full',
}: ContactAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const initial = name?.charAt(0).toUpperCase() || '?';
  const roundedClass = rounded === 'full' ? 'rounded-full' : rounded === 'lg' ? 'rounded-lg' : 'rounded-2xl';
  const showImage = Boolean(profilePicUrl) && !imgFailed;

  useEffect(() => {
    setImgFailed(false);
  }, [profilePicUrl]);

  if (showImage) {
    return (
      <img
        key={profilePicUrl}
        src={profilePicUrl!}
        alt={name || 'Contato'}
        // WhatsApp CDN e alguns proxies bloqueiam hotlink com referrer.
        referrerPolicy="no-referrer"
        loading="lazy"
        decoding="async"
        className={`${sizeClasses[size]} ${roundedClass} object-cover flex-shrink-0 ${className}`}
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} ${roundedClass} bg-gradient-to-br from-ink-600 to-ink-700 flex items-center justify-center font-semibold text-ink-100 flex-shrink-0 ${className}`}
    >
      {initial}
    </div>
  );
}
