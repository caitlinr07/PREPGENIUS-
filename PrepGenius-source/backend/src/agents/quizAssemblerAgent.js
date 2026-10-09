function buildQuiz(questionPool = []) {
  const items = [...questionPool];
  const selected = items.slice(0, Math.min(8, items.length));

  return selected.map((item, index) => ({
    id: item.id || `q-${index + 1}`,
    topic: item.topic || 'General topic',
    question: item.question,
    options: item.options || [],
    correctAnswer: item.correctAnswer || item.answer,
    difficulty: item.difficulty || 'medium'
  }));
}

module.exports = {
  buildQuiz
};
