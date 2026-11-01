import InfoPopover from '@/components/ui/InfoPopover';
export default function AutoplayMusicChoice({checked,onChange,disabled=false}:{checked:boolean;onChange:(value:boolean)=>void;disabled?:boolean}){
  return <div className="account-shortcuts media-autoplay-choice">
    <label className="check"><input type="checkbox" checked={checked} disabled={disabled} onChange={event=>onChange(event.target.checked)} />Allow autoplaying music</label>
    <InfoPopover label="How automatic music works">
      <p>A quiet menu theme continues as you browse. Events use their own lobby music; leaving returns to the menu theme.</p>
      <p>Your music takes priority. Pausing it allows background music. Music Guesser stays quiet for its clips.</p>
      <p>Control this in Settings → Background music. If autoplay is blocked, choose Play background music in the mini-player or Settings.</p>
    </InfoPopover>
  </div>;
}
