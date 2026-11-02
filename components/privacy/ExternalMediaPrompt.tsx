import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import ImportDialog from '@/components/account/ImportDialog';
import XButton from '@/components/ui/XButton';
import AutoplayMusicChoice from '@/components/music/AutoplayMusicChoice';
import { setSetting } from '@/lib/settings/siteSettings';
import { MEDIA_REQUEST, readPrivacy, readAnalyticsDecision, savePrivacy, useMediaDecision, dismissMediaPrompt, type MediaRequest } from '@/lib/privacy/preferences';
export default function ExternalMediaPrompt() {
  const {pathname}=useRouter(),decided=useMediaDecision();
  const [request,setRequest]=useState<MediaRequest|null>(null),[background,setBackground]=useState(false),[events,setEvents]=useState(false),[error,setError]=useState('');
  useEffect(()=>{
    const open=(event:Event)=>{setError('');setRequest((event as CustomEvent<MediaRequest>).detail);};
    window.addEventListener(MEDIA_REQUEST,open);return()=>window.removeEventListener(MEDIA_REQUEST,open);
  },[]);
  if(!request&&(decided||pathname==='/cookies'))return null;
  const choose=(allow:boolean)=>{
    try {
      savePrivacy({...readPrivacy(),externalMedia:allow},readAnalyticsDecision(),true);
      setSetting('backgroundMusic',allow&&background);
      setSetting('eventMusic',allow&&events);
    }catch{
      if(allow){setError('This browser could not save your choice. External media remains off.');return;}
      dismissMediaPrompt();
    }
    setRequest(null);if(allow)request?.allow();else request?.cancel?.();
  };
  const content=<>
    <p>Allow YouTube and Monster Siren music and videos? These providers receive connection information, including your IP address, and may use their own cookies or storage.</p>
    <AutoplayMusicChoice kind="background" checked={background} onChange={setBackground} />
    <AutoplayMusicChoice kind="event" checked={events} onChange={setEvents} />
    <div className="statistics-prompt-actions"><button type="button" className="ghost btn-sm" onClick={()=>choose(true)}>{request ? 'Allow external media' : 'Allow music playback'}</button><button type="button" className="ghost btn-sm" onClick={()=>choose(false)}>No thanks</button></div>
    <Link href="/cookies" onClick={()=>{request?.cancel?.();setRequest(null);}}>Privacy choices</Link>
    {error&&<p role="alert">{error}</p>}
  </>;
  if(request)return <ImportDialog title="Allow external media?" onClose={()=>choose(false)}><div className="reading-copy">{content}</div></ImportDialog>;
  return <section className="statistics-prompt media-choice-prompt panel reading-copy" role="region" aria-label="Music playback choice">
    <div className="statistics-prompt-heading"><h2 className="entity-title entity-title-sm">Allow music playback?</h2><XButton label="No thanks, close media prompt" onClick={()=>choose(false)} /></div>
    {content}
  </section>;
}
