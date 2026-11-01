import InfoPopover from '@/components/ui/InfoPopover';
export default function AutoplayMusicChoice({checked,onChange,disabled=false}:{checked:boolean;onChange:(value:boolean)=>void;disabled?:boolean}){
  return <div className="account-shortcuts media-autoplay-choice">
    <label className="check"><input type="checkbox" checked={checked} disabled={disabled} onChange={event=>onChange(event.target.checked)} />Allow autoplaying music</label>
    <InfoPopover label="How automatic music works">
      <p>The homepage plays a quiet menu theme. Event pages play their lobby music, including upcoming events with released recordings.</p>
      <p>Page music stops when you leave. Turn it on or off in Settings → Background music. It stays separate from your music player: playing music takes priority, while a paused player lets the page theme play.</p>
      <p>If your browser blocks autoplay, open Settings and choose Play background music.</p>
    </InfoPopover>
  </div>;
}
