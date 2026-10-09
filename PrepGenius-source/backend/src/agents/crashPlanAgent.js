const { createAIClient, getAIModel, hasOpenAICompatibleKey } = require('./aiClient');
const { getStudentProfile } = require('../memory/profileStore');

function normalizeTopicName(topic = '') {
  const value = String(topic).trim();
  if (!value) return '';

  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const aliases = {
    'forces and motion': 'Physics',
    'force and motion': 'Physics',
    'motion': 'Physics',
    'physics': 'Physics',
    'chemical bonding': 'Chemistry',
    'chemistry': 'Chemistry',
    'algebra': 'Math',
    'math': 'Math',
    'mathematics': 'Math',
    'cell biology': 'Biology',
    'biology': 'Biology',
    'essay structure': 'English',
    'writing': 'English',
    'english': 'English'
  };

  return aliases[normalized] || value;
}

function dedupeTopics(topics = []) {
  const seen = new Set();
  return topics
    .map((topic) => normalizeTopicName(topic))
    .filter((topic) => {
      const key = String(topic).trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function getWeakTopics(student, explicitTopics = []) {
  if (Array.isArray(explicitTopics) && explicitTopics.length) {
    return dedupeTopics(explicitTopics);
  }

  if (!student?.mastery) {
    return ['Physics', 'Chemistry', 'Math', 'Biology', 'English'];
  }

  return dedupeTopics(Object.entries(student.mastery)
    .filter(([, score]) => Number(score) < 70)
    .map(([topic]) => topic)
    .slice(0, 5));
}

function buildFallbackCrashPlan(weakTopics = []) {
  const topics = dedupeTopics(weakTopics.length ? weakTopics : ['Physics', 'Chemistry', 'Math']);
  const sheet = topics.flatMap((topic) => {
    const topicFacts = {
      Physics: [
        '- F = ma',
        '- v = u + at',
        '- Work = force × distance',
        '- Check units before finalising the answer'
      ],
      Chemistry: [
        '- Balance atoms on both sides',
        '- pH = -log[H+]',
        '- Reactivity depends on electron arrangement',
        '- Use the periodic table to predict trends'
      ],
      Math: [
        '- Rearrange first, then solve',
        '- y = mx + c',
        '- Check sign changes carefully',
        '- Simplify before substituting values'
      ],
      Biology: [
        '- Cells are the basic unit of life',
        '- DNA → RNA → protein',
        '- Diffusion and osmosis are key transport ideas',
        '- Homeostasis keeps internal conditions stable'
      ],
      English: [
        '- Thesis = argument + answer',
        '- PEEL structure for paragraphs',
        '- Link evidence to reasoning',
        '- Revise grammar and sentence variety'
      ]
    };

    return [`${topic}:`, ...(topicFacts[topic] || ['- Recall definitions and key examples', '- Practise one example question'])];
  });

  const questions = topics.flatMap((topic) => {
    const baseQuestions = {
      Physics: [
        { question: 'A 5 kg object accelerates at 2 m/s². What is the force?', options: ['5 N', '7 N', '10 N', '20 N'], correctAnswer: '10 N', topic },
        { question: 'Which quantity is defined as force × distance?', options: ['Power', 'Work', 'Momentum', 'Pressure'], correctAnswer: 'Work', topic },
        { question: 'If the net force on a moving object is zero, what happens to its motion?', options: ['It speeds up', 'It slows down', 'It continues at constant velocity', 'It stops instantly'], correctAnswer: 'It continues at constant velocity', topic }
      ],
      Chemistry: [
        { question: 'Balance the equation: H2 + O2 → H2O', options: ['H2 + O2 → H2O', '2H2 + O2 → 2H2O', 'H2 + 2O2 → 2H2O', '2H2 + 2O2 → 2H2O'], correctAnswer: '2H2 + O2 → 2H2O', topic },
        { question: 'Which is the correct formula for sulfuric acid?', options: ['HCl', 'H2SO4', 'NaOH', 'NH3'], correctAnswer: 'H2SO4', topic },
        { question: 'What does pH measure?', options: ['Temperature', 'Acidity or alkalinity', 'Mass', 'Volume'], correctAnswer: 'Acidity or alkalinity', topic }
      ],
      Math: [
        { question: 'Solve: 3x + 6 = 18', options: ['2', '3', '4', '5'], correctAnswer: '4', topic },
        { question: 'What is the slope of y = 2x + 5?', options: ['2', '5', '-2', '0'], correctAnswer: '2', topic },
        { question: 'What is 5²?', options: ['10', '15', '20', '25'], correctAnswer: '25', topic }
      ],
      Biology: [
        { question: 'Which organelle makes ATP?', options: ['Nucleus', 'Mitochondria', 'Ribosome', 'Cell membrane'], correctAnswer: 'Mitochondria', topic },
        { question: 'What process moves water through a membrane?', options: ['Diffusion', 'Osmosis', 'Respiration', 'Photosynthesis'], correctAnswer: 'Osmosis', topic },
        { question: 'What does DNA carry?', options: ['Heat energy', 'Genetic instructions', 'Cell wall material', 'Enzymes only'], correctAnswer: 'Genetic instructions', topic }
      ],
      English: [
        { question: 'What is the purpose of a topic sentence?', options: ['To add a quote', 'To end the paragraph', 'To introduce the main idea', 'To copy the question'], correctAnswer: 'To introduce the main idea', topic },
        { question: 'Which structure is most effective in an analytical paragraph?', options: ['PEEL', 'PETA', 'SODA', 'LAP'], correctAnswer: 'PEEL', topic },
        { question: 'What should a thesis do?', options: ['State the main argument clearly', 'Summarise all paragraphs', 'Describe the examiner', 'Hide the answer'], correctAnswer: 'State the main argument clearly', topic }
      ]
    };

    return baseQuestions[topic]?.slice(0, 2) || [{
      question: `Quick recall: what is a key idea in ${topic}?`,
      options: ['Define the concept', 'Memorise the formula', 'Review examples', 'All of the above'],
      correctAnswer: 'All of the above',
      topic
    }];
  }).slice(0, 10);

  const plan = topics.map((topic, index) => ({
    hour: `${index + 1}:00`,
    task: `Review ${topic} key ideas, complete 10 quick recall questions, and check one worked example.`
  }));

  return {
    plan: plan.length ? plan : [
      { hour: '1:00', task: 'Review formula sheet and key definitions.' },
      { hour: '2:00', task: 'Work through 10 mixed recall questions.' },
      { hour: '3:00', task: 'Check weak areas and reattempt one tricky topic.' }
    ],
    sheet,
    questions: questions.slice(0, 10)
  };
}

async function generateCrashPlan(studentId, weakTopics = [], examDate) {
  const student = getStudentProfile(studentId);
  const resolvedTopics = getWeakTopics(student, weakTopics);
  const fallback = buildFallbackCrashPlan(resolvedTopics);

  if (hasOpenAICompatibleKey()) {
    try {
      const client = createAIClient();
      const response = await client.chat.completions.create({
        model: getAIModel(),
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content: 'Act as an emergency exam tutor. Prioritize high-frequency concepts. Be extremely concise.'
          },
          {
            role: 'user',
            content: `Create a 24-hour crash-study plan for a student with just under 48 hours before the exam. Topics: ${resolvedTopics.join(', ')}. Use this JSON structure: {"plan":[{"hour":"1:00","task":"..."}],"sheet":["- bullet point 1","- bullet point 2"],"questions":[{"question":"...","options":[...],"correctAnswer":"...","topic":"..."}]}. Keep the sheet strictly bullet points, no fluff, and make the questions high-yield.`
          }
        ]
      });

      const text = response.choices?.[0]?.message?.content || '';
      const cleaned = text.replace(/```json|```/g, '').trim();
      if (cleaned) {
        const parsed = JSON.parse(cleaned);
        if (parsed && parsed.plan && parsed.sheet && parsed.questions) {
          return {
            examDate: examDate || student?.examDate || 'TBD',
            plan: parsed.plan,
            sheet: parsed.sheet,
            questions: parsed.questions.slice(0, 10),
            generatedAt: new Date().toISOString()
          };
        }
      }
    } catch (error) {
      console.warn('Crash plan generation failed, using fallback data.', error.message);
    }
  }

  return {
    examDate: examDate || student?.examDate || 'TBD',
    ...fallback,
    generatedAt: new Date().toISOString()
  };
}

module.exports = {
  generateCrashPlan
};
