import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { translateText } from '../../api';
import { FaExchangeAlt, FaCopy, FaVolumeUp, FaTimes } from 'react-icons/fa';

export default function TextTranslation({ 
  languages,
  sourceLang,
  targetLang,
  onSourceLangChange,
  onTargetLangChange,
  onTranslate,
  autoTranslate = false
}) {
  const { user } = useAuth();
  const [inputText, setInputText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const textareaRef = useRef(null);
  const previousTargetLang = useRef(targetLang);

  const handleTranslation = useCallback(async (text) => {
    if (!text.trim()) {
      setTranslatedText('');
      return;
    }

    if (!user?.subscription_active && text.length > 1000) {
      setError('Please subscribe to translate more than 1000 characters');
      return;
    }

    setIsTranslating(true);
    setError('');
    
    try {
      const { translatedText, charactersTranslated } = await translateText(
        text,
        sourceLang,
        targetLang,
        (p) => setProgress(p)
      );
      
      setTranslatedText(translatedText);
      if (onTranslate) onTranslate(charactersTranslated);
    } catch (err) {
      setError(err.response?.data?.error || 'Translation failed');
      console.error('Translation error:', err);
    } finally {
      setIsTranslating(false);
      setProgress(0);
    }
  }, [sourceLang, targetLang, onTranslate, user]);

  // Clear both input and translated text
  const clearText = useCallback(() => {
    setInputText('');
    setTranslatedText('');
    setError('');
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    if (inputText.trim() && targetLang !== previousTargetLang.current) {
      handleTranslation(inputText);
      previousTargetLang.current = targetLang;
    }
  }, [targetLang, inputText, handleTranslation]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleTranslation(inputText);
    }
  }, [inputText, handleTranslation]);

  const handleInputChange = useCallback((e) => {
    setInputText(e.target.value);
    setError('');
  }, []);

  const swapLanguages = useCallback(() => {
    onSourceLangChange(targetLang);
    onTargetLangChange(sourceLang);
    setInputText(translatedText);
    setTranslatedText(inputText);
  }, [sourceLang, targetLang, inputText, translatedText, onSourceLangChange, onTargetLangChange]);

  const copyToClipboard = useCallback(() => {
    if (!translatedText) return;
    
    navigator.clipboard.writeText(translatedText)
      .then(() => {
        const originalText = translatedText;
        setTranslatedText('Copied to clipboard!');
        setTimeout(() => setTranslatedText(originalText), 1500);
      })
      .catch(err => {
        console.error('Failed to copy text: ', err);
        setError('Failed to copy text');
      });
  }, [translatedText]);

  const speakText = useCallback(() => {
    if (!translatedText) return;
    
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(translatedText);
      utterance.lang = targetLang;
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    } else {
      setError('Text-to-speech not supported in your browser');
    }
  }, [translatedText, targetLang]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  return (
    <div className="translation-container">
      <div className="language-selector">
        <select
          value={sourceLang}
          onChange={(e) => onSourceLangChange(e.target.value)}
          disabled={isTranslating}
        >
          <option value="auto">Auto-detect</option>
          {languages.map((lang) => (
            <option key={`source-${lang.code}`} value={lang.code}>
              {lang.name}
            </option>
          ))}
        </select>
        
        <button 
          onClick={swapLanguages} 
          className="swap-btn"
          disabled={isTranslating}
          aria-label="Swap languages"
        >
          <FaExchangeAlt />
        </button>
        
        <select
          value={targetLang}
          onChange={(e) => onTargetLangChange(e.target.value)}
          disabled={isTranslating}
        >
          {languages.map((lang) => (
            <option key={`target-${lang.code}`} value={lang.code}>
              {lang.name}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="text-boxes">
        <div className="text-box">
          <div className="input-wrapper">
            <textarea
              ref={textareaRef}
              placeholder="Type text and press Enter to translate..."
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={isTranslating}
              rows={5}
            />
            {inputText && (
              <button 
                onClick={clearText}
                className="clear-btn"
                aria-label="Clear text"
              >
                <FaTimes />
              </button>
            )}
          </div>
          <div className="hint">
            Press <kbd>Enter</kbd> to translate, <kbd>Shift+Enter</kbd> for new line
          </div>
        </div>
        
        <div className="text-box">
          <textarea
            placeholder="Translation will appear here..."
            value={translatedText}
            readOnly
            rows={5}
          />
          {translatedText && (
            <div className="text-actions">
              <button 
                onClick={speakText}
                aria-label="Listen to translation"
                className="action-btn"
              >
                <FaVolumeUp />
              </button>
              <button 
                onClick={copyToClipboard}
                aria-label="Copy translation"
                className="action-btn"
              >
                <FaCopy />
              </button>
            </div>
          )}
        </div>
      </div>

      {isTranslating && (
        <div className="progress-container">
          <div className="progress-bar">
            <div style={{ width: `${progress}%` }}></div>
          </div>
          <div>Translating... {progress}%</div>
        </div>
      )}

      <button 
        onClick={() => handleTranslation(inputText)}
        disabled={isTranslating || !inputText.trim()}
        className="translate-button"
      >
        {isTranslating ? 'Translating...' : 'Translate'}
      </button>
    </div>
  );
}