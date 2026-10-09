function RangeBar({ min, max, label }) {
  const safeMin = Math.max(0, Math.min(100, Number(min) || 0));
  const safeMax = Math.max(safeMin, Math.min(100, Number(max) || 0));
  return (
    <div className="forecast-range-row">
      <div className="forecast-range-label">
        <span>{label}</span>
        <strong>{safeMin}%–{safeMax}%</strong>
      </div>
      <div className="forecast-track" role="img" aria-label={`${label}: ${safeMin} to ${safeMax} percent, target 80 percent`}>
        <span className="forecast-target" />
        <span className="forecast-band" style={{ left: `${safeMin}%`, width: `${Math.max(1, safeMax - safeMin)}%` }} />
      </div>
    </div>
  );
}

function ScoreForecast({ prediction }) {
  if (!prediction) {
    return (
      <section className="forecast-card" aria-label="Score forecast">
        <div>
          <p className="eyebrow">Score forecast</p>
          <h3>Building your forecast</h3>
          <p>Submit a practice quiz to start a trend-based estimate.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="forecast-card" title={prediction.reasoning} aria-label={`Score forecast. ${prediction.reasoning}`}>
      <div className="forecast-heading">
        <div>
          <p className="eyebrow">Score forecast</p>
          <h3>Likely exam score</h3>
        </div>
        <span className={`trend-badge trend-${prediction.trend}`}>{prediction.trend}</span>
      </div>
      <RangeBar min={prediction.todayMin ?? prediction.min} max={prediction.todayMax ?? prediction.max} label="If you sat today" />
      <RangeBar min={prediction.afterPlanMin ?? prediction.min} max={prediction.afterPlanMax ?? prediction.max} label="After the current plan" />
      <div className="forecast-track-legend"><span>Target 80%</span><span>{prediction.sampleCount || 0} recent quiz results</span></div>
      <p className="forecast-reasoning">{prediction.reasoning}</p>
      <small>Updated {prediction.lastPredictionDate ? new Date(prediction.lastPredictionDate).toLocaleString() : 'today'}</small>
    </section>
  );
}

export default ScoreForecast;