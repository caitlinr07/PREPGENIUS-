import { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import CheatSheetView from './components/CheatSheetView.jsx';
import ErrorSpotterQuiz from './components/ErrorSpotterQuiz.jsx';
import FlashcardView from './components/FlashcardView.jsx';
import ScoreForecast from './components/ScoreForecast.jsx';
import VoiceTutor from './components/VoiceTutor.jsx';
import prepGeniusLogo from '../prepgenius-logo.svg';
import prepGeniusMark from '../prepgenius-mark.svg';

const tabLabels = ['dashboard', 'quiz', 'notes', 'schedule', 'study aids', 'find the error', 'profile'];

function normalizeImportedMark(value) {
  if (typeof value === 'object' && value !== null) {
    const score = Number(value.percentage ?? value.percent ?? value.score ?? value.mark);
    const total = Number(value.maxScore ?? value.total ?? 100);
    if (!Number.isFinite(score) || !Number.isFinite(total) || total <= 0) return null;
    const percentage = score <= 100 && total === 100 ? score : (score / total) * 100;
    return percentage >= 0 && percentage <= 100 ? Math.round(percentage) : null;
  }

  const text = String(value ?? '').trim();
  const fraction = text.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  const score = fraction ? Number(fraction[1]) : Number(text.replace(/%$/, ''));
  const total = fraction ? Number(fraction[2]) : 100;
  if (!Number.isFinite(score) || !Number.isFinite(total) || total <= 0) return null;
  const percentage = score <= 100 && total === 100 ? score : (score / total) * 100;
  return percentage >= 0 && percentage <= 100 ? Math.round(percentage) : null;
}

function parseAssessmentMarks(content, fileName) {
  if (fileName.toLowerCase().endsWith('.json')) {
    const parsed = JSON.parse(content);
    const source = parsed.marks || parsed.scores || parsed;
    if (Array.isArray(source)) {
      return Object.fromEntries(source.map((item) => [
        String(item.subject || item.topic || item.name || '').trim(),
        normalizeImportedMark(item)
      ]).filter(([subject, mark]) => subject && mark !== null));
    }
    return Object.fromEntries(Object.entries(source).map(([subject, mark]) => [
      subject.trim(), normalizeImportedMark(mark)
    ]).filter(([subject, mark]) => subject && mark !== null));
  }

  const rows = String(content).split(/\r?\n/).map((row) => row.trim()).filter(Boolean);
  if (!rows.length) return {};
  const splitRow = (row) => row.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((cell) => cell.trim().replace(/^"|"$/g, ''));
  const first = splitRow(rows[0]);
  const subjectColumn = first.findIndex((cell) => /^(subject|topic|name)$/i.test(cell));
  const scoreColumn = first.findIndex((cell) => /^(score|mark|marks|percentage|percent|result)$/i.test(cell));
  const hasHeader = subjectColumn >= 0 && scoreColumn >= 0;
  const marks = {};
  for (const row of rows.slice(hasHeader ? 1 : 0)) {
    const cells = splitRow(row);
    const subject = String(cells[hasHeader ? subjectColumn : 0] || '').trim();
    const mark = normalizeImportedMark(cells[hasHeader ? scoreColumn : 1]);
    if (subject && mark !== null) marks[subject] = mark;
  }
  return marks;
}

function App() {
  const [student, setStudent] = useState(null);
  const [studentIdInput, setStudentIdInput] = useState('ava');
  const [loginName, setLoginName] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginError, setLoginError] = useState('');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState(null);
  const [results, setResults] = useState(null);
  const [mistakeDNA, setMistakeDNA] = useState(null);
  const [crashMode, setCrashMode] = useState(false);
  const [crashTab, setCrashTab] = useState('schedule');
  const [crashPlan, setCrashPlan] = useState(null);
  const [crashQuizAnswers, setCrashQuizAnswers] = useState({});
  const [crashScore, setCrashScore] = useState(null);
  const [studyAids, setStudyAids] = useState(null);
  const [studyAidTab, setStudyAidTab] = useState('flashcards');
  const [errorQuiz, setErrorQuiz] = useState(null);
  const [errorQuizResult, setErrorQuizResult] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [quizStartedAt, setQuizStartedAt] = useState(null);
  const [scoreInputs, setScoreInputs] = useState({});
  const [answers, setAnswers] = useState({});
  const [quizError, setQuizError] = useState('');
  const [noteFile, setNoteFile] = useState(null);
  const [noteSummary, setNoteSummary] = useState(null);
  const [noteUploadLoading, setNoteUploadLoading] = useState(false);
  const [noteUploadError, setNoteUploadError] = useState('');
  const [noteUploadSubject, setNoteUploadSubject] = useState('');
  const [studyAidSubject, setStudyAidSubject] = useState('');
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [scheduleDateFilter, setScheduleDateFilter] = useState(new Date().toISOString().slice(0, 10));
  const [scheduleForm, setScheduleForm] = useState({
    topic: '',
    date: new Date().toISOString().slice(0, 10),
    time: '09:00',
    durationMinutes: 60,
    difficultyLevel: 'Medium'
  });
  const [scheduleError, setScheduleError] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [importantTopicChoice, setImportantTopicChoice] = useState('');
  const [profileSaveStatus, setProfileSaveStatus] = useState('');
  const [editingSubject, setEditingSubject] = useState(null);
  const [subjectNameDraft, setSubjectNameDraft] = useState('');
  const [assessmentUploadStatus, setAssessmentUploadStatus] = useState('');
  const [assessmentUploadError, setAssessmentUploadError] = useState('');

  const chartData = useMemo(() => {
    if (!student?.mastery) return [];
    return Object.entries(student.mastery).map(([topic, score]) => ({
      topic,
      score
    }));
  }, [student]);

  const loadStudent = async (id = 'ava', identity = null) => {
    setLoading(true);
    try {
      const response = await fetch('/api/students/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(identity || { studentId: id })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to open student profile.');
      const nextStudent = data.student;
      const predictionResponse = await fetch(`/api/prediction/${nextStudent.id}`);
      const predictionData = predictionResponse.ok ? await predictionResponse.json() : null;
      setStudent(nextStudent);
      setNewSubject('');
      setImportantTopicChoice('');
      setProfileSaveStatus('');
      setResults(null);
      setAnswers({});
      setQuizError('');
      setLoginName(nextStudent.name || '');
      setLoginEmail(nextStudent.email || '');
      setLoginError('');
      setPrediction(predictionData);
      setPlan(nextStudent.latestPlan || null);
      setStudentIdInput(nextStudent.id);
      setMistakeDNA(nextStudent.mistakeDNA || null);
      setStudyAids(nextStudent.generatedFlashcards ? {
        cards: nextStudent.generatedFlashcards,
        cheatSheet: nextStudent.generatedCheatSheet
      } : null);
      setNoteSummary(nextStudent.uploadedNotes?.at(-1) || null);
      setNoteUploadSubject(Object.keys(nextStudent.mastery || {})[0] || nextStudent.subject || '');
      setStudyAidSubject(nextStudent.generatedFlashcardSubject || Object.keys(nextStudent.mastery || {})[0] || nextStudent.subject || '');
      setErrorQuiz(null);
      setErrorQuizResult(null);
      setCrashMode(false);
      setCrashPlan(null);
      setCrashTab('schedule');
      setCrashScore(null);
      setScoreInputs(
        Object.fromEntries(
          Object.entries(nextStudent.mastery || {}).map(([topic, score]) => [topic, score])
        )
      );
      setActiveTab('dashboard');
    } finally {
      setLoading(false);
    }
  };

  const submitLogin = async (event) => {
    event.preventDefault();
    setLoginError('');
    try {
      await loadStudent('ava', { name: loginName, email: loginEmail });
    } catch (error) {
      setLoginError(error.message || 'Unable to open your study profile.');
    }
  };

  const handleScoreChange = (topic, value) => {
    setScoreInputs((current) => ({
      ...current,
      [topic]: Number(value)
    }));
    setStudent((current) => ({
      ...current,
      mastery: { ...current.mastery, [topic]: Number(value) }
    }));
  };

  const saveProfilePreferences = async (changes, successMessage = 'Changes saved') => {
    setProfileSaveStatus('Saving...');
    try {
      const response = await fetch(`/api/students/${student.id}/preferences`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not save profile changes.');
      setStudent((current) => ({
        ...current,
        mastery: data.mastery,
        importantTopics: data.importantTopics,
        darkMode: data.darkMode
      }));
      setScoreInputs(data.mastery);
      setProfileSaveStatus(successMessage);
      return true;
    } catch (error) {
      setProfileSaveStatus(error.message || 'Could not save profile changes.');
      return false;
    }
  };

  const addSubject = async (event) => {
    event.preventDefault();
    const subject = newSubject.trim();
    if (!subject || Object.keys(student.mastery || {}).some((topic) => topic.toLowerCase() === subject.toLowerCase())) return;
    const mastery = { ...student.mastery, [subject]: 0 };
    const saved = await saveProfilePreferences({ mastery }, `${subject} added`);
    if (saved) {
      setNewSubject('');
      setNoteUploadSubject(subject);
      setStudyAidSubject(subject);
    }
  };

  const removeSubject = async (subject) => {
    const entries = Object.entries(student.mastery || {}).filter(([topic]) => topic !== subject);
    if (!entries.length) {
      setProfileSaveStatus('Keep at least one subject in your profile.');
      return;
    }
    const mastery = Object.fromEntries(entries);
    const importantTopics = (student.importantTopics || []).filter((topic) => topic !== subject);
    await saveProfilePreferences({ mastery, importantTopics }, `${subject} removed`);
  };

  const renameSubject = async (from) => {
    const to = subjectNameDraft.trim();
    if (!to || to === from) {
      setEditingSubject(null);
      return;
    }
    setProfileSaveStatus('Saving subject name...');
    try {
      const response = await fetch(`/api/students/${student.id}/subjects/rename`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not rename the subject.');
      const nextStudent = data.student;
      setStudent(nextStudent);
      setScoreInputs(nextStudent.mastery);
      setPlan(nextStudent.latestPlan || null);
      if (noteUploadSubject === from) setNoteUploadSubject(to);
      if (studyAidSubject === from) setStudyAidSubject(to);
      if (noteSummary?.subject === from) setNoteSummary({ ...noteSummary, subject: to });
      setEditingSubject(null);
      setProfileSaveStatus(`${from} renamed to ${to}`);
    } catch (error) {
      setProfileSaveStatus(error.message || 'Could not rename the subject.');
    }
  };

  const toggleImportantTopic = async (subject) => {
    const importantTopics = new Set(student.importantTopics || []);
    if (importantTopics.has(subject)) importantTopics.delete(subject);
    else importantTopics.add(subject);
    await saveProfilePreferences({ importantTopics: [...importantTopics] }, `${subject} importance updated`);
  };

  const addImportantTopic = async (event) => {
    event.preventDefault();
    if (!importantTopicChoice) return;
    const importantTopics = new Set(student.importantTopics || []);
    importantTopics.add(importantTopicChoice);
    const saved = await saveProfilePreferences({ importantTopics: [...importantTopics] }, `${importantTopicChoice} marked important`);
    if (saved) setImportantTopicChoice('');
  };

  const updateSubjectMark = async (subject, value) => {
    const mark = Number(value);
    if (!Number.isFinite(mark) || mark < 0 || mark > 100) {
      setProfileSaveStatus('Marks must be between 0 and 100.');
      return;
    }
    const mastery = { ...student.mastery, [subject]: Math.round(mark) };
    await saveProfilePreferences({ mastery }, `${subject} mark saved`);
  };

  const setDarkMode = async (darkMode) => {
    await saveProfilePreferences({ darkMode }, darkMode ? 'Dark mode enabled' : 'Light mode enabled');
  };

  const handleAssessmentUpload = async (event) => {
    const file = event.target.files?.[0];
    setAssessmentUploadError('');
    setAssessmentUploadStatus('');
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setAssessmentUploadError('Choose a file smaller than 8 MB.');
      event.target.value = '';
      return;
    }

    try {
      let marks;
      const extension = file.name.toLowerCase();
      const officeMimeTypes = {
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      };
      const extensionMimeType = extension.endsWith('.pdf') ? 'application/pdf'
        : extension.endsWith('.png') ? 'image/png'
          : ['.jpg', '.jpeg'].some((suffix) => extension.endsWith(suffix)) ? 'image/jpeg'
            : Object.entries(officeMimeTypes).find(([suffix]) => extension.endsWith(suffix))?.[1] || '';
      const mimeType = file.type || extensionMimeType;
      if (['image/png', 'image/jpeg', 'application/pdf', ...Object.values(officeMimeTypes)].includes(mimeType)) {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('This assessment file could not be read.'));
          reader.readAsDataURL(file);
        });
        const response = await fetch('/api/extract-assessment-marks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl, mimeType, fileName: file.name })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Could not read marks from this assessment file.');
        marks = data.marks;
        setAssessmentUploadStatus(`Read marks from ${file.name} with ${data.provider}.`);
      } else if (file.name.toLowerCase().endsWith('.csv') || file.name.toLowerCase().endsWith('.json')) {
        const content = await file.text();
        marks = parseAssessmentMarks(content, file.name);
        setAssessmentUploadStatus(`Loaded marks from ${file.name}.`);
      } else {
        throw new Error('Choose a PDF, PNG, JPG/JPEG, DOCX, PPTX, CSV, or JSON file.');
      }

      if (!marks || !Object.keys(marks).length) throw new Error('No subject marks were found in this file.');
      const mergedMastery = { ...student.mastery, ...marks };
      const saved = await saveProfilePreferences({ mastery: mergedMastery }, `${Object.keys(marks).length} subject marks imported`);
      if (!saved) throw new Error('Marks were read but could not be saved to your profile.');
      setScoreInputs(mergedMastery);
      setAssessmentUploadStatus(`${Object.keys(marks).length} subject marks imported from ${file.name}.`);
    } catch (error) {
      console.error(error);
      setAssessmentUploadError(error.message || 'Assessment import failed.');
      setAssessmentUploadStatus('');
    } finally {
      event.target.value = '';
    }
  };

  const generateStudyPlan = async () => {
    setLoading(true);
    setCrashMode(false);
    try {
      const payload = {
        studentId: student.id,
        scores: Object.entries(scoreInputs).map(([topic, score]) => ({ topic, score })),
        examDate: student.examDate
      };

      const response = await fetch('/api/study-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Unable to generate study plan.');
      }

      setPlan(data);
      setQuizStartedAt(null);
      setAnswers({});
      setQuizError('');
      setMistakeDNA(data.mistakeDNA || null);
      setResults(null);
      setActiveTab('quiz');
    } catch (error) {
      console.error(error);
      alert(error.message || 'Study plan generation failed.');
    } finally {
      setLoading(false);
    }
  };

  const launchCrashMode = async () => {
    if (!student) return;
    setLoading(true);
    try {
      const response = await fetch('/api/generate-crash-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: student.id,
          weakTopics: Object.entries(student.mastery)
            .filter(([, score]) => Number(score) < 70)
            .map(([topic]) => topic),
          examDate: student.examDate
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Unable to generate crash plan.');
      }

      setCrashPlan(data);
      setCrashMode(true);
      setCrashTab('schedule');
      setCrashScore(null);
      setCrashQuizAnswers({});
    } catch (error) {
      console.error(error);
      alert(error.message || 'Crash plan generation failed.');
    } finally {
      setLoading(false);
    }
  };

  const generateStudyAids = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/generate-flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: student.id, subject: studyAidSubject })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to generate study aids.');
      setStudyAids(data);
      setStudyAidSubject(data.subject || studyAidSubject);
      setStudent((current) => ({
        ...current,
        generatedFlashcardSubject: data.subject || studyAidSubject,
        generatedFlashcards: data.cards,
        generatedCheatSheet: data.cheatSheet
      }));
    } catch (error) {
      console.error(error);
      alert(error.message || 'Study aid generation failed.');
    } finally {
      setLoading(false);
    }
  };

  const generateErrorQuiz = async (scriptPayload) => {
    if (!scriptPayload) {
      setErrorQuiz(null);
      setErrorQuizResult(null);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('/api/review-answer-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: student.id, ...scriptPayload })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to review this answer script.');
      setErrorQuiz(data);
      setErrorQuizResult(null);
    } catch (error) {
      console.error(error);
      alert(error.message || 'Answer-script review failed.');
    } finally {
      setLoading(false);
    }
  };

  const submitErrorQuiz = async (corrections) => {
    setLoading(true);
    try {
      const response = await fetch('/api/submit-answer-script-corrections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: student.id, corrections })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to submit your corrections.');
      setErrorQuizResult(data);
      setStudent((current) => ({ ...current, mastery: data.updatedMastery }));
    } catch (error) {
      console.error(error);
      alert(error.message || 'Correction submission failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerChange = (questionId, value) => {
    setQuizStartedAt((startedAt) => startedAt || Date.now());
    setQuizError('');
    setAnswers((current) => ({
      ...current,
      [questionId]: value
    }));
  };

  const handleCrashAnswerChange = (questionId, value) => {
    setCrashQuizAnswers((current) => ({
      ...current,
      [questionId]: value
    }));
  };

  const submitQuiz = async () => {
    if (!plan?.quiz?.length) return;
    if (plan.quiz.some((question) => !answers[question.id])) {
      setQuizError('Answer each question before submitting your quiz.');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('/api/quiz-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: student.id,
          quiz: plan.quiz,
          answers: plan.quiz.map((item) => answers[item.id] || ''),
          durationMinutes: quizStartedAt ? Math.round((Date.now() - quizStartedAt) / 60000) : 0
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Quiz submission failed.');
      }

      setResults(data);
      setMistakeDNA(data.mistakeDNA || null);
      setStudent((current) => ({
        ...current,
        mastery: data.updatedMastery,
        quizHistory: [...(current.quizHistory || []), data.quizResult].filter(Boolean)
      }));
      setPrediction(data.prediction || null);
      setQuizStartedAt(null);
      setQuizError('');
      setActiveTab('quiz');
    } catch (error) {
      console.error(error);
      alert(error.message || 'Quiz submission failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleNoteFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    setNoteUploadError('');
    setNoteSummary(null);
    if (file && file.size > 8 * 1024 * 1024) {
      setNoteFile(null);
      setNoteUploadError('Choose a file smaller than 8 MB.');
      event.target.value = '';
      return;
    }
    setNoteFile(file);
  };

  const summarizeUploadedNotes = async () => {
    if (!noteFile) return;
    setNoteUploadLoading(true);
    setNoteUploadError('');
    try {
      const isImage = noteFile.type.startsWith('image/');
      const fileContent = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('This file could not be read.'));
        if (isImage) reader.readAsDataURL(noteFile);
        else reader.readAsText(noteFile);
      });
      const response = await fetch('/api/summarize-handwritten-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: student.id,
          fileName: noteFile.name,
          mimeType: noteFile.type || 'text/plain',
          subject: noteUploadSubject,
          dataUrl: isImage ? fileContent : undefined,
          text: isImage ? undefined : fileContent
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to summarize these notes.');
      setNoteSummary(data.note);
      setStudent((current) => ({ ...current, uploadedNotes: [...(current.uploadedNotes || []), data.note] }));
    } catch (error) {
      console.error(error);
      setNoteUploadError(error.message || 'Note summarization failed.');
    } finally {
      setNoteUploadLoading(false);
    }
  };

  const checkCrashQuiz = () => {
    if (!crashPlan?.questions?.length) return;
    const total = crashPlan.questions.length;
    const correct = crashPlan.questions.filter((question) => crashQuizAnswers[question.question] === question.correctAnswer).length;
    setCrashScore(Math.round((correct / total) * 100));
  };

  const completeScheduleTask = async (item, completed) => {
    try {
      const response = await fetch('/api/schedule-task-completion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: student.id, taskId: item.taskId, date: item.scheduledDate, completed })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to update the study task.');
      setPrediction(data.prediction);
      setStudent((current) => ({ ...current, scheduleTaskCompletion: data.completion }));
    } catch (error) {
      console.error(error);
      alert(error.message || 'Task completion update failed.');
    }
  };

  const addScheduleItem = async (event) => {
    event.preventDefault();
    setScheduleError('');
    try {
      const response = await fetch('/api/schedule-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: student.id, ...scheduleForm })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to add this schedule item.');
      setPlan(data.plan);
      setStudent((current) => ({ ...current, latestPlan: data.plan }));
      setScheduleDateFilter(scheduleForm.date);
      setShowScheduleForm(false);
      setScheduleForm((current) => ({ ...current, topic: '' }));
    } catch (error) {
      console.error(error);
      setScheduleError(error.message || 'Unable to add this schedule item.');
    }
  };

  if (!student) {
    return (
      <main className="login-page">
        <section className="login-art" aria-label="Study workspace">
          <div className="login-brand">
            <img className="login-logo" src={prepGeniusLogo} alt="PrepGenius, Your Student Exam Prep Coach" />
          </div>
          <div className="login-art-copy">
            <p className="eyebrow">Your study space</p>
            <h1>Make every study session count.</h1>
            <div className="login-score-mark" aria-hidden="true">
              <span className="score-mark-line" />
              <span className="score-mark-dot" />
              <span className="score-mark-value">Focus<br />Progress<br />Confidence</span>
            </div>
          </div>
          <p className="login-art-footer">Personalized learning starts with you.</p>
        </section>
        <section className="login-form-side">
          <form className="login-form" onSubmit={submitLogin}>
            <p className="eyebrow">Student sign in</p>
            <h2>Welcome back</h2>
            <p className="login-intro">Enter your name and student email ID to open your learning profile.</p>
            <label htmlFor="loginName">Full name</label>
            <input
              id="loginName"
              name="name"
              autoComplete="name"
              value={loginName}
              onChange={(event) => setLoginName(event.target.value)}
              placeholder="e.g. Ava Patel"
              minLength={2}
              maxLength={80}
              required
            />
            <label htmlFor="loginEmail">Student email ID</label>
            <input
              id="loginEmail"
              name="email"
              type="email"
              autoComplete="email"
              value={loginEmail}
              onChange={(event) => setLoginEmail(event.target.value)}
              placeholder="you@school.edu"
              maxLength={254}
              required
            />
            {loginError && <p className="login-error" role="alert">{loginError}</p>}
            <button className="primary login-submit" type="submit" disabled={loading}>
              {loading ? 'Opening profile...' : 'Continue to dashboard'}
            </button>
            <small className="login-privacy">Your study history is kept with this email on this device.</small>
          </form>
        </section>
      </main>
    );
  }

  const renderCrashMode = () => (
    <section className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Crash mode</p>
          <h2>Exam in under 48 hours</h2>
        </div>
        <button className="primary" onClick={() => setCrashMode(false)}>
          Exit crash mode
        </button>
      </div>

      <div className="crash-tabs">
        <button className={crashTab === 'schedule' ? 'tab-button active' : 'tab-button'} onClick={() => setCrashTab('schedule')}>Hourly Schedule</button>
        <button className={crashTab === 'sheet' ? 'tab-button active' : 'tab-button'} onClick={() => setCrashTab('sheet')}>One-Page Sheet</button>
        <button className={crashTab === 'quiz' ? 'tab-button active' : 'tab-button'} onClick={() => setCrashTab('quiz')}>Top 10 Quiz</button>
      </div>

      {crashTab === 'schedule' && (
        <div className="schedule-list">
          {crashPlan?.plan?.map((entry) => (
            <div key={`${entry.hour}-${entry.task}`} className="schedule-item">
              <span className="schedule-day">{entry.hour}</span>
              <div>
                <strong>{entry.task}</strong>
                <p>High-priority rapid revision block</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {crashTab === 'sheet' && (
        <div className="print-sheet">
          <h3>One-Page Formula & Concept Sheet</h3>
          <ul>
            {crashPlan?.sheet?.map((line, index) => (
              <li key={`${line}-${index}`}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {crashTab === 'quiz' && (
        <div className="question-list">
          {crashPlan?.questions?.map((question) => (
            <div key={`${question.topic}-${question.question}`} className="question-card">
              <p className="question-topic">{question.topic}</p>
              <h4>{question.question}</h4>
              <div className="options-list">
                {question.options.map((option) => (
                  <label key={option} className="option-row">
                    <input
                      type="radio"
                      name={question.question}
                      value={option}
                      checked={crashQuizAnswers[question.question] === option}
                      onChange={() => handleCrashAnswerChange(question.question, option)}
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          <button className="primary" onClick={checkCrashQuiz}>Check answers</button>
          {crashScore !== null && (
            <div className="summary-box">
              <h3>Crash quiz score</h3>
              <p>You scored {crashScore}% on the last-minute review set.</p>
            </div>
          )}
        </div>
      )}
    </section>
  );

  const renderDashboard = () => (
    <section className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h2>Welcome back, {student.name}</h2>
        </div>
        <div className="dash-actions">
          <button className="secondary" onClick={launchCrashMode} disabled={loading}>
            {loading ? 'Preparing...' : '🚨 Exam Soon?'}
          </button>
          <button className="primary" onClick={generateStudyPlan} disabled={loading}>
            {loading ? 'Generating...' : 'Generate Study Plan'}
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <div className="mini-stat">
          <span>Average</span>
          <strong>{Math.round(Object.values(student.mastery).reduce((a, b) => a + b, 0) / Object.keys(student.mastery).length)}%</strong>
        </div>
        <div className="mini-stat">
          <span>Weak areas</span>
          <strong>{Object.entries(student.mastery).filter(([, value]) => value < 70).length}</strong>
        </div>
        <div className="mini-stat">
          <span>Exam date</span>
          <strong>{student.examDate}</strong>
        </div>
      </div>

      <ScoreForecast prediction={prediction} />

      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="topic" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" height={80} />
            <YAxis domain={[0, 100]} />
            <Tooltip />
            <Bar dataKey="score" fill="#4f46e5" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="gap-list">
        <h3>Knowledge gaps</h3>
        {Object.entries(student.mastery)
          .filter(([, score]) => score < 70)
          .map(([topic, score]) => (
            <div key={topic} className="gap-item">
              <span>{topic}</span>
              <div className="progress-track"><div style={{ width: `${score}%` }} /></div>
              <b>{score}%</b>
            </div>
          ))}
      </div>

      {(student.importantTopics || []).length > 0 && (
        <div className="important-subjects-strip">
          <h3>Important topics</h3>
          <div>
            {student.importantTopics.map((topic) => (
              <span className="important-topic-chip" key={topic}><i aria-hidden="true" />{topic}</span>
            ))}
          </div>
        </div>
      )}

      {(mistakeDNA || plan?.mistakeDNA) && (
        <div className="mistake-dna-box">
          <h3>Mistake DNA</h3>
          <p>{(mistakeDNA || plan.mistakeDNA).summary}</p>
          <div className="mistake-metrics">
            <span>Sign errors: {(mistakeDNA || plan.mistakeDNA).signErrorRate}%</span>
            <span>Rushed last questions: {(mistakeDNA || plan.mistakeDNA).rushedLastQuestions}</span>
            <span>Formula confusion: {(mistakeDNA || plan.mistakeDNA).formulaConfusionRate}%</span>
          </div>
        </div>
      )}

      {plan && (
        <div className="summary-box">
          <h3>Latest insight</h3>
          <p>{plan.summary}</p>
        </div>
      )}
    </section>
  );

  const renderInput = () => (
    <section className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Quiz input</p>
          <h2>Latest assessment results</h2>
        </div>
      </div>

      <div className="quiz-input-grid">
        <div className="marks-table-heading"><strong>Subject</strong><strong>Marks (%)</strong></div>
        {Object.entries(scoreInputs).map(([topic, score]) => (
          <div key={topic} className="marks-table-row">
            <span>{topic}</span>
            <label className="score-field">
              <span className="visually-hidden">{topic} marks out of 100</span>
              <input type="number" min="0" max="100" value={score} onChange={(event) => handleScoreChange(topic, event.target.value)} onBlur={(event) => updateSubjectMark(topic, event.target.value)} />
            </label>
          </div>
        ))}
      </div>

      <div className="file-upload">
        <label htmlFor="resultsUpload">Import latest assessment</label>
        <input id="resultsUpload" type="file" accept=".pdf,.png,.jpg,.jpeg,.docx,.pptx,.csv,.json,application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/json,text/csv" onChange={handleAssessmentUpload} />
        <small>Upload PDF, PNG/JPG, DOCX, PPTX, CSV, or JSON. Documents and images are read by the configured AI service.</small>
        {assessmentUploadStatus && <p className="assessment-upload-status" role="status">{assessmentUploadStatus}</p>}
        {assessmentUploadError && <p className="assessment-upload-error" role="alert">{assessmentUploadError}</p>}
      </div>
    </section>
  );

  const renderQuiz = () => {
    if (!plan?.quiz?.length) {
      return (
        <section className="panel empty-panel">
          <h3>No practice quiz generated yet.</h3>
          <p>Generate a quiz based on your latest topic scores.</p>
          <button className="primary" onClick={generateStudyPlan} disabled={loading}>
            {loading ? 'Preparing quiz...' : 'Generate practice quiz'}
          </button>
        </section>
      );
    }

    return (
      <section className="panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Practice quiz</p>
            <h2>Adaptive review set</h2>
          </div>
          <button className="primary" onClick={submitQuiz} disabled={loading || Boolean(results)}>{results ? 'Quiz submitted' : 'Submit answers'}</button>
        </div>

        {quizError && <p className="quiz-error" role="alert">{quizError}</p>}

        <div className="question-list">
          {plan.quiz.map((question) => (
            <div key={question.id} className="question-card">
              <p className="question-topic">{question.topic}</p>
              <h4>{question.question}</h4>
              <div className="options-list">
                {question.options.map((option) => (
                  <label key={option} className="option-row">
                    <input
                      type="radio"
                      name={question.id}
                      value={option}
                      checked={answers[question.id] === option}
                      onChange={() => handleAnswerChange(question.id, option)}
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button className="secondary notes-from-quiz" onClick={() => setActiveTab('notes')}>Review your summary notes</button>
      </section>
    );
  };

  const renderNotes = () => (
    <section className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Notes & explanations</p>
          <h2>Personalized review</h2>
        </div>
      </div>

      <div className="handwritten-upload">
        <div>
          <h3>Add handwritten notes</h3>
          <p>Upload a clear photo or a text file to create a saved summary.</p>
        </div>
        <div className="handwritten-upload-actions">
          <label className="note-subject-select">Subject
            <select value={noteUploadSubject} onChange={(event) => setNoteUploadSubject(event.target.value)}>
              {Object.keys(student.mastery || {}).map((topic) => <option key={topic} value={topic}>{topic}</option>)}
            </select>
          </label>
          <label className="secondary upload-file-button" htmlFor="handwrittenNotesFile">Choose image or file</label>
          <input
            id="handwrittenNotesFile"
            className="visually-hidden-input"
            type="file"
            accept="image/*,.txt,.md,text/plain,text/markdown"
            onChange={handleNoteFileChange}
          />
          <span className="selected-note-file">{noteFile?.name || 'No file selected'}</span>
          <button className="primary" onClick={summarizeUploadedNotes} disabled={!noteFile || noteUploadLoading}>
            {noteUploadLoading ? 'Summarizing...' : 'Summarize notes'}
          </button>
        </div>
        {noteUploadError && <p className="note-upload-error" role="alert">{noteUploadError}</p>}
      </div>

      {noteSummary && (
        <article className="uploaded-note-summary">
          <p className="eyebrow">Uploaded summary · {noteSummary.fileName}</p>
          <h3>{noteSummary.title || 'Key points'}</h3>
          <ul>{noteSummary.bullets?.map((bullet, index) => <li key={`${index}-${bullet}`}>{bullet}</li>)}</ul>
        </article>
      )}

      {(student.uploadedNotes || []).length > 1 && (
        <div className="saved-note-list">
          <p className="eyebrow">Saved uploaded notes</p>
          {(student.uploadedNotes || []).map((note, index) => (
            <button className="saved-note-row" type="button" key={`${note.createdAt}-${index}`} onClick={() => setNoteSummary(note)}>
              <span>{note.fileName}</span><small>{note.subject || student.subject}</small>
            </button>
          ))}
        </div>
      )}

      {!plan?.notes?.length ? (
        <div className="empty-panel">
          <p>Generate a study plan first to view your tailored topic summaries.</p>
        </div>
      ) : (
        <div className="notes-grid">
          {plan.notes.map((entry) => (
            <div key={entry.topic} className="note-card">
              <div className="note-card-heading">
                <h3>{entry.topic}</h3>
                <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${entry.topic} lesson summary`)}`} target="_blank" rel="noreferrer">Find video lesson ↗</a>
              </div>
              <ul>
                {entry.notes.map((note) => (
                  <li key={`${entry.topic}-${note.text}`}>{note.text}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );

  const renderSchedule = () => {
    const scheduleItems = plan?.schedule?.schedule || [];
    const dayItems = scheduleItems.filter((item) => item.scheduledDate === scheduleDateFilter);
    const scheduledMinutes = dayItems.reduce((sum, item) => sum + (Number(item.durationMinutes) || 60), 0);
    const dailyAvailableMinutes = 8 * 60;
    const freeMinutes = Math.max(0, dailyAvailableMinutes - scheduledMinutes);
    const timeChartData = [
      { name: 'Scheduled', value: scheduledMinutes },
      { name: 'Free time', value: freeMinutes }
    ];

    return (
      <section className="panel">
        <div className="section-header schedule-header">
          <div>
            <p className="eyebrow">Revision schedule</p>
            <h2>Plan your study time</h2>
          </div>
          <button className="primary" type="button" onClick={() => setShowScheduleForm((visible) => !visible)}>
            {showScheduleForm ? 'Close' : '+ Add schedule'}
          </button>
        </div>

        {showScheduleForm && (
          <form className="schedule-add-form" onSubmit={addScheduleItem}>
            <label>Topic
              <input list="schedule-topics" value={scheduleForm.topic} required maxLength={100} onChange={(event) => setScheduleForm((current) => ({ ...current, topic: event.target.value }))} placeholder="e.g. Algebra" />
              <datalist id="schedule-topics">{Object.keys(student.mastery || {}).map((topic) => <option key={topic} value={topic} />)}</datalist>
            </label>
            <label>Date<input type="date" value={scheduleForm.date} required onChange={(event) => setScheduleForm((current) => ({ ...current, date: event.target.value }))} /></label>
            <label>Start time<input type="time" value={scheduleForm.time} required onChange={(event) => setScheduleForm((current) => ({ ...current, time: event.target.value }))} /></label>
            <label>Duration
              <select value={scheduleForm.durationMinutes} onChange={(event) => setScheduleForm((current) => ({ ...current, durationMinutes: Number(event.target.value) }))}>
                <option value={30}>30 minutes</option><option value={45}>45 minutes</option><option value={60}>1 hour</option><option value={90}>1.5 hours</option><option value={120}>2 hours</option>
              </select>
            </label>
            <label>Difficulty
              <select value={scheduleForm.difficultyLevel} onChange={(event) => setScheduleForm((current) => ({ ...current, difficultyLevel: event.target.value }))}>
                <option>Hard</option><option>Medium</option><option>Easy</option>
              </select>
            </label>
            <button className="primary" type="submit">Save study block</button>
            {scheduleError && <p className="schedule-error" role="alert">{scheduleError}</p>}
          </form>
        )}

        <div className="schedule-time-overview">
          <div className="schedule-time-copy">
            <p className="eyebrow">Daily time overview</p>
            <h3>{new Date(`${scheduleDateFilter}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
            <p>{dayItems.length} scheduled {dayItems.length === 1 ? 'item' : 'items'} · {Math.floor(scheduledMinutes / 60)}h {scheduledMinutes % 60}m planned</p>
            <label className="schedule-date-filter">View date<input type="date" value={scheduleDateFilter} onChange={(event) => setScheduleDateFilter(event.target.value)} /></label>
            <p className="free-time-total">{Math.floor(freeMinutes / 60)}h {freeMinutes % 60}m free in an 8-hour study window</p>
          </div>
          <div className="schedule-pie-wrap">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={timeChartData} dataKey="value" nameKey="name" innerRadius={54} outerRadius={82} paddingAngle={3}>
                  <Cell fill="#2c8c7b" />
                  <Cell fill="#e7ece8" />
                </Pie>
                <Tooltip formatter={(value) => `${Math.floor(value / 60)}h ${value % 60}m`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {!scheduleItems.length ? (
          <div className="empty-panel"><p>No study blocks yet. Add one here or generate a study plan.</p></div>
        ) : (
          <div className="schedule-list">
            {scheduleItems.map((item) => (
              <div key={item.taskId || `${item.day}-${item.topic}`} className="schedule-item energy-schedule-item">
                <span className="schedule-day">{item.day}<small>{item.optimalTimeOfDay}</small></span>
                <div>
                  <strong>{item.topic}</strong>
                  <p>{item.task}</p>
                  <span className={`energy-tag ${item.difficultyLevel === 'Hard' ? 'deep-work' : 'quick-review'}`}>
                    {item.difficultyLevel === 'Hard' ? '🔥' : '☕'} {item.slotType}
                  </span>
                  <p className="schedule-insight">{item.insight}</p>
                </div>
                {item.taskId && <label className="task-completion">
                  <input type="checkbox" checked={Boolean(student.scheduleTaskCompletion?.[item.scheduledDate]?.[item.taskId])} onChange={(event) => completeScheduleTask(item, event.target.checked)} />
                  <span>Done</span>
                </label>}
              </div>
            ))}
          </div>
        )}
      </section>
    );
  };

  const renderProfile = () => (
    <section className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Profile</p>
          <h2>Student settings</h2>
        </div>
      </div>

      <div className="profile-card">
        <div>
          <label>Student name</label>
          <input value={student.name} readOnly />
        </div>
        <div>
          <label>Class</label>
          <input value={student.year} readOnly />
        </div>
        <div>
          <label>Preferred study style</label>
          <input value={student.profile.learningStyle} readOnly />
        </div>
      </div>

      <section className="profile-settings-section">
        <div className="profile-section-heading">
          <div><p className="eyebrow">Subjects</p><h3>Subject marks</h3></div>
          <span>Marks are out of 100</span>
        </div>
        <div className="subject-table" role="table" aria-label="Subjects and marks">
          <div className="subject-table-head" role="row"><span role="columnheader">Subject</span><span role="columnheader">Marks</span><span role="columnheader">Importance</span><span role="columnheader">Action</span></div>
          {Object.entries(student.mastery || {}).map(([subject, mark]) => {
            const important = (student.importantTopics || []).includes(subject);
            return (
              <div className="subject-table-row" role="row" key={subject}>
                <span className="subject-name-cell" role="cell">
                  {editingSubject === subject ? (
                    <form className="rename-subject-form" onSubmit={(event) => { event.preventDefault(); renameSubject(subject); }}>
                      <input aria-label={`New name for ${subject}`} value={subjectNameDraft} onChange={(event) => setSubjectNameDraft(event.target.value)} maxLength={80} autoFocus required />
                      <button type="submit" aria-label={`Save ${subject} name`}>Save</button>
                      <button type="button" aria-label="Cancel rename" onClick={() => setEditingSubject(null)}>Cancel</button>
                    </form>
                  ) : (
                    <><span>{subject}</span><button className="edit-subject-button" type="button" onClick={() => { setEditingSubject(subject); setSubjectNameDraft(subject); }} aria-label={`Edit ${subject} name`} title="Edit subject name">Edit</button></>
                  )}
                </span>
                <label className="subject-mark-field" role="cell"><span className="visually-hidden">{subject} marks</span><input type="number" min="0" max="100" value={mark} onChange={(event) => handleScoreChange(subject, event.target.value)} onBlur={(event) => updateSubjectMark(subject, event.target.value)} /></label>
                <span role="cell">
                  <button className={`importance-toggle${important ? ' is-important' : ''}`} type="button" onClick={() => toggleImportantTopic(subject)} aria-pressed={important} aria-label={`${important ? 'Remove' : 'Mark'} ${subject} as important`} title={important ? 'Important subject' : 'Mark as important'}><i /></button>
                </span>
                <span role="cell"><button className="remove-subject-button" type="button" onClick={() => removeSubject(subject)} disabled={Object.keys(student.mastery).length <= 1}>Remove</button></span>
              </div>
            );
          })}
        </div>
        <form className="add-subject-form" onSubmit={addSubject}>
          <label htmlFor="newSubject">Add a subject</label>
          <input id="newSubject" value={newSubject} onChange={(event) => setNewSubject(event.target.value)} placeholder="e.g. History" maxLength={80} required />
          <button className="primary" type="submit" disabled={!newSubject.trim()}>Add subject</button>
        </form>
      </section>

      <section className="profile-settings-section important-topics-section">
        <div className="profile-section-heading">
          <div><p className="eyebrow">Focus</p><h3>Important topics</h3></div>
          <span>Circle a subject to keep it in focus</span>
        </div>
        <form className="add-important-form" onSubmit={addImportantTopic}>
          <label htmlFor="importantTopicChoice">Add important topic</label>
          <select id="importantTopicChoice" value={importantTopicChoice} onChange={(event) => setImportantTopicChoice(event.target.value)}>
            <option value="">Choose a subject</option>
            {Object.keys(student.mastery || {}).filter((topic) => !(student.importantTopics || []).includes(topic)).map((topic) => <option key={topic} value={topic}>{topic}</option>)}
          </select>
          <button className="primary" type="submit" disabled={!importantTopicChoice}>Add important topic</button>
        </form>
        <div className="important-topic-list">
          {(student.importantTopics || []).length ? student.importantTopics.map((topic) => (
            <button className="important-topic-chip" key={topic} type="button" onClick={() => toggleImportantTopic(topic)} title="Remove important topic"><i aria-hidden="true" />{topic}<span>×</span></button>
          )) : <p>No important topics selected yet.</p>}
        </div>
      </section>

      <section className="profile-settings-section appearance-section">
        <div><p className="eyebrow">Appearance</p><h3>Dark mode</h3><p>Choose a lower-light theme for your study space.</p></div>
        <label className="theme-switch">
          <span>{student.darkMode ? 'On' : 'Off'}</span>
          <input type="checkbox" checked={Boolean(student.darkMode)} onChange={(event) => setDarkMode(event.target.checked)} />
          <i aria-hidden="true" />
        </label>
      </section>
      <p className="profile-save-status" aria-live="polite">{profileSaveStatus}</p>

      <div className="login-box">
        <label htmlFor="studentId">Switch profile</label>
        <div className="login-input-row">
          <input
            id="studentId"
            value={studentIdInput}
            onChange={(event) => setStudentIdInput(event.target.value)}
          />
          <button className="primary" onClick={() => loadStudent(studentIdInput)}>Load</button>
        </div>
      </div>
    </section>
  );

  const renderStudyAids = () => (
    <section className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Built from your recent errors</p>
          <h2>Personal study aids</h2>
        </div>
        <div className="study-aid-actions">
          <label>Subject
            <select value={studyAidSubject} onChange={(event) => setStudyAidSubject(event.target.value)}>
              {[...new Set([student.subject, ...Object.keys(student.mastery || {})].filter(Boolean))].map((topic) => <option key={topic} value={topic}>{topic}</option>)}
            </select>
          </label>
          <button className="primary" onClick={generateStudyAids} disabled={loading}>
            {loading ? 'Generating...' : 'Generate materials'}
          </button>
        </div>
      </div>
      <div className="crash-tabs" role="tablist" aria-label="Study aid type">
        <button className={studyAidTab === 'flashcards' ? 'tab-button active' : 'tab-button'} onClick={() => setStudyAidTab('flashcards')} role="tab" aria-selected={studyAidTab === 'flashcards'}>Flashcards</button>
        <button className={studyAidTab === 'cheat-sheet' ? 'tab-button active' : 'tab-button'} onClick={() => setStudyAidTab('cheat-sheet')} role="tab" aria-selected={studyAidTab === 'cheat-sheet'}>Cheat sheet</button>
      </div>
      {studyAidTab === 'flashcards' && <FlashcardView cards={studyAids?.cards || student.generatedFlashcards || []} />}
      {studyAidTab === 'cheat-sheet' && <CheatSheetView cheatSheet={studyAids?.cheatSheet || student.generatedCheatSheet} />}
    </section>
  );

  return (
    <div className={`app-shell${student.darkMode ? ' dark-theme' : ''}`}>
      <aside className="sidebar">
        <div className="brand-block">
          <img className="sidebar-logo-mark" src={prepGeniusMark} alt="" />
          <div>
            <h1>PrepGenius</h1>
            <small>AI exam prep coach</small>
          </div>
        </div>

        <nav className="nav">
          {tabLabels.map((tab) => (
            <button
              key={tab}
              className={activeTab === tab ? 'nav-button active' : 'nav-button'}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </nav>
        <button className="sign-out-button" onClick={() => setStudent(null)}>Sign out</button>
      </aside>

      <main className="content">
        {crashMode ? renderCrashMode() : (
          <>
            {activeTab === 'dashboard' && renderDashboard()}
            {activeTab === 'quiz' && renderQuiz()}
            {activeTab === 'notes' && renderNotes()}
            {activeTab === 'schedule' && renderSchedule()}
            {activeTab === 'study aids' && renderStudyAids()}
            {activeTab === 'find the error' && <section className="panel"><ErrorSpotterQuiz topics={Object.keys(student.mastery || {})} review={errorQuiz} result={errorQuizResult} loading={loading} onReview={generateErrorQuiz} onSubmit={submitErrorQuiz} /></section>}
            {activeTab === 'profile' && renderProfile()}
            {activeTab === 'dashboard' && renderInput()}
          </>
        )}

        {results && (
          <section className="panel feedback-panel">
            <p className="eyebrow">Feedback</p>
            <h3>{results.score}% score</h3>
            <p>{results.feedback}</p>
          </section>
        )}
        {(activeTab === 'notes' || activeTab === 'quiz') && (
          <VoiceTutor contextTopics={Array.from(new Set([
            ...(plan?.notes || []).map((entry) => entry.topic),
            ...(plan?.quiz || []).map((question) => question.topic)
          ])).filter(Boolean)} />
        )}
      </main>
    </div>
  );
}

export default App;
