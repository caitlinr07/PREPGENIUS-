require('dotenv').config();

const express = require('express');
const cors = require('cors');
const officeParser = require('officeparser');
const { getStudentProfile, loginStudent, updateStudent } = require('./src/memory/profileStore');
const { generateStudyPlan, submitPracticeQuiz } = require('./src/orchestrator');
const { generateCrashPlan } = require('./src/agents/crashPlanAgent');
const { generateFlashcards } = require('./src/agents/flashcardGeneratorAgent');
const { generateErrorQuiz } = require('./src/agents/errorInjectionAgent');
const { generateMisconceptionLesson } = require('./src/agents/feedbackAgent');
const { generatePrediction } = require('./src/agents/predictionAgent');
const { answerVoiceQuery } = require('./src/agents/voiceTutorAgent');
const { summarizeHandwrittenNotes } = require('./src/agents/handwrittenNotesAgent');
const { reviewAnswerScript, gradeCorrections } = require('./src/agents/answerScriptAgent');
const { extractAssessmentMarks } = require('./src/agents/assessmentImageAgent');
const { setScheduleTaskCompletion } = require('./src/memory/profileStore');

const app = express();
const port = Number(process.env.PORT || 5000);
const activeErrorQuizzes = new Map();
const activeAnswerScripts = new Map();

app.use(cors());
app.use(express.json({ limit: '12mb' }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'PrepGenius backend running.' });
});

app.get('/api/students/:studentId', (req, res) => {
  const student = getStudentProfile(req.params.studentId);
  if (!student) {
    return res.status(404).json({ message: 'Student profile not found.' });
  }
  return res.json({ student });
});

app.post('/api/students/login', (req, res) => {
  try {
    if (req.body?.name !== undefined || req.body?.email !== undefined) {
      const student = loginStudent(req.body.name, req.body.email);
      return res.json({ student });
    }
    const studentId = String(req.body?.studentId || 'ava').toLowerCase();
    const student = getStudentProfile(studentId);
    return res.json({ student });
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Unable to open student profile.' });
  }
});

app.patch('/api/students/:studentId/subjects/rename', (req, res) => {
  const student = getStudentProfile(req.params.studentId);
  if (!student) return res.status(404).json({ message: 'Student profile not found.' });
  const from = String(req.body?.from || '').trim();
  const to = String(req.body?.to || '').trim();
  if (!from || !Object.prototype.hasOwnProperty.call(student.mastery || {}, from)) {
    return res.status(404).json({ message: 'The subject to rename was not found.' });
  }
  if (to.length < 2 || to.length > 80) {
    return res.status(400).json({ message: 'Enter a subject name between 2 and 80 characters.' });
  }
  if (from !== to && Object.keys(student.mastery).some((topic) => topic.toLowerCase() === to.toLowerCase())) {
    return res.status(409).json({ message: 'A subject with that name already exists.' });
  }

  const mastery = { ...student.mastery };
  mastery[to] = mastery[from];
  if (to !== from) delete mastery[from];
  const renameTopic = (topic) => topic === from ? to : topic;
  const latestPlan = student.latestPlan ? {
    ...student.latestPlan,
    weakTopics: (student.latestPlan.weakTopics || []).map((item) => typeof item === 'string'
      ? renameTopic(item)
      : { ...item, topic: renameTopic(item.topic) }),
    notes: (student.latestPlan.notes || []).map((item) => ({ ...item, topic: renameTopic(item.topic) })),
    quiz: (student.latestPlan.quiz || []).map((item) => ({ ...item, topic: renameTopic(item.topic) })),
    schedule: student.latestPlan.schedule ? {
      ...student.latestPlan.schedule,
      schedule: (student.latestPlan.schedule.schedule || []).map((item) => ({ ...item, topic: renameTopic(item.topic) }))
    } : student.latestPlan.schedule
  } : student.latestPlan;

  const updated = updateStudent(student.id, {
    mastery,
    importantTopics: (student.importantTopics || []).map(renameTopic),
    subject: renameTopic(student.subject),
    uploadedNotes: (student.uploadedNotes || []).map((note) => ({ ...note, subject: renameTopic(note.subject) })),
    incorrectAnswers: (student.incorrectAnswers || []).map((item) => ({
      ...item,
      topic: renameTopic(item.topic),
      concept: renameTopic(item.concept)
    })),
    generatedFlashcardSubject: renameTopic(student.generatedFlashcardSubject),
    generatedFlashcards: (student.generatedFlashcards || []).map((card) => ({ ...card, sourceTopic: renameTopic(card.sourceTopic) })),
    generatedCheatSheet: student.generatedCheatSheet ? {
      ...student.generatedCheatSheet,
      sections: (student.generatedCheatSheet.sections || []).map((section) => ({ ...section, topic: renameTopic(section.topic) }))
    } : student.generatedCheatSheet,
    latestPlan
  });

  return res.json({ student: updated });
});

app.patch('/api/students/:studentId/preferences', (req, res) => {
  const student = getStudentProfile(req.params.studentId);
  if (!student) return res.status(404).json({ message: 'Student profile not found.' });
  const { mastery, importantTopics, darkMode } = req.body || {};
  const updates = {};

  if (mastery !== undefined) {
    if (!mastery || typeof mastery !== 'object' || Array.isArray(mastery)) {
      return res.status(400).json({ message: 'Subject marks must be provided as a subject-to-mark map.' });
    }
    const nextMastery = {};
    for (const [rawTopic, rawMark] of Object.entries(mastery)) {
      const topic = String(rawTopic).trim();
      const mark = Number(rawMark);
      if (!topic || topic.length > 80 || !Number.isFinite(mark) || mark < 0 || mark > 100) {
        return res.status(400).json({ message: 'Subject names must be under 80 characters and marks must be between 0 and 100.' });
      }
      nextMastery[topic] = Math.round(mark);
    }
    if (!Object.keys(nextMastery).length) return res.status(400).json({ message: 'Keep at least one subject in your profile.' });
    updates.mastery = nextMastery;
  }

  if (importantTopics !== undefined) {
    if (!Array.isArray(importantTopics)) return res.status(400).json({ message: 'Important topics must be a list.' });
    const subjects = new Set(Object.keys(updates.mastery || student.mastery || {}));
    updates.importantTopics = [...new Set(importantTopics.map((topic) => String(topic).trim()).filter((topic) => subjects.has(topic)))];
  }

  if (darkMode !== undefined) {
    if (typeof darkMode !== 'boolean') return res.status(400).json({ message: 'Dark mode must be true or false.' });
    updates.darkMode = darkMode;
  }

  const updated = updateStudent(student.id, updates);
  return res.json({
    mastery: updated.mastery,
    importantTopics: updated.importantTopics || [],
    darkMode: Boolean(updated.darkMode)
  });
});

app.post('/api/study-plan', async (req, res) => {
  const { studentId = 'ava', scores = [], examDate, availability } = req.body || {};

  if (!Array.isArray(scores) || !scores.length) {
    return res.status(400).json({ message: 'Please provide a quiz result with at least one topic score.' });
  }

  try {
    const plan = await generateStudyPlan(studentId, scores, examDate, availability);
    return res.json(plan);
  } catch (error) {
    console.error('Study plan generation failed:', error);
    return res.status(500).json({ message: 'Study plan generation failed. Please try again.' });
  }
});

app.post('/api/quiz-feedback', async (req, res) => {
  const { studentId = 'ava', quiz = [], answers = [], durationMinutes = 0 } = req.body || {};

  if (!Array.isArray(quiz) || !quiz.length) {
    return res.status(400).json({ message: 'There are no quiz questions to grade.' });
  }

  try {
    const result = await submitPracticeQuiz(studentId, quiz, answers, durationMinutes);
    return res.json(result);
  } catch (error) {
    console.error('Quiz grading failed:', error);
    return res.status(500).json({ message: 'Quiz grading failed. Please try again.' });
  }
});

app.get('/api/prediction/:studentId', async (req, res) => {
  try {
    const prediction = await generatePrediction(req.params.studentId);
    return res.json(prediction);
  } catch (error) {
    console.error('Prediction generation failed:', error);
    return res.status(404).json({ message: 'Unable to generate a score prediction for this student.' });
  }
});

app.post('/api/generate-schedule', async (req, res) => {
  const { studentId = 'ava', scores, examDate, availability } = req.body || {};
  const student = getStudentProfile(studentId);
  const scheduleScores = Array.isArray(scores) && scores.length
    ? scores
    : Object.entries(student?.mastery || {}).map(([topic, score]) => ({ topic, score }));
  try {
    const plan = await generateStudyPlan(studentId, scheduleScores, examDate, availability);
    return res.json(plan.schedule);
  } catch (error) {
    console.error('Energy-aware schedule generation failed:', error);
    return res.status(500).json({ message: 'Schedule generation failed. Please try again.' });
  }
});

app.post('/api/schedule-items', (req, res) => {
  const { studentId = 'ava', topic, date, time, durationMinutes = 60, difficultyLevel = 'Medium' } = req.body || {};
  const student = getStudentProfile(studentId);
  const duration = Number(durationMinutes);
  if (!String(topic || '').trim() || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(time || '')) || !Number.isFinite(duration) || duration < 15 || duration > 360) {
    return res.status(400).json({ message: 'Provide a topic, date, time, and duration between 15 and 360 minutes.' });
  }

  const safeTopic = String(topic).trim().slice(0, 100);
  const safeDifficulty = ['Hard', 'Medium', 'Easy'].includes(difficultyLevel) ? difficultyLevel : 'Medium';
  const taskId = `${date}:${Date.now()}:${safeTopic}`;
  const item = {
    day: date === new Date().toISOString().slice(0, 10) ? 'Today' : date,
    scheduledDate: date,
    taskId,
    topic: safeTopic,
    task: `Student-added ${safeTopic} study session.`,
    focus: 'student added',
    difficultyLevel: safeDifficulty,
    optimalTimeOfDay: time,
    durationMinutes: duration,
    slotType: safeDifficulty === 'Hard' ? 'Deep Work Slot' : safeDifficulty === 'Easy' ? 'Quick Review Slot' : 'Focused Practice',
    insight: 'Added by you to your study schedule.'
  };
  const previousPlan = student.latestPlan || { studentId: student.id, weakTopics: [], notes: [], quiz: [] };
  const previousSchedule = previousPlan.schedule || {};
  const nextPlan = {
    ...previousPlan,
    schedule: {
      ...previousSchedule,
      schedule: [...(previousSchedule.schedule || []), item]
    }
  };
  updateStudent(studentId, { latestPlan: nextPlan });
  return res.status(201).json({ plan: nextPlan, item });
});

app.post('/api/schedule-task-completion', async (req, res) => {
  const { studentId = 'ava', taskId, completed = true, date } = req.body || {};
  if (!taskId || typeof completed !== 'boolean') {
    return res.status(400).json({ message: 'Provide a taskId and a completed boolean.' });
  }
  try {
    const completion = setScheduleTaskCompletion(studentId, taskId, completed, date);
    const prediction = await generatePrediction(studentId);
    return res.json({ completion, prediction });
  } catch (error) {
    console.error('Schedule task update failed:', error);
    return res.status(500).json({ message: 'Unable to update schedule completion.' });
  }
});

app.post('/api/voice-query', async (req, res) => {
  const transcript = String(req.body?.transcript || '').trim();
  const contextTopic = String(req.body?.contextTopic || 'General study').trim().slice(0, 120);
  if (!transcript || transcript.length > 2000) {
    return res.status(400).json({ message: 'Provide a question between 1 and 2000 characters.' });
  }
  try {
    const answer = await answerVoiceQuery(transcript, contextTopic);
    return res.json({ answer, contextTopic });
  } catch (error) {
    console.error('Voice tutor failed:', error);
    return res.status(500).json({ message: 'The voice tutor could not answer just now. Please try again.' });
  }
});

app.post('/api/extract-assessment-marks', async (req, res) => {
  const { dataUrl, mimeType, fileName } = req.body || {};
  if (!dataUrl || !mimeType) return res.status(400).json({ message: 'Choose a PDF, PNG, or JPG assessment file.' });
  if (String(dataUrl).length > 11_000_000) return res.status(413).json({ message: 'Assessment file is too large. Choose a file smaller than 8 MB.' });
  try {
    const isDocx = mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const isPptx = mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    let documentText;
    if (isDocx || isPptx) {
      const fileBuffer = Buffer.from(String(dataUrl).split(',')[1] || '', 'base64');
      const ast = await officeParser.parseOffice(fileBuffer, { fileType: isDocx ? 'docx' : 'pptx' });
      const extracted = await ast.to('text');
      documentText = String(extracted.value || '').slice(0, 30000);
      if (!documentText.trim()) return res.status(422).json({ message: 'No readable text was found in this Word or PowerPoint file.' });
    }
    const result = await extractAssessmentMarks({ dataUrl, mimeType, documentText });
    return res.json(result);
  } catch (error) {
    console.error('Assessment mark extraction failed:', error);
    return res.status(error.statusCode || 422).json({ message: error.message || 'Unable to read marks from this image.' });
  }
});

app.post('/api/summarize-handwritten-notes', async (req, res) => {
  const { studentId = 'ava', fileName, mimeType, dataUrl, text, subject } = req.body || {};
  const isImage = String(mimeType || '').startsWith('image/');
  if (!fileName || (!isImage && !String(text || '').trim()) || (isImage && !dataUrl)) {
    return res.status(400).json({ message: 'Choose a readable image or text file first.' });
  }
  if (String(text || '').length > 30000 || String(dataUrl || '').length > 11_000_000) {
    return res.status(413).json({ message: 'This file is too large to summarize. Choose a file smaller than 8 MB.' });
  }
  try {
    const note = await summarizeHandwrittenNotes(studentId, { fileName, mimeType, dataUrl, text, subject });
    return res.json({ note });
  } catch (error) {
    console.error('Handwritten-note summarization failed:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Unable to summarize this file.' });
  }
});

app.post('/api/review-answer-script', async (req, res) => {
  const { studentId = 'ava', subject, answerScript = '', dataUrl, mimeType } = req.body || {};
  const student = getStudentProfile(studentId);
  const safeSubject = String(subject || '').trim();
  if (!safeSubject || !Object.prototype.hasOwnProperty.call(student.mastery || {}, safeSubject)) {
    return res.status(400).json({ message: 'Choose a subject from your profile before reviewing a script.' });
  }
  if (String(answerScript).length > 20000 || String(dataUrl || '').length > 11_000_000) {
    return res.status(413).json({ message: 'The answer script is too large. Use a file smaller than 8 MB.' });
  }
  try {
    const review = await reviewAnswerScript({ subject: safeSubject, answerScript, dataUrl, mimeType });
    activeAnswerScripts.set(student.id, review);
    return res.json({
      subject: review.subject,
      source: review.source,
      provider: review.provider,
      lines: review.lines.map(({ lineNumber, content, hasError, issue }) => ({ lineNumber, content, hasError, issue })),
      errorCount: review.lines.filter((line) => line.hasError).length
    });
  } catch (error) {
    console.error('Answer-script review failed:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Unable to review this answer script.' });
  }
});

app.post('/api/submit-answer-script-corrections', async (req, res) => {
  const { studentId = 'ava', corrections = {} } = req.body || {};
  const student = getStudentProfile(studentId);
  const review = activeAnswerScripts.get(student.id);
  if (!review) return res.status(400).json({ message: 'Review an answer script before submitting corrections.' });

  const result = await gradeCorrections(review, corrections);
  const nextMastery = { ...(student.mastery || {}) };
  if (result.totalErrors > 0) {
    const change = result.correctCount === result.totalErrors ? 5 : result.correctCount > 0 ? 2 : -2;
    nextMastery[result.subject] = Math.max(0, Math.min(100, Number(nextMastery[result.subject] || 0) + change));
  }
  activeAnswerScripts.delete(student.id);
  updateStudent(studentId, {
    mastery: nextMastery,
    answerScriptResults: [...(student.answerScriptResults || []), {
      subject: result.subject,
      score: result.score,
      correctCount: result.correctCount,
      totalErrors: result.totalErrors,
      createdAt: new Date().toISOString()
    }].slice(-50)
  });
  return res.json({ ...result, reviewLines: review.lines, updatedMastery: nextMastery });
});

app.post('/api/generate-crash-plan', async (req, res) => {
  const { studentId = 'ava', weakTopics = [], examDate } = req.body || {};

  try {
    const data = await generateCrashPlan(studentId, weakTopics, examDate);
    return res.json(data);
  } catch (error) {
    console.error('Crash plan generation failed:', error);
    return res.status(500).json({ message: 'Crash plan generation failed. Please try again.' });
  }
});

app.post('/api/generate-flashcards', async (req, res) => {
  const { studentId = 'ava', subject } = req.body || {};

  try {
    const result = await generateFlashcards(studentId, subject);
    return res.json(result);
  } catch (error) {
    console.error('Flashcard generation failed:', error);
    return res.status(500).json({ message: 'Flashcard generation failed. Please try again.' });
  }
});

app.post('/api/generate-error-quiz', async (req, res) => {
  const { studentId = 'ava', topic } = req.body || {};

  try {
    const quiz = await generateErrorQuiz(studentId, topic);
    const student = getStudentProfile(studentId);
    activeErrorQuizzes.set(student.id, quiz);
    return res.json({
      problemStatement: quiz.problemStatement,
      topic: quiz.topic,
      steps: quiz.steps.map(({ stepNum, content }) => ({ stepNum, content })),
      explanationOfTrap: null
    });
  } catch (error) {
    console.error('Error quiz generation failed:', error);
    return res.status(500).json({ message: 'Error quiz generation failed. Please try again.' });
  }
});

app.post('/api/submit-error-quiz', (req, res) => {
  const { studentId = 'ava', stepNum } = req.body || {};
  const student = getStudentProfile(studentId);
  const quiz = student && activeErrorQuizzes.get(student.id);

  if (!quiz) {
    return res.status(400).json({ message: 'Generate an error-spotting quiz before submitting an answer.' });
  }

  const correct = Number(stepNum) === Number(quiz.correctStepNum);
  const nextMastery = { ...(student.mastery || {}) };
  if (correct) {
    nextMastery[quiz.topic] = Math.min(100, Number(nextMastery[quiz.topic] || 0) + 5);
  }
  activeErrorQuizzes.delete(student.id);
  updateStudent(studentId, { mastery: nextMastery });

  return res.json({
    correct,
    correctStepNum: quiz.correctStepNum,
    steps: quiz.steps,
    explanationOfTrap: quiz.explanationOfTrap,
    miniLesson: correct ? null : generateMisconceptionLesson({ topic: quiz.topic, explanationOfTrap: quiz.explanationOfTrap }),
    updatedMastery: nextMastery
  });
});

app.listen(port, () => {
  console.log(`PrepGenius running on http://localhost:${port}`);
});
