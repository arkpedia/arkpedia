import { useEffect, useRef, useState } from 'react';
import ImportDialog from '@/components/account/ImportDialog';
import AudioSettings from './AudioSettings';
export const openAudioSettings = () => window.dispatchEvent(new Event('arkpedia:audio-settings'));
export default function AudioSettingsDialog() {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const show = () => { opener.current = document.activeElement as HTMLElement | null; setOpen(true); };
    window.addEventListener('arkpedia:audio-settings', show);
    return () => window.removeEventListener('arkpedia:audio-settings', show);
  }, []);
  return open ? <ImportDialog title="Audio settings" onClose={() => { setOpen(false); requestAnimationFrame(() => { const target = opener.current?.isConnected ? opener.current : document.querySelector<HTMLElement>('.music-collapse-toggle'); target?.focus(); }); }}><AudioSettings /></ImportDialog> : null;
}
