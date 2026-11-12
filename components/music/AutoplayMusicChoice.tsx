import InfoPopover from '@/components/ui/InfoPopover';
export default function AutoplayMusicChoice({kind,checked,onChange,disabled=false}:{kind:'background'|'event';checked:boolean;onChange:(value:boolean)=>void;disabled?:boolean}){
  const background=kind==='background';
  return <div className="account-shortcuts media-autoplay-choice">
    <label className="check"><input type="checkbox" checked={checked} disabled={disabled} onChange={event=>onChange(event.target.checked)} />{background ? 'Background Music' : 'Event Music'}</label>
    <InfoPopover label={background ? 'How background music works' : 'How event music works'}>
      {background
        ? <p>Your chosen theme plays quietly as you browse, except on event pages. Choose it in Settings → Choose Background Music.</p>
        : <p>Event pages play their own lobby music quietly, when a recording is available. It stops when you leave. This works even when Background Music is off.</p>}
      <p>Your music takes priority. Pausing it allows background music. Music Guesser stays quiet for its clips.</p>
      <p>Both options are independent and can be changed in Settings. If autoplay is blocked, choose Play background music in the mini-player or Settings.</p>
    </InfoPopover>
  </div>;
}
