import InfoPopover from '@/components/ui/InfoPopover';
export default function AutoplayMusicChoice({checked,onChange,disabled=false}:{checked:boolean;onChange:(value:boolean)=>void;disabled?:boolean}){
  return <div className="account-shortcuts media-autoplay-choice">
    <label className="check"><input type="checkbox" checked={checked} disabled={disabled} onChange={event=>onChange(event.target.checked)} />Allow autoplaying music</label>
    <InfoPopover label="How automatic music works">
      <p>The homepage plays a quiet menu theme. Event pages play their lobby music, including upcoming events with released recordings.</p>
      <p>Page-started music stops when you leave. Your own playback always takes priority; pausing automatic music stops further autoplay for this tab visit.</p>
      <p>Your browser may still require a tap on Play. You can change this in Privacy choices.</p>
    </InfoPopover>
  </div>;
}
