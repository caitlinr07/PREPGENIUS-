import { useEffect, useRef, useState } from 'react';

function VoiceTutor({ contextTopics = [] }) {
  const [open, setOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [answer, setAnswer] = useState('');
  const [contextTopic, setContextTopic] = useState(contextTopics[0] || 'General study');
  const [error, setError] = useState('');
  const recognitionRef = useRef(null);

  useEffect(() => {
    if (contextTopics.length && !contextTopics.includes(contextTopic)) setContextTopic(contextTopics[0]);
  }, [contextTopics, contextTopic]);

  useEffect(() => () => {
    recognitionRef.current?.abort?.();
    window.speechSynthesis?.cancel();
  }, []);

  const startRecording = () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setError('Speech recognition is not supported in this browser. You can type your question below.');
      return;
    }

    setError('');
    const recognition = new Recognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setRecording(true);
    recognition.onresult = (event) => setTranscript(event.results[0][0].transcript);
    recognition.onerror = (event) => {
      setRecording(false);
      setError(event.error === 'not-allowed' || event.error === 'service-not-allowed'
        ? 'Microphone permission was denied. Allow microphone access or type your question.'
        : `Speech recognition stopped (${event.error}). You can type your question instead.`);
    };
    recognition.onend = () => setRecording(false);
    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      setRecording(false);
      setError('The microphone could not start. Check browser permissions or type your question.');
    }
  };

  const sendQuestion = async () => {
    if (!transcript.trim()) return;
    setThinking(true);
    setError('');
    setAnswer('');
    try {
      const response = await fetch('/api/voice-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, contextTopic })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'The tutor could not answer that question.');
      setAnswer(data.answer);
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(data.answer));
      }
    } catch (requestError) {
      setError(requestError.message || 'Voice tutor unavailable. Please try again.');
    } finally {
      setThinking(false);
    }
  };

  return (
    <div className="voice-tutor-root">
      {open && (
        <section className="voice-panel" aria-label="Voice study tutor">
          <header className="voice-header">
            <div>
              <p className="eyebrow">Speak your doubts</p>
              <h2>Voice tutor</h2>
            </div>
            <button className="voice-close" type="button" onClick={() => setOpen(false)} aria-label="Close voice tutor">×</button>
          </header>
          {contextTopics.length > 1 && (
            <label className="voice-topic-field">Topic context
              <select value={contextTopic} onChange={(event) => setContextTopic(event.target.value)}>
                {contextTopics.map((topic) => <option key={topic} value={topic}>{topic}</option>)}
              </select>
            </label>
          )}
          <div className="voice-chat" aria-live="polite">
            {transcript && <p className="voice-bubble voice-question">{transcript}</p>}
            {answer && <p className="voice-bubble voice-answer">{answer}</p>}
            {(recording || thinking) && <div className="voice-wave" aria-label={recording ? 'Recording' : 'Tutor is thinking'}><i /><i /><i /><i /><i /></div>}
            {!transcript && !answer && !recording && <p className="voice-placeholder">Ask about the topic you are studying.</p>}
          </div>
          <div className="voice-controls">
            <button className={recording ? 'voice-mic recording' : 'voice-mic'} type="button" onClick={recording ? () => recognitionRef.current?.stop() : startRecording} aria-label={recording ? 'Stop recording' : 'Start voice recording'} title={recording ? 'Stop recording' : 'Start voice recording'}>
              {recording ? '■' : '🎤'}
            </button>
            <textarea value={transcript} onChange={(event) => setTranscript(event.target.value)} placeholder="Confirm or type your question" rows="2" />
          </div>
          {error && <p className="voice-error" role="alert">{error}</p>}
          <button className="primary voice-send" type="button" onClick={sendQuestion} disabled={!transcript.trim() || thinking}>
            {thinking ? 'Thinking...' : 'Ask tutor'}
          </button>
        </section>
      )}
      <button className="voice-launch" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label="Ask voice tutor">
        🎤 <span>Ask Voice</span>
      </button>
    </div>
  );
}

export default VoiceTutor;