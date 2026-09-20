import { SectionHelp } from './SectionHelp';

export function SkinsHelp() {
  return <SectionHelp title="Save for skins" links={[{label:'skin selector',selector:'.pulls-skin-browser'},{label:'extra OP reserve',selector:'.pulls-skin-extra'}]}>
    <ol><li>Choose an upcoming event shop rotation.</li><li>Click an outfit to add it to Your skins. Click it again to remove it.</li><li>Compare the total cost with your current OP and the forecasts for each shop window.</li></ol>
    <p>Only outfits explicitly listed for that shop rotation can be added, including its named returns. A Fashion Review draw or an earlier release does not mean an outfit is on sale for OP.</p>
    <p>Estimated rotations use recorded CN shop lists and their dates relative to the scheduled Global event opening. Global lists and dates may differ. Where separate shop dates are unknown, the event window is used as an estimate.</p>
    <p>Each skin is counted once, at its earliest known upcoming shop closing date. The forecast includes earlier selected skins and your extra reserve. Skins without a future shop date remain in the wishlist and are reserved up front, but their availability is unknown.</p>
    <p>All selected skin costs are reserved before calculating your banner pull budgets. The OP forecast assumes the income and event rewards you enabled; check banner shortfalls in your pull plan too. Orundum and permits cannot buy skins.</p>
    <p>Use Extra OP reserve for other purchases. Free outfits and other currencies are excluded. If a saved skin has no current price, remove it and enter its cost in the extra reserve.</p>
  </SectionHelp>;
}
