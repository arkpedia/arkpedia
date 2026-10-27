import ProfileIcon from './ProfileIcon';
import { useProfileAvatar } from '@/lib/account/profileAvatar';

export default function ProfileAvatar({ size = 44, fallbackSize = size }: { size?: number; fallbackSize?: number }) {
  const avatar = useProfileAvatar();
  return avatar ? <ProfileIcon id={avatar} size={size} />
    : <svg width={fallbackSize} height={fallbackSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 22v-3a8 8 0 0 1 16 0v3" /></svg>;
}
