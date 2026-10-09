import { useEffect, useState } from 'react';

function FlashcardView({ cards = [] }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = cards[currentIndex];

  useEffect(() => {
    setCurrentIndex(0);
    setFlipped(false);
  }, [cards]);

  if (!cards.length) {
    return <div className="empty-panel">No recent incorrect answers yet. Complete a practice quiz to build personalized cards.</div>;
  }

  const move = (direction) => {
    setCurrentIndex((index) => (index + direction + cards.length) % cards.length);
    setFlipped(false);
  };

  return (
    <section className="flashcard-view" aria-label="Personalized flashcards">
      <div className="flashcard-toolbar">
        <span>{card.sourceTopic}</span>
        <span>{currentIndex + 1} / {cards.length}</span>
      </div>
      <button
        className={`flashcard ${flipped ? 'is-flipped' : ''}`}
        type="button"
        onClick={() => setFlipped((value) => !value)}
        aria-label={flipped ? 'Show flashcard front' : 'Reveal flashcard answer'}
      >
        <span className="flashcard-inner">
          <span className="flashcard-face flashcard-front">
            <span className="flashcard-label">Recall</span>
            <strong>{card.front}</strong>
            <small>Click to reveal</small>
          </span>
          <span className="flashcard-face flashcard-back">
            <span className="flashcard-label">Correct logic + mnemonic</span>
            <span>{card.back}</span>
            <small>Click to return</small>
          </span>
        </span>
      </button>
      <div className="flashcard-controls">
        <button className="secondary" type="button" onClick={() => move(-1)}>Previous</button>
        <button className="primary" type="button" onClick={() => move(1)}>Next card</button>
      </div>
    </section>
  );
}

export default FlashcardView;