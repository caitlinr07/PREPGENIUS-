const { createAIClient, getAIModel, hasOpenAICompatibleKey } = require('./aiClient');

const fallbackNotes = {
  Physics: [
    'Forces are interactions that can change motion, and Newton\'s laws explain the relationship between force and acceleration.',
    'Energy can be stored, transferred, or transformed, and momentum helps describe motion in collisions.',
    'Use clear equations and units to check whether your final answer makes physical sense.'
  ],
  Chemistry: [
    'Chemical reactions rearrange atoms but do not create or destroy them.',
    'The periodic table helps predict element properties and bonding patterns.',
    'Balancing equations and checking state symbols are essential for accurate chemistry answers.'
  ],
  Math: [
    'Algebra uses symbols to represent numbers and solve equations step by step.',
    'Functions and graphs help show how quantities change in relation to one another.',
    'Always simplify carefully and check your signs before finishing a question.'
  ],
  Biology: [
    'Cells are the basic unit of life and contain specialized structures called organelles.',
    'The nucleus stores genetic information and controls cell activity.',
    'Substances move across the cell membrane by diffusion, osmosis, or active transport.'
  ],
  English: [
    'Strong essays usually begin with a clear thesis and a plan of supporting points.',
    'Evidence and analysis are more persuasive than long quotations without interpretation.',
    'Check grammar, paragraph flow, and linking phrases to keep your argument coherent.'
  ]
};

function makeFallbackNotes(topic) {
  return (fallbackNotes[topic] || [
    `Review the key ideas of ${topic} and focus on the main definitions, examples, and common exam keywords.`,
    'Write a 3-sentence summary and test yourself with short recall questions.'
  ]).map((line) => ({ text: line }));
}

async function generateTopicNotes(topic, learningPreferences = {}) {
  if (hasOpenAICompatibleKey()) {
    try {
      const client = createAIClient();
      const response = await client.chat.completions.create({
        model: getAIModel(),
        temperature: 0.4,
        messages: [
          {
            role: 'system',
            content: 'You are a calm biology tutor for a high school student. Explain the topic using concise bullet points and emphasize exam-relevant ideas.'
          },
          {
            role: 'user',
            content: `Explain ${topic} at a high-school level in 3 short bullet points with simple wording.`
          }
        ]
      });

      const text = response.choices?.[0]?.message?.content || '';
      if (text.trim()) {
        return text
          .split('\n')
          .filter(Boolean)
          .map((line) => ({ text: line.replace(/^[-*]\s*/, '') }));
      }
    } catch (error) {
      console.warn('OpenAI notes failed, using fallback notes.', error.message);
    }
  }

  return makeFallbackNotes(topic);
}

module.exports = {
  generateTopicNotes
};
