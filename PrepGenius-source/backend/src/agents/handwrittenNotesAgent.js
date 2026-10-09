const { createAIClient, getAIModel, hasOpenAICompatibleKey } = require('./aiClient');
const { getStudentProfile, updateStudent } = require('../memory/profileStore');

function summarizeTextLocally(text) {
  const sentences = String(text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  return sentences.slice(0, 5);
}

async function summarizeHandwrittenNotes(studentId, { fileName, mimeType, dataUrl, text, subject }) {
  const isImage = String(mimeType || '').startsWith('image/');
  if (!isImage && !String(text || '').trim()) throw new Error('The selected file contains no readable text.');

  let summary;
  if (!hasOpenAICompatibleKey()) {
    if (isImage) {
      const error = new Error('Image summarization needs OPENROUTER_API_KEY or OPENAI_API_KEY. You can still upload a .txt or .md file for a local summary.');
      error.statusCode = 503;
      throw error;
    }
    summary = {
      title: 'Key points from your notes',
      bullets: summarizeTextLocally(text)
    };
  } else {
    const client = createAIClient();
    const content = [
      {
        type: 'text',
        text: 'Read the attached student notes and summarize only what is visible or written. Return JSON with title and bullets (3 to 6 concise bullets). Preserve important formulas and definitions; mark anything illegible rather than guessing.'
      }
    ];
    if (isImage) {
      if (!String(dataUrl || '').startsWith(`data:${mimeType};base64,`)) throw new Error('The uploaded image data is invalid.');
      content.push({ type: 'image_url', image_url: { url: dataUrl, detail: 'high' } });
    } else {
      content.push({ type: 'text', text: String(text).slice(0, 30000) });
    }

    const response = await client.chat.completions.create({
      model: getAIModel(),
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content }]
    });
    const raw = response.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw);
    summary = {
      title: String(parsed.title || 'Key points from your notes'),
      bullets: Array.isArray(parsed.bullets) ? parsed.bullets.map(String).slice(0, 6) : []
    };
  }

  if (!summary.bullets.length) throw new Error('No readable key points were found in this file.');
  const note = {
    fileName: String(fileName || 'student-notes').slice(0, 180),
    subject: String(subject || '').trim(),
    title: summary.title,
    bullets: summary.bullets,
    createdAt: new Date().toISOString()
  };
  const currentStudent = getStudentProfile(studentId);
  if (!currentStudent) throw new Error('Student profile not found.');
  const student = updateStudent(studentId, {
    uploadedNotes: [...(currentStudent.uploadedNotes || []), note]
  });
  if (!student) throw new Error('Student profile not found.');
  return note;
}

module.exports = { summarizeHandwrittenNotes, summarizeTextLocally };