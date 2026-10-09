const { createAIClient, getAIModel, hasOpenAICompatibleKey } = require('./aiClient');
const { getStudentProfile, getRecentIncorrectAnswers, updateStudent } = require('../memory/profileStore');

function topicMatchesSubject(topic, subject, studentSubject) {
  const topicName = String(topic || '').toLowerCase();
  const subjectName = String(subject || '').toLowerCase();
  if (!subjectName) return true;
  if (topicName === subjectName || topicName.includes(subjectName) || subjectName.includes(topicName)) return true;
  if ((subjectName === 'physics' || studentSubject?.toLowerCase() === 'physics') && /force|motion|energy|wave/.test(topicName)) return true;
  if ((subjectName === 'chemistry' || studentSubject?.toLowerCase() === 'chemistry') && /chemical|bond|reaction|acid|atom/.test(topicName)) return true;
  if ((subjectName === 'math' || subjectName === 'mathematics') && /algebra|geometry|equation|number|calculus/.test(topicName)) return true;
  if (subjectName === 'biology' && /cell|biology|genetic|organism/.test(topicName)) return true;
  if (subjectName === 'english' && /essay|writing|grammar|literature|structure/.test(topicName)) return true;
  return false;
}

function getKnowledgeGaps(student, subject) {
  const masteryGaps = Object.entries(student?.mastery || {})
    .filter(([, score]) => Number(score) < 70)
    .filter(([topic]) => topicMatchesSubject(topic, subject, student?.subject))
    .map(([topic, score]) => ({ topic, score, source: 'mastery' }));
  const explicitGaps = (student?.knowledgeGaps || []).map((gap) => ({
    topic: typeof gap === 'string' ? gap : gap.topic,
    score: typeof gap === 'object' ? gap.score : undefined,
    source: 'knowledge-gap'
  }));
  return [...masteryGaps, ...explicitGaps].filter((gap) => gap.topic && topicMatchesSubject(gap.topic, subject, student?.subject));
}

function fallbackStudyAids(errors, notes, subject) {
  const evidenceCount = errors.length + notes.reduce((count, note) => count + note.bullets.length, 0);
  const cards = Array.from({ length: Math.min(5, evidenceCount * 5) }, (_, index) => {
    const noteBullets = notes.flatMap((note) => note.bullets.map((bullet) => ({ bullet, fileName: note.fileName })));
    if (noteBullets.length && index % 2 === 1 || !errors.length) {
      const note = noteBullets[index % noteBullets.length];
      return {
        front: `Recall this point from ${note.fileName}: ${note.bullet}`,
        back: `Key point: ${note.bullet}\nMemory cue: explain this point aloud in your own words.`,
        sourceTopic: subject
      };
    }
    const error = errors[index % errors.length];
    const prompts = [
      `What is the correct reasoning for: ${error.question}`,
      `Which concept did you miss in ${error.topic}?`,
      `How should you solve this correctly: ${error.question}`,
      `What should you check before answering: ${error.question}`,
      `Recall the correction for this ${error.topic} mistake`
    ];
    return {
      front: prompts[index % prompts.length],
      back: `Correct logic: ${error.correctAnswer}.\nMnemonic: Recall ${error.concept}, apply the correct rule, then check that your result is ${error.correctAnswer}.`,
      sourceTopic: error.topic
    };
  });

  const grouped = new Map();
  for (const error of errors) {
    const section = grouped.get(error.topic) || [];
    section.push(`Missed: ${error.question} Correct logic: ${error.correctAnswer}. Recheck ${error.concept} before answering.`);
    grouped.set(error.topic, section);
  }
  for (const note of notes) {
    const section = grouped.get(subject) || [];
    section.push(...note.bullets.map((bullet) => `${note.fileName}: ${bullet}`));
    grouped.set(subject, section);
  }

  return {
    cards,
    cheatSheet: {
      title: `Your ${subject} review sheet`,
      sections: Array.from(grouped, ([topic, items]) => ({ topic, items }))
    }
  };
}

async function generateFlashcards(studentId, requestedSubject) {
  const student = getStudentProfile(studentId);
  if (!student) throw new Error('Student profile not found.');

  const subject = String(requestedSubject || student.studyAidSubject || student.subject || Object.keys(student.mastery || {})[0] || 'General study').trim();
  const errors = getRecentIncorrectAnswers(studentId, 30)
    .filter((error) => topicMatchesSubject(error.topic, subject, student.subject));
  const notes = (student.uploadedNotes || [])
    .filter((note) => topicMatchesSubject(note.subject || student.subject, subject, student.subject))
    .map((note) => ({ ...note, bullets: Array.isArray(note.bullets) ? note.bullets.filter(Boolean) : [] }))
    .filter((note) => note.bullets.length);
  const gaps = getKnowledgeGaps(student, subject);
  const gapTopics = new Set([
    ...gaps.map((gap) => gap.topic.toLowerCase()),
    ...errors.map((error) => String(error.topic).toLowerCase())
  ]);
  const scopedErrors = errors.filter((error) => gapTopics.has(String(error.topic).toLowerCase()) || gapTopics.size === 0);

  if (!scopedErrors.length && !notes.length) {
    const emptyResult = { subject, cards: [], cheatSheet: { title: `Your ${subject} review sheet`, sections: [] }, sourceErrors: 0, sourceNotes: 0 };
    updateStudent(studentId, { studyAidSubject: subject, generatedFlashcardSubject: subject, generatedFlashcards: emptyResult.cards, generatedCheatSheet: emptyResult.cheatSheet });
    return emptyResult;
  }

  let generated = null;
  if (hasOpenAICompatibleKey()) {
    try {
      const client = createAIClient();
      const response = await client.chat.completions.create({
        model: getAIModel(),
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Create exactly 5 personalized flashcards and a one-page cheat sheet for ${subject}. Use exclusively the supplied incorrect answers, uploaded note summaries, and knowledge-gap topics. Do not add facts, topics, or examples outside those sources. Each card must have front, back (correct logic plus a memorable mnemonic), and sourceTopic. Cheat sheet must have title and sections [{topic,items}]. Return JSON only.`
          },
          {
            role: 'user',
            content: JSON.stringify({ subject, incorrectAnswers: scopedErrors, uploadedNoteSummaries: notes, knowledgeGaps: gaps })
          }
        ]
      });
      const parsed = JSON.parse(response.choices?.[0]?.message?.content || '{}');
      if (Array.isArray(parsed.cards) && parsed.cheatSheet?.sections) {
        const allowedTopics = new Set([subject.toLowerCase(), ...scopedErrors.map((error) => error.topic.toLowerCase())]);
        const cards = parsed.cards
          .filter((card) => allowedTopics.has(String(card.sourceTopic || '').toLowerCase()))
          .slice(0, 5)
          .map((card) => ({ front: String(card.front), back: String(card.back), sourceTopic: String(card.sourceTopic) }));
        const sections = parsed.cheatSheet.sections
          .filter((section) => allowedTopics.has(String(section.topic || '').toLowerCase()))
          .map((section) => ({ topic: String(section.topic), items: Array.isArray(section.items) ? section.items.map(String) : [] }));
        if (cards.length === 5 && sections.length) generated = { cards, cheatSheet: { title: String(parsed.cheatSheet.title || `Your ${subject} review sheet`), sections } };
      }
    } catch (error) {
      console.warn('Flashcard generation failed, using error-grounded fallback.', error.message);
    }
  }

  const result = generated || fallbackStudyAids(scopedErrors, notes, subject);
  result.subject = subject;
  result.sourceErrors = scopedErrors.length;
  result.sourceNotes = notes.length;
  result.generatedAt = new Date().toISOString();
  updateStudent(studentId, { studyAidSubject: subject, generatedFlashcardSubject: subject, generatedFlashcards: result.cards, generatedCheatSheet: result.cheatSheet });
  return result;
}

module.exports = { generateFlashcards, getKnowledgeGaps, topicMatchesSubject };