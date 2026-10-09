function normalizeScores(rawScores) {
  if (Array.isArray(rawScores)) {
    return rawScores.map((entry) => ({
      topic: entry.topic || entry.name || 'General topic',
      score: Number(entry.score ?? entry.percentage ?? entry.value ?? 0),
      maxScore: Number(entry.maxScore ?? 100)
    }));
  }

  if (rawScores && typeof rawScores === 'object') {
    return Object.entries(rawScores).map(([topic, score]) => ({
      topic,
      score: Number(score),
      maxScore: 100
    }));
  }

  return [];
}

function analyzePerformance(scores, profileMastery = {}) {
  const normalized = normalizeScores(scores);

  if (!normalized.length) {
    return {
      summary: 'No quiz data was provided yet.',
      weakTopics: [],
      topicScores: [],
      averageScore: 0
    };
  }

  const topicScores = normalized.map((entry) => {
    const observedScore = Number.isFinite(entry.score) ? Math.max(0, Math.min(100, entry.score)) : 0;
    return {
      topic: entry.topic,
      score: observedScore,
      gap: 100 - observedScore,
      mastery: Number.isFinite(profileMastery[entry.topic]) ? profileMastery[entry.topic] : observedScore
    };
  });

  const weakTopics = topicScores
    .filter((item) => item.score < 70)
    .sort((a, b) => a.score - b.score)
    .map((item) => ({
      topic: item.topic,
      score: item.score,
      gap: item.gap,
      confidence: Number((0.75 + (70 - item.score) / 100).toFixed(2))
    }));

  const averageScore = Math.round(topicScores.reduce((sum, item) => sum + item.score, 0) / topicScores.length);

  return {
    summary: weakTopics.length
      ? `You are strongest in ${topicScores.filter((item) => item.score >= 70).length || 0} topics and need support in ${weakTopics.length} weak areas.`
      : 'You are performing well across all topics.',
    weakTopics,
    topicScores,
    averageScore
  };
}

module.exports = {
  analyzePerformance
};
