/**
 * Per-match format controls of one sport (doc/rules.md section 10), shared by the Score_Console format form and the
 * Sport setup "Customize format" disclosure. `onChange(key, value)` sets one format key; `onScoreText(text)` sets the
 * basketball scoring values text. `sideName(i)` adds the first-serve choice, which only a scheduled match has.
 */
export default function FormatSettings({ sport, format, scoreText, onChange, onScoreText, sideName }) {
  const number = (key, label, min, max) => <label className="format-field">{label}<input type="number" min={min} max={max} step="1" required value={Number.isNaN(format[key]) ? '' : format[key] ?? ''} onChange={e => onChange(key, e.target.value === '' ? NaN : Number(e.target.value))} /></label>;
  if (format.model === 'periods') return <div className="format-grid">
    {number('periodCount', 'Number of periods', 1, 12)}
    {sport === 'basketball' && <label className="format-field">Scoring values (separate with commas)<input value={scoreText} onChange={e => onScoreText(e.target.value)} /></label>}
  </div>;
  return <>
    <div className="format-grid">
      {number('bestOf', 'Best of (odd number of sets)', 1, 15)}
      {sideName && <label className="format-field">First serving side<select value={format.firstServe} onChange={e => onChange('firstServe', Number(e.target.value))}>{[0, 1].map(i => <option key={i} value={i}>{sideName(i)}</option>)}</select></label>}
      {format.model === 'sets' ? <>
        {number('target', 'Points to win a set', 1, 999)}
        {number('winBy', 'Winning margin', 1, 10)}
        {number('decidingTarget', 'Points in the deciding set', 1, 999)}
        <label className="format-field">Golden point at a tied score (optional)<input aria-label="Golden point at a tied score (optional)" aria-describedby="golden-point-hint" type="number" min="0" max="9998" value={format.cap == null ? '' : format.cap - 1} placeholder="No golden point" onChange={e => onChange('cap', e.target.value === '' ? null : Number(e.target.value) + 1)} /><span id="golden-point-hint" className="format-hint">{format.cap == null ? 'Play until the winning margin is reached.' : `At ${format.cap - 1}–${format.cap - 1}, the next point wins.`}</span></label>
      </> : <>
        {number('gamesPerSet', 'Games to win a set', 1, 20)}
        {number('gameWinBy', 'Winning margin in games', 1, 2)}
        <label className="format-field">Game scoring<select value={String(format.advantage)} onChange={e => onChange('advantage', e.target.value === 'true')}><option value="true">Advantage</option><option value="false">No-ad (deciding point at deuce)</option></select></label>
      </>}
    </div>
    {/* Tie-break settings form their own group, so no form section has more than six fields (Req 19.7). */}
    {format.model === 'tennis' && <fieldset className="format-group"><legend>Tie-break</legend><div className="format-grid">
      <label className="format-field">Tie-break at games all (optional)<input type="number" min="1" max="30" value={format.tiebreakAt ?? ''} placeholder="No tie-break" onChange={e => onChange('tiebreakAt', e.target.value === '' ? null : Number(e.target.value))} /></label>
      {number('tiebreakTo', 'Tie-break point target', 1, 99)}
      {number('tiebreakWinBy', 'Tie-break winning margin', 1, 10)}
    </div></fieldset>}
  </>;
}
