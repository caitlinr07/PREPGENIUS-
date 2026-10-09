const { createAIClient, getAIModel, hasOpenAICompatibleKey } = require('./aiClient');
const { getStudentProfile, getRecentIncorrectAnswers } = require('../memory/profileStore');

function buildCorrectSolution(topic) {
  const normalizedTopic = String(topic || '').toLowerCase();
  if (normalizedTopic.includes('algebra') || normalizedTopic.includes('math')) {
    return {
      problemStatement: 'Solve 3x + 6 = 18.',
      steps: [
        'Start with 3x + 6 = 18.',
        'Subtract 6 from both sides: 3x = 24.',
        'Divide both sides by 3: x = 8.'
      ],
      errorStep: 'Subtract 6 from both sides: 3x = 24.',
      explanationOfTrap: 'A common sign error is adding the constant instead of subtracting it from both sides. Undo addition with subtraction, then verify by substituting x = 4 into the original equation.'
    };
  }

  if (normalizedTopic.includes('force') || normalizedTopic.includes('motion') || normalizedTopic.includes('physics')) {
    return {
      problemStatement: 'A 5 kg object accelerates at 2 m/s². Calculate the net force.',
      steps: [
        'Use Newton’s second law: F = ma.',
        'Use F = m + a: F = 5 + 2 = 7 N.',
        'State the result from the substitution: the net force is 7 N.'
      ],
      errorStep: 'Use F = m + a: F = 5 + 2 = 7 N.',
      explanationOfTrap: 'The common misconception is to add mass and acceleration. Newton’s second law requires multiplication, and checking units helps: kg·m/s² is a newton.'
    };
  }

  if (normalizedTopic.includes('chemical') || normalizedTopic.includes('chemistry')) {
    return {
      problemStatement: 'Balance the equation H₂ + O₂ → H₂O.',
      steps: [
        'Count atoms: the left has 2 H and 2 O; the right has 2 H and 1 O.',
        'Put a 2 before H₂O to balance oxygen: H₂ + O₂ → 2H₂O.',
        'Put a 2 before H₂ to balance hydrogen: 2H₂ + O₂ → 2H₂O.'
      ],
      errorStep: 'Change the subscript in water to H₂O₂ to balance oxygen.',
      explanationOfTrap: 'Balancing equations changes coefficients, not subscripts. Changing a subscript changes the substance itself.'
    };
  }

  return {
    problemStatement: `Use the key rule from ${topic} to solve a short recall check: state the correct concept and its application.`,
    steps: [
      `Identify the relevant concept: ${topic}.`,
      'Apply the concept to the given information and state the result.',
      'Check that the result follows from the original concept.'
    ],
    errorStep: 'Choose a conclusion before applying or checking the concept.',
    explanationOfTrap: `The trap is skipping the reasoning step for ${topic}. Connect the evidence to the concept before stating a conclusion.`
  };
}

function fallbackErrorQuiz(topic) {
  const solution = buildCorrectSolution(topic);
  const errorIndex = 1;
  const steps = solution.steps.map((content, index) => ({
    stepNum: index + 1,
    content: index === errorIndex ? solution.errorStep : content,
    isError: index === errorIndex
  }));
  return {
    problemStatement: solution.problemStatement,
    topic,
    steps,
    correctStepNum: errorIndex + 1,
    explanationOfTrap: solution.explanationOfTrap
  };
}

async function generateErrorQuiz(studentId, requestedTopic) {
  const student = getStudentProfile(studentId);
  if (!student) throw new Error('Student profile not found.');
  const recentErrors = getRecentIncorrectAnswers(studentId, 30);
  const weakTopics = Object.entries(student.mastery || {})
    .filter(([, score]) => Number(score) < 70)
    .map(([topic]) => topic);
  const topic = requestedTopic || recentErrors[0]?.topic || weakTopics[0] || Object.keys(student.mastery || {})[0] || 'Algebra';
  const solution = buildCorrectSolution(topic);

  if (hasOpenAICompatibleKey()) {
    try {
      const client = createAIClient();
      const response = await client.chat.completions.create({
        model: getAIModel(),
        temperature: 0.8,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'You create an adversarial Find the Error exercise. Start from the supplied correct solution and rewrite the worked steps with exactly ONE subtle logical or calculation error in exactly one step. All other steps remain correct and coherent. Return JSON with problemStatement, steps [{stepNum,content,isError}], and explanationOfTrap. Exactly one isError must be true.'
          },
          {
            role: 'user',
            content: JSON.stringify({ topic, correctSolution: solution.steps, problemStatement: solution.problemStatement, knownMisconception: solution.errorStep, explanationOfTrap: solution.explanationOfTrap })
          }
        ]
      });
      const parsed = JSON.parse(response.choices?.[0]?.message?.content || '{}');
      const steps = Array.isArray(parsed.steps) ? parsed.steps.map((step, index) => ({
        stepNum: Number(step.stepNum) || index + 1,
        content: String(step.content || ''),
        isError: Boolean(step.isError)
      })) : [];
      const errors = steps.filter((step) => step.isError);
      if (parsed.problemStatement && steps.length >= 3 && errors.length === 1) {
        return {
          problemStatement: String(parsed.problemStatement),
          topic,
          steps,
          correctStepNum: errors[0].stepNum,
          explanationOfTrap: String(parsed.explanationOfTrap || solution.explanationOfTrap)
        };
      }
    } catch (error) {
      console.warn('Error quiz generation failed, using validated fallback.', error.message);
    }
  }

  return fallbackErrorQuiz(topic);
}

module.exports = { generateErrorQuiz, fallbackErrorQuiz };