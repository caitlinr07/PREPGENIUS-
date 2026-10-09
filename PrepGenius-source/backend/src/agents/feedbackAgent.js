function generateFeedback({ score, correct, total, weakTopics = [], studentName = 'Student' }) {
  if (score >= 80) {
    return `${studentName}, your quiz score is ${score}% and you are showing strong mastery. Keep reinforcing ${weakTopics[0] || 'your key weak area'} with short review bursts.`;
  }

  if (score >= 60) {
    return `${studentName}, you reached ${score}% and are improving. Focus your next revision on ${weakTopics[0] || 'your most challenging topic'} and revisit the questions you missed.`;
  }

  return `${studentName}, you scored ${score}% on this practice round. The most important next step is to revisit ${weakTopics[0] || 'the concepts you missed'} and use the short explanation notes before retaking a brief quiz.`;
}

function generateMisconceptionLesson({ topic, explanationOfTrap }) {
  return `Mini-lesson for ${topic}: ${explanationOfTrap} Rework the solution one step at a time, then verify it against the original problem.`;
}

module.exports = {
  generateFeedback,
  generateMisconceptionLesson
};
