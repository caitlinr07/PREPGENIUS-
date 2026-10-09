const { createAIClient, getAIModel, hasOpenAICompatibleKey } = require('./aiClient');

const fallbackQuestions = {
  Physics: [
    {
      question: 'Which quantity is defined as force multiplied by distance moved in the direction of the force?',
      options: ['Power', 'Momentum', 'Work', 'Velocity'],
      correctAnswer: 'Work'
    },
    {
      question: 'If an object is moving at constant speed in a straight line, what can we say about its net force?',
      options: ['It is increasing', 'It is zero', 'It is constant but non-zero', 'It is opposite to its motion'],
      correctAnswer: 'It is zero'
    },
    {
      question: 'Which of these is the SI unit of force?',
      options: ['Joule', 'Newton', 'Watt', 'Pascal'],
      correctAnswer: 'Newton'
    }
  ],
  Chemistry: [
    {
      question: 'What is the charge on a proton?',
      options: ['-1', '0', '+1', '+2'],
      correctAnswer: '+1'
    },
    {
      question: 'Which of these is a common acid?',
      options: ['Sodium chloride', 'Sulfuric acid', 'Copper oxide', 'Calcium carbonate'],
      correctAnswer: 'Sulfuric acid'
    },
    {
      question: 'In a balanced equation, the number of atoms of each element must be:',
      options: ['Different on both sides', 'The same on both sides', 'Always even', 'Always odd'],
      correctAnswer: 'The same on both sides'
    }
  ],
  Math: [
    {
      question: 'Solve for x: 3x + 6 = 18',
      options: ['2', '3', '4', '5'],
      correctAnswer: '4'
    },
    {
      question: 'Which is the slope of the line y = 2x + 5?',
      options: ['2', '5', '-2', '0'],
      correctAnswer: '2'
    },
    {
      question: 'What is the value of 5^2?',
      options: ['10', '15', '20', '25'],
      correctAnswer: '25'
    }
  ],
  Biology: [
    {
      question: 'Which organelle is mainly responsible for making energy in a cell?',
      options: ['Nucleus', 'Mitochondria', 'Ribosome', 'Cell membrane'],
      correctAnswer: 'Mitochondria'
    },
    {
      question: 'Which process allows water to move across a cell membrane?',
      options: ['Diffusion', 'Osmosis', 'Respiration', 'Photosynthesis'],
      correctAnswer: 'Osmosis'
    },
    {
      question: 'What is the main function of the nucleus?',
      options: ['Store genetic information', 'Send messages to the brain', 'Absorb nutrients', 'Protect the cell wall'],
      correctAnswer: 'Store genetic information'
    }
  ],
  English: [
    {
      question: 'Which sentence is written most clearly?',
      options: ['The essay was very good because it showed analysis.', 'The essay thoroughly analysed the text and supported the claim with evidence.', 'It was a good essay because it was long.', 'The essay had lots of words.'],
      correctAnswer: 'The essay thoroughly analysed the text and supported the claim with evidence.'
    },
    {
      question: 'What is the main purpose of a topic sentence?',
      options: ['To end the paragraph', 'To introduce the paragraph\'s main idea', 'To add a quote', 'To repeat the conclusion'],
      correctAnswer: 'To introduce the paragraph\'s main idea'
    },
    {
      question: 'Which is the best way to improve an analytical paragraph?',
      options: ['Add more adjectives', 'Link evidence to the argument with explanation', 'Write a longer introduction', 'Avoid all quotes'],
      correctAnswer: 'Link evidence to the argument with explanation'
    }
  ]
};

async function generateTopicQuestions(topic, difficulty = 'medium', count = 3) {
  if (hasOpenAICompatibleKey()) {
    try {
      const client = createAIClient();
      const response = await client.chat.completions.create({
        model: getAIModel(),
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content: 'Generate concise multiple-choice questions for a biology student. Return valid JSON with question, options, and correctAnswer fields.'
          },
          {
            role: 'user',
            content: `Generate ${count} multiple-choice questions about ${topic} at ${difficulty} difficulty. Each question must have 4 options and one correct answer. Return only JSON.`
          }
        ]
      });

      const text = response.choices?.[0]?.message?.content || '';
      if (text.trim()) {
        const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
        if (Array.isArray(parsed) && parsed.length) {
          return parsed;
        }
      }
    } catch (error) {
      console.warn('OpenAI question generation failed, using fallback questions.', error.message);
    }
  }

  const pool = fallbackQuestions[topic] || [
    {
      question: `What is the most important idea to remember when revising ${topic}?`,
      options: ['A key definition', 'A random fact', 'A new subject', 'A guess'],
      correctAnswer: 'A key definition'
    }
  ];

  return pool.slice(0, count);
}

module.exports = {
  generateTopicQuestions
};
