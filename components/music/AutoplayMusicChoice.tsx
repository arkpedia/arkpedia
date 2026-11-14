import InfoPopover from '@/components/ui/InfoPopover';
export default function AutoplayMusicChoice({checked,onChange,disabled=false}:{kind:'event';checked:boolean;onChange:(value:boolean)=>void;disabled?:boolean}){
  return <div className="account-shortcuts media-autoplay-choice">
    <label className="check"><input type="checkbox" checked={checked} disabled={disabled} onChange={event=>onChange(event.target.checked)} />Event Music</label>
    <InfoPopover label="How event music works">
      <p>Original entrance sound effects play during the animation. The event’s lobby music begins when the animation ends, when a recording is available.</p>
      <p>Your personal music pauses during the event and resumes from the same position when you leave. A player that was already paused stays paused. You can choose to play your own music instead.</p>
      <p>If autoplay is blocked, choose Play event music in the mini-player or Settings. Music outside events is controlled by the music player.</p>
    </InfoPopover>
  </div>;
}
