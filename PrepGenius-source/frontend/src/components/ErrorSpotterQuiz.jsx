import { useEffect, useState } from 'react';

function ErrorSpotterQuiz({ topics = [], review, result, loading, onReview, onSubmit }) {
  const [subject, setSubject] = useState(topics[0] || '');
  const [answerScript, setAnswerScript] = useState('');
  const [scriptFile, setScriptFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [corrections, setCorrections] = useState({});
  const [fileError, setFileError] = useState('');

  useEffect(() => {
    if (topics.length && !topics.includes(subject)) setSubject(topics[0]);
  }, [topics, subject]);

  useEffect(() => setCorrections({}), [review]);

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    setFileError('');
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setFileError('Choose a file smaller than 8 MB.');
      event.target.value = '';
      return;
    }
    setFileName(file.name);
    try {
      const content = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('This file could not be read.'));
        if (file.type.startsWith('image/')) reader.readAsDataURL(file);
        else reader.readAsText(file);
      });
      if (file.type.startsWith('image/')) setScriptFile({ dataUrl: content, mimeType: file.type });
      else {
        setAnswerScript(String(content));
        setScriptFile(null);
      }
    } catch (error) {
      setFileError(error.message || 'Unable to read this file.');
    }
  };

  return (
    <section className="error-spotter">
      <div className="section-header">
        <div>
          <p className="eyebrow">Answer script review</p>
          <h2>Find and correct errors</h2>
        </div>
      </div>
      {!review ? (
        <>
          <div className="answer-script-controls">
            <label>Subject
              <select value={subject} onChange={(event) => setSubject(event.target.value)}>
                {topics.map((topic) => <option key={topic} value={topic}>{topic}</option>)}
              </select>
            </label>
            <label className="secondary upload-file-button" htmlFor="answerScriptFile">Add answer script</label>
            <input id="answerScriptFile" className="visually-hidden-input" type="file" accept="image/*,.txt,.md,text/plain,text/markdown" onChange={handleFileChange} />
            {fileName && <span className="selected-note-file">{fileName}</span>}
          </div>
          <textarea className="answer-script-input" value={answerScript} onChange={(event) => setAnswerScript(event.target.value)} placeholder={'Paste your worked answer here, one step per line.\nExample: F = m + a'} rows={8} />
          {fileError && <p className="note-upload-error" role="alert">{fileError}</p>}
          <button className="primary" type="button" onClick={() => onReview({ subject, answerScript, ...scriptFile })} disabled={loading || (!answerScript.trim() && !scriptFile)}>
            {loading ? 'Reviewing answer script...' : 'Mark my answer script'}
          </button>
        </>
      ) : (
        <>
          <div className="answer-paper" aria-label="Annotated answer paper">
            <div className="answer-paper-heading"><span>{review.subject}</span><span>{review.lines.length} lines · {review.provider || 'Local checks'}</span></div>
            {review.lines.map((line) => {
              const gradedLine = result?.corrections?.find((item) => item.lineNumber === line.lineNumber);
              return (
                <article className={`answer-paper-line${line.hasError ? ' has-script-error' : ''}${gradedLine?.correct ? ' correction-correct' : gradedLine && !gradedLine.correct ? ' correction-incorrect' : ''}`} key={line.lineNumber}>
                  <span className="answer-line-number">{String(line.lineNumber).padStart(2, '0')}</span>
                  <div className="answer-line-content">
                    <p>{line.content}</p>
                    {line.hasError && <>
                      <strong className="answer-error-flag">Error found</strong>
                      <p className="answer-issue">{line.issue}</p>
                      {!result ? (
                        <label className="correction-field">Your correction
                          <textarea rows={2} value={corrections[line.lineNumber] || ''} onChange={(event) => setCorrections((current) => ({ ...current, [line.lineNumber]: event.target.value }))} placeholder="Write the corrected step" />
                        </label>
                      ) : (
                        <div className="answer-correction-result">
                          <span>{gradedLine?.correct ? 'Corrected' : 'Expected correction'}</span>
                          <p>{gradedLine?.expectedCorrection}</p>
                        </div>
                      )}
                    </>}
                  </div>
                </article>
              );
            })}
          </div>
          {!result && review.errorCount > 0 && (
            <button className="primary" type="button" onClick={() => onSubmit(corrections)} disabled={loading || review.lines.some((line) => line.hasError && !corrections[line.lineNumber]?.trim())}>
              {loading ? 'Checking corrections...' : 'Submit corrections'}
            </button>
          )}
          {!review.errorCount && <div className="answer-no-errors"><p>No clear errors were detected in this script.</p><button className="secondary" type="button" onClick={() => onReview(null)}>Add another script</button></div>}
          {result && (
            <div className="trap-feedback">
              <h3>{result.correctCount} of {result.totalErrors} corrections correct</h3>
              <p>{result.totalErrors ? `Your ${result.subject} mastery was updated from your corrections.` : 'No mastery change was needed.'}</p>
              <small>{result.gradingSource === 'local' ? 'Correction feedback by local checks' : `Correction feedback by ${result.gradingSource}`}</small>
              <button className="secondary" type="button" onClick={() => onReview(null)}>Review another script</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default ErrorSpotterQuiz;