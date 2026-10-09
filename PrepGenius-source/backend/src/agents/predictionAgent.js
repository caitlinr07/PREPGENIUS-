const { createAIClient, getAIModel, hasOpenAICompatibleKey } = require('./aiClient');
const { getStudentProfile, updateStudent } = require('../memory/profileStore');

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function linearTrend(values) {
  if (values.length < 2) return { slope: 0, estimate: values[values.length - 1] || 0 };
  const xMean = (values.length - 1) / 2;
  const yMean = values.reduce((sum, score) => sum + score, 0) / values.length;
  const numerator = values.reduce((sum, score, index) => sum + (index - xMean) * (score - yMean), 0);
  const denominator = values.reduce((sum, _, index) => sum + (index - xMean) ** 2, 0);
  const slope = denominator ? numerator / denominator : 0;
  return { slope, estimate: yMean + slope * (values.length - 1) };
}

function standardDeviation(values) {
  if (values.length < 2) return 6;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
}

function getDaysRemaining(examDate) {
  if (!examDate) return 0;
  const exam = new Date(`${examDate}T23:59:59`);
  if (!Number.isFinite(exam.getTime())) return 0;
  return Math.max(0, Math.ceil((exam.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

function getTodayTaskImpact(student) {
  const today = new Date().toISOString().slice(0, 10);
  const todaysTasks = student?.latestPlan?.schedule?.schedule?.filter((item) => item.scheduledDate === today) || [];
  if (!todaysTasks.length) return { impact: 0, completed: 0, total: 0 };
  const completedTasks = student.scheduleTaskCompletion?.[today] || {};
  const completed = todaysTasks.filter((item) => completedTasks[item.taskId]).length;
  return {
    impact: completed === todaysTasks.length ? 2 : completed ? 0.5 : -1.5,
    completed,
    total: todaysTasks.length
  };
}

async function generatePrediction(studentId) {
  const student = getStudentProfile(studentId);
  if (!student) throw new Error('Student profile not found.');

  const history = (student.quizHistory || student.recentTests || [])
    .map((entry) => ({
      score: Number(entry.score ?? (entry.scores && Object.values(entry.scores).reduce((sum, value) => sum + Number(value || 0), 0) / Math.max(Object.keys(entry.scores).length, 1))),
      timestamp: entry.timestamp || entry.date,
      durationMinutes: Number(entry.durationMinutes) || 0
    }))
    .filter((entry) => Number.isFinite(entry.score))
    .slice(-10);

  const masteryValues = Object.values(student.mastery || {}).map(Number).filter(Number.isFinite);
  const masteryAverage = masteryValues.length
    ? masteryValues.reduce((sum, value) => sum + value, 0) / masteryValues.length
    : 50;
  const scores = history.length ? history.map((entry) => clamp(entry.score)) : [masteryAverage];
  const regression = linearTrend(scores);
  const recentMean = scores.slice(-3).reduce((sum, value) => sum + value, 0) / Math.min(3, scores.length);
  const todayEstimate = clamp((regression.estimate * 0.45) + (recentMean * 0.35) + (masteryAverage * 0.2));
  const variance = standardDeviation(scores);
  const daysRemaining = getDaysRemaining(student.examDate);
  const taskImpact = getTodayTaskImpact(student);
  const averageStudyMinutes = history.length
    ? history.reduce((sum, entry) => sum + entry.durationMinutes, 0) / history.length
    : 0;
  const weakTopicCount = Object.values(student.mastery || {}).filter((value) => Number(value) < 70).length;
  const timeImpact = Math.min(8, daysRemaining * 0.18 * (averageStudyMinutes >= 20 ? 1.15 : 1));
  const planImpact = Math.min(5, weakTopicCount * 0.8);
  const projectedEstimate = clamp(todayEstimate + timeImpact + planImpact + taskImpact.impact);
  const confidenceSpread = Math.max(3, Math.min(15, variance * 0.65 + (history.length < 3 ? 4 : 0)));
  const todayMin = Math.round(clamp(todayEstimate - confidenceSpread));
  const todayMax = Math.round(clamp(todayEstimate + confidenceSpread));
  const min = Math.round(clamp(projectedEstimate - confidenceSpread));
  const max = Math.round(clamp(projectedEstimate + confidenceSpread));
  const recentDelta = scores.length > 1
    ? scores[scores.length - 1] - scores[Math.max(0, scores.length - 4)]
    : regression.slope;
  const trend = recentDelta > 2 ? 'up' : recentDelta < -2 ? 'down' : 'stable';
  const completedHours = history.reduce((sum, entry) => sum + entry.durationMinutes, 0) / 60;
  const deterministicReason = taskImpact.total
    ? `${taskImpact.completed} of ${taskImpact.total} study tasks scheduled today are complete; ${daysRemaining} days remain, with ${completedHours.toFixed(1)} study hours recorded.`
    : `${history.length} recent quiz results, topic mastery, ${completedHours.toFixed(1)} recorded study hours, and ${daysRemaining} days until the exam inform this range.`;

  let reasoning = deterministicReason;
  if (hasOpenAICompatibleKey() && history.length) {
    try {
      const client = createAIClient();
      const response = await client.chat.completions.create({
        model: getAIModel(),
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: 'Explain the provided score forecast factors in exactly one concise sentence. Do not change or invent the numeric forecast.'
          },
          {
            role: 'user',
            content: JSON.stringify({ scores: history, mastery: student.mastery, studyHours: completedHours, daysRemaining, taskImpact: taskImpact.impact, todayRange: [todayMin, todayMax], projectedRange: [min, max] })
          }
        ]
      });
      reasoning = response.choices?.[0]?.message?.content?.trim() || deterministicReason;
    } catch (error) {
      console.warn('Prediction explanation failed; using local reasoning.', error.message);
    }
  }

  const prediction = {
    min,
    max,
    todayMin,
    todayMax,
    afterPlanMin: min,
    afterPlanMax: max,
    trend,
    reasoning,
    daysRemaining,
    sampleCount: history.length,
    lastPredictionDate: new Date().toISOString()
  };
  updateStudent(studentId, {
    predictedScoreMin: min,
    predictedScoreMax: max,
    lastPredictionDate: prediction.lastPredictionDate,
    scorePrediction: prediction
  });
  return prediction;
}

module.exports = { generatePrediction, linearTrend, standardDeviation };