const { createAIClient, getAIModel, hasOpenAICompatibleKey } = require('./aiClient');

async function answerVoiceQuery(transcript, contextTopic = 'General study') {
  const question = String(transcript || '').trim();
  if (!question) throw new Error('Please provide a question to answer.');

  if (!hasOpenAICompatibleKey()) {
    return `For ${contextTopic}, start by identifying the rule the question is testing, apply it to the information given, and check that your answer makes sense. Add an OpenRouter or OpenAI API key for a tailored answer to: “${question}”`;
  }

  const client = createAIClient();
  const response = await client.chat.completions.create({
    model: getAIModel(),
    temperature: 0.4,
    max_tokens: 180,
    messages: [
      {
        role: 'system',
        content: `You are a vocal study tutor. Answer concisely as if speaking to a student. Stay on the topic of ${contextTopic}. Explain the key idea simply and avoid unnecessary detail.`
      },
      { role: 'user', content: question }
    ]
  });
  return response.choices?.[0]?.message?.content?.trim() || 'I could not form an answer just now. Please try asking in a different way.';
}

module.exports = { answerVoiceQuery };