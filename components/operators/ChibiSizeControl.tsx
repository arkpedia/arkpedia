export default function ChibiSizeControl({ size, onChange, compact = false }: { size: number; onChange: (size: number) => void; compact?: boolean }) {
  return <div className={`chibi-size-control${compact ? ' compact' : ''}`} role="group" aria-label="Chibi size">
    {!compact && <label htmlFor="chibi-viewer-size">Size</label>}
    <button type="button" className="ghost btn-icon btn-sm" aria-label="Make chibi smaller" disabled={size <= 50} onClick={() => onChange(Math.max(50, size - 25))}>−</button>
    {!compact && <input id="chibi-viewer-size" type="range" min={50} max={200} step={25} value={size} onChange={event => onChange(Number(event.target.value))} />}
    {!compact && <output aria-label="Chibi size percentage">{size}%</output>}
    <button type="button" className="ghost btn-icon btn-sm" aria-label="Make chibi larger" disabled={size >= 200} onClick={() => onChange(Math.min(200, size + 25))}>+</button>
  </div>;
}
