const energyBuckets = {
  Morning: { start: 6, end: 12, label: '9:00 AM' },
  Afternoon: { start: 12, end: 17, label: '2:00 PM' },
  Evening: { start: 17, end: 22, label: '7:00 PM' }
};

function getEnergyProfile(quizHistory = []) {
  const buckets = Object.fromEntries(Object.keys(energyBuckets).map((bucket) => [bucket, { total: 0, count: 0 }]));
  for (const result of quizHistory) {
    const date = new Date(result.timestamp || result.date);
    const score = Number(result.score);
    if (!Number.isFinite(date.getTime()) || !Number.isFinite(score)) continue;
    const hour = date.getHours();
    const bucket = Object.entries(energyBuckets).find(([, range]) => hour >= range.start && hour < range.end)?.[0];
    if (bucket) {
      buckets[bucket].total += score;
      buckets[bucket].count += 1;
    }
  }

  const averages = Object.fromEntries(Object.entries(buckets).map(([bucket, values]) => [
    bucket,
    values.count ? values.total / values.count : null
  ]));
  const observed = Object.entries(averages).filter(([, average]) => average !== null);
  const peak = observed.length
    ? observed.reduce((best, current) => current[1] > best[1] ? current : best)[0]
    : 'Morning';
  const low = observed.length > 1
    ? observed.reduce((worst, current) => current[1] < worst[1] ? current : worst)[0]
    : peak === 'Morning' ? 'Evening' : 'Morning';
  const overall = observed.length
    ? observed.reduce((sum, [, average]) => sum + average, 0) / observed.length
    : null;

  return { peak, low, averages, overall, sampleCount: observed.reduce((sum, [bucket]) => sum + buckets[bucket].count, 0) };
}

function buildRevisionSchedule(weakTopics = [], examDate, availability = '3 days a week', quizHistory = []) {
  const energy = getEnergyProfile(quizHistory);
  const startDate = new Date();
  const schedule = weakTopics.slice(0, 5).map((item, index) => {
    const topic = typeof item === 'string' ? item : item.topic;
    const score = Number(typeof item === 'object' ? item.score : 0);
    const difficultyLevel = score < 50 ? 'Hard' : score >= 70 ? 'Easy' : 'Medium';
    const window = difficultyLevel === 'Hard' ? energy.peak : difficultyLevel === 'Easy' ? energy.low : 'Afternoon';
    const optimalTimeOfDay = energyBuckets[window].label;
    const scheduled = new Date(startDate);
    scheduled.setDate(startDate.getDate() + index);
    const scheduledDate = scheduled.toISOString().slice(0, 10);
    const average = energy.averages[energy.peak];
    const difference = energy.overall === null ? null : Math.round(average - energy.overall);
    const insight = difficultyLevel === 'Hard' && energy.sampleCount && difference > 0
      ? `Scheduled at ${optimalTimeOfDay} because your ${energy.peak.toLowerCase()} quiz accuracy is ${difference}% above your average.`
      : difficultyLevel === 'Hard' && !energy.sampleCount
        ? 'Morning is the default deep-work window until more time-stamped quiz results are available.'
        : difficultyLevel === 'Easy'
          ? `Quick review placed in your lower-energy ${window.toLowerCase()} window.`
          : `Focused practice placed in the afternoon between deep-work and review blocks.`;

    return {
      day: `Day ${index + 1}`,
      scheduledDate,
      taskId: `${scheduledDate}:${topic}`,
      topic,
      task: difficultyLevel === 'Hard'
        ? `Deep work: review ${topic}, work through examples, then answer 5 recall questions.`
        : `Review ${topic}, make quick notes, then answer 5 recall questions.`,
      focus: index === 0 ? 'high priority' : 'follow-up review',
      difficultyLevel,
      optimalTimeOfDay,
      slotType: difficultyLevel === 'Hard' ? 'Deep Work Slot' : difficultyLevel === 'Easy' ? 'Quick Review Slot' : 'Focused Practice',
      insight
    };
  });

  if (weakTopics.length > 5) {
    schedule.push({
      day: 'Day 6',
      scheduledDate: new Date(startDate.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      taskId: `${new Date(startDate.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}:Mixed review`,
      topic: 'Mixed review',
      task: 'Retry the weakest concept set and check mastery before the exam.',
      focus: 'final recap',
      difficultyLevel: 'Easy',
      optimalTimeOfDay: energyBuckets[energy.low].label,
      durationMinutes: 60,
      slotType: 'Quick Review Slot',
      insight: `Quick review placed in your lower-energy ${energy.low.toLowerCase()} window.`
    });
  }

  return {
    examDate: examDate || 'Not provided',
    availability,
    schedule,
    peakEnergyWindow: energy.peak,
    lowEnergyWindow: energy.low,
    energyAverages: energy.averages,
    energySampleCount: energy.sampleCount
  };
}

module.exports = {
  buildRevisionSchedule,
  getEnergyProfile
};
