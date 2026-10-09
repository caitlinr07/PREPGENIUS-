const studentData = {
  ava: {
    id: 'ava',
    name: 'Ava Patel',
    year: 'Year 11',
    subject: 'Physics',
    examDate: '2026-10-20',
    profile: {
      learningStyle: 'clear and visual',
      preferredDifficulty: 'mixed',
      retentionStrategy: 'spaced repetition'
    },
    mastery: {
      'Forces and motion': 62,
      'Chemical bonding': 58,
      'Algebra': 70,
      'Cell biology': 81,
      'Essay structure': 66
    },
    recentTests: [
      {
        date: '2026-10-03',
        scores: {
          'Forces and motion': 74,
          'Chemical bonding': 69,
          'Algebra': 58,
          'Cell biology': 81,
          'Essay structure': 63
        }
      }
    ],
    mistakeDNA: {
      summary: 'You make sign errors 40% of the time, rush the last 5 questions, and get confused between similar formulas.',
      signErrorRate: 40,
      rushedLastQuestions: 5,
      formulaConfusionRate: 35,
      focusAreas: ['Physics', 'Chemistry', 'Math', 'Biology', 'English']
    }
  }
};

module.exports = { studentData };
