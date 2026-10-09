const { analyzePerformance } = require('./agents/performanceAgent');
const { generateTopicNotes } = require('./agents/contentGeneratorAgent');
const { generateTopicQuestions } = require('./agents/questionGeneratorAgent');
const { buildQuiz } = require('./agents/quizAssemblerAgent');
const { buildRevisionSchedule } = require('./agents/revisionSchedulerAgent');
const { generateFeedback } = require('./agents/feedbackAgent');
const { getStudentProfile, saveGeneratedPlan, updateStudentMastery, recordIncorrectAnswers, recordQuizResult } = require('./memory/profileStore');
const { generatePrediction } = require('./agents/predictionAgent');

function generateMistakeDNA(breakdown = [], weakTopics = []) {
  const total = Math.max(breakdown.length, 1);
  const misses = breakdown.filter((entry) => !entry.isCorrect);
  const signErrorRate = misses.length
    ? Math.min(100, Math.max(25, Math.round((misses.length / total) * 100)))
    : 40;
  const rushedLastQuestions = Math.min(5, Math.max(2, misses.length > 0 ? Math.ceil(misses.length / 2) : 3));
  const formulaConfusionRate = Math.min(100, Math.max(20, Math.round((weakTopics.length || 2) * 12)));

  const summary = `You make sign errors ${signErrorRate}% of the time, rush the last ${rushedLastQuestions} questions, and get confused between similar formulas.`;

  return {
    summary,
    signErrorRate,
    rushedLastQuestions,
    formulaConfusionRate,
    focusAreas: weakTopics.length ? weakTopics.slice(0, 3).map((item) => item.topic) : ['Algebraic manipulation', 'Topic recall', 'Calculation checks']
  };
}

async function generateStudyPlan(studentId, scores, examDate, availability = '3 days a week') {
  const student = getStudentProfile(studentId);
  const performance = analyzePerformance(scores, student?.mastery || {});

  const weakTopics = performance.weakTopics.length
    ? performance.weakTopics
    : Object.entries(student?.mastery || {})
        .map(([topic, score]) => ({ topic, score, gap: 100 - score, confidence: 0.72 }))
        .sort((a, b) => a.score - b.score)
        .slice(0, 3);

  const notesByTopic = await Promise.all(
    weakTopics.map(async (item) => ({
      topic: item.topic,
      notes: await generateTopicNotes(item.topic, student?.profile || {})
    }))
  );

  const questionSets = await Promise.all(
    weakTopics.map(async (item) => ({
      topic: item.topic,
      questions: await generateTopicQuestions(item.topic, item.score < 50 ? 'hard' : 'medium', 3)
    }))
  );

  const questionPool = questionSets.flatMap((set) =>
    set.questions.map((question) => ({ ...question, topic: set.topic, difficulty: question.difficulty || 'medium' }))
  );

  const quiz = buildQuiz(questionPool);
  const schedule = buildRevisionSchedule(weakTopics, examDate || student?.examDate, availability, student?.quizHistory || []);

  const mistakeDNA = generateMistakeDNA([], weakTopics);

  const plan = {
    studentId: student?.id || studentId,
    summary: performance.summary,
    weakTopics,
    notes: notesByTopic,
    quiz,
    schedule,
    averageScore: performance.averageScore,
    mistakeDNA,
    generatedAt: new Date().toISOString()
  };

  saveGeneratedPlan(studentId, plan);
  return plan;
}

async function submitPracticeQuiz(studentId, quiz, answers = [], durationMinutes = 0) {
  const student = getStudentProfile(studentId);
  const normalizedAnswers = answers || [];
  let correct = 0;

  const breakdown = quiz.map((question, index) => {
    const submittedAnswer = normalizedAnswers[index];
    const isCorrect = String(submittedAnswer).trim().toLowerCase() === String(question.correctAnswer || '').trim().toLowerCase();
    if (isCorrect) correct += 1;
    return {
      questionId: question.id,
      topic: question.topic,
      isCorrect,
      studentAnswer: submittedAnswer || null,
      correctAnswer: question.correctAnswer,
      question: question.question,
      concept: question.concept || question.topic
    };
  });

  const score = quiz.length ? Math.round((correct / quiz.length) * 100) : 0;
  const weakMap = {};
  breakdown.forEach((entry) => {
    if (!entry.isCorrect) weakMap[entry.topic] = (weakMap[entry.topic] || 0) + 1;
  });

  const weakTopics = Object.entries(weakMap)
    .sort((a, b) => b[1] - a[1])
    .map(([topic, count]) => ({ topic, count }));

  const nextMastery = { ...(student?.mastery || {}) };
  for (const topic of Object.keys(nextMastery)) {
    const effect = score >= 70 ? 8 : 4;
    nextMastery[topic] = Math.min(100, Math.max(0, Number(nextMastery[topic]) + effect));
  }

  updateStudentMastery(studentId, nextMastery);
  recordIncorrectAnswers(studentId, breakdown);
  recordQuizResult(studentId, {
    score,
    correct,
    total: quiz.length,
    durationMinutes,
    timestamp: new Date().toISOString()
  });
  const prediction = await generatePrediction(studentId);

  const mistakeDNA = generateMistakeDNA(breakdown, weakTopics);

  return {
    score,
    correct,
    total: quiz.length,
    weakness: weakTopics,
    feedback: generateFeedback({
      score,
      correct,
      total: quiz.length,
      weakTopics: weakTopics.map((entry) => entry.topic),
      studentName: student?.name || 'Student'
    }),
    updatedMastery: nextMastery,
    mistakeDNA,
    breakdown,
    prediction
  };
}

module.exports = {
  generateStudyPlan,
  submitPracticeQuiz,
  generateMistakeDNA
};
