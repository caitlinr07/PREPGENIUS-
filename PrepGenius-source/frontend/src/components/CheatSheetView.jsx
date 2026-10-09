function CheatSheetView({ cheatSheet }) {
  const sections = cheatSheet?.sections || [];

  if (!sections.length) {
    return <div className="empty-panel">Your cheat sheet will appear after a recent incorrect answer is recorded.</div>;
  }

  return (
    <section className="cheat-sheet-wrap">
      <div className="cheat-sheet-actions">
        <span>{sections.length} trouble {sections.length === 1 ? 'area' : 'areas'}</span>
        <button className="secondary" type="button" onClick={() => window.print()}>Print A4 sheet</button>
      </div>
      <article className="cheat-sheet-print">
        <header>
          <p className="eyebrow">Personalized review</p>
          <h2>{cheatSheet.title}</h2>
        </header>
        <div className="cheat-sheet-columns">
          {sections.map((section) => (
            <section className="cheat-sheet-section" key={section.topic}>
              <h3>{section.topic}</h3>
              <ul>
                {section.items.map((item, index) => <li key={`${section.topic}-${index}`}>{item}</li>)}
              </ul>
            </section>
          ))}
        </div>
      </article>
    </section>
  );
}

export default CheatSheetView;