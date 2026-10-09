const { studentData } = require('../data/sampleData');
const fs = require('fs');
const path = require('path');

const storePath = process.env.STUDENT_STORE_PATH || path.join(__dirname, 'student-store.json');
const students = new Map(Object.entries(studentData));

try {
  if (fs.existsSync(storePath)) {
    const savedStudents = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    for (const [studentId, savedStudent] of Object.entries(savedStudents)) {
      students.set(studentId, { ...students.get(studentId), ...savedStudent });
    }
  }
} catch (error) {
  console.warn('Unable to load saved student profiles; using sample profiles.', error.message);
}

function persistStudents() {
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(Object.fromEntries(students), null, 2));
}

function getStudentProfile(studentId) {
  const normalizedId = (studentId || 'ava').toLowerCase();
  return students.get(normalizedId) || students.get('ava');
}

function loginStudent(name, email) {
  const normalizedName = String(name || '').trim();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (normalizedName.length < 2 || normalizedName.length > 80) {
    throw new Error('Enter a name between 2 and 80 characters.');
  }
  if (normalizedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error('Enter a valid student email address.');
  }

  const existing = [...students.values()].find((student) => String(student.email || '').toLowerCase() === normalizedEmail);
  if (existing) {
    existing.name = normalizedName;
    students.set(existing.id, existing);
    persistStudents();
    return existing;
  }

  const baseId = normalizedEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'student';
  let studentId = baseId;
  let suffix = 2;
  while (students.has(studentId)) {
    studentId = `${baseId}-${suffix}`;
    suffix += 1;
  }

  const profile = JSON.parse(JSON.stringify(studentData.ava));
  profile.id = studentId;
  profile.name = normalizedName;
  profile.email = normalizedEmail;
  profile.quizHistory = [];
  profile.recentTests = [];
  profile.incorrectAnswers = [];
  profile.scheduleTaskCompletion = {};
  delete profile.latestPlan;
  delete profile.generatedFlashcards;
  delete profile.generatedCheatSheet;
  delete profile.scorePrediction;
  delete profile.predictedScoreMin;
  delete profile.predictedScoreMax;
  delete profile.lastPredictionDate;
  students.set(studentId, profile);
  persistStudents();
  return profile;
}

function updateStudentMastery(studentId, nextMastery) {
  const student = getStudentProfile(studentId);
  if (!student) return null;
  student.mastery = { ...student.mastery, ...nextMastery };
  students.set(student.id, student);
  persistStudents();
  return student;
}

function saveGeneratedPlan(studentId, plan) {
  const student = getStudentProfile(studentId);
  if (!student) return null;
  student.latestPlan = plan;
  students.set(student.id, student);
  persistStudents();
  return student;
}

function recordIncorrectAnswers(studentId, breakdown = []) {
  const student = getStudentProfile(studentId);
  if (!student) return null;

  const timestamp = new Date().toISOString();
  const errors = breakdown
    .filter((entry) => !entry.isCorrect)
    .map((entry) => ({
      questionId: entry.questionId || null,
      question: entry.question || '',
      studentAnswer: entry.studentAnswer || null,
      correctAnswer: entry.correctAnswer || '',
      topic: entry.topic || 'Uncategorized',
      concept: entry.concept || entry.topic || 'Uncategorized',
      createdAt: timestamp
    }));

  student.incorrectAnswers = [...(student.incorrectAnswers || []), ...errors];
  students.set(student.id, student);
  persistStudents();
  return errors;
}

function recordQuizResult(studentId, result) {
  const student = getStudentProfile(studentId);
  if (!student) return null;

  const history = [...(student.quizHistory || []), {
    score: Math.max(0, Math.min(100, Number(result.score) || 0)),
    correct: Number(result.correct) || 0,
    total: Number(result.total) || 0,
    durationMinutes: Math.max(0, Number(result.durationMinutes) || 0),
    timestamp: result.timestamp || new Date().toISOString()
  }].slice(-100);
  student.quizHistory = history;
  student.recentTests = [...(student.recentTests || []), {
    date: history[history.length - 1].timestamp,
    score: history[history.length - 1].score,
    durationMinutes: history[history.length - 1].durationMinutes
  }].slice(-100);
  students.set(student.id, student);
  persistStudents();
  return history[history.length - 1];
}

function setScheduleTaskCompletion(studentId, taskKey, completed, date = new Date().toISOString().slice(0, 10)) {
  const student = getStudentProfile(studentId);
  if (!student) return null;
  const completion = { ...(student.scheduleTaskCompletion || {}) };
  const daily = { ...(completion[date] || {}) };
  if (completed) daily[taskKey] = new Date().toISOString();
  else delete daily[taskKey];
  completion[date] = daily;
  student.scheduleTaskCompletion = completion;
  students.set(student.id, student);
  persistStudents();
  return completion;
}

function getRecentIncorrectAnswers(studentId, days = 30) {
  const student = getStudentProfile(studentId);
  if (!student) return [];

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return (student.incorrectAnswers || []).filter((entry) => {
    const createdAt = Date.parse(entry.createdAt);
    return Number.isFinite(createdAt) && createdAt >= cutoff && createdAt <= Date.now();
  });
}

function updateStudent(studentId, updates) {
  const student = getStudentProfile(studentId);
  if (!student) return null;
  Object.assign(student, updates);
  students.set(student.id, student);
  persistStudents();
  return student;
}

module.exports = {
  getStudentProfile,
  loginStudent,
  updateStudentMastery,
  saveGeneratedPlan,
  recordIncorrectAnswers,
  recordQuizResult,
  setScheduleTaskCompletion,
  getRecentIncorrectAnswers,
  updateStudent,
  students
};
