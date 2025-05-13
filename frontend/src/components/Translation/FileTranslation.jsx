import { useState, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { translateFile } from '../../api';
import { FaUpload, FaFileDownload, FaTimes } from 'react-icons/fa';

// Free tier limits
const FREE_TIER_LIMIT = 5000; // 5,000 characters for free users

export default function FileTranslation({ 
  languages,
  sourceLang,
  targetLang,
  onSourceLangChange,
  onTargetLangChange
}) {
  const { user } = useAuth();
  const [file, setFile] = useState(null);
  const [downloadUrl, setDownloadUrl] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [translationStatus, setTranslationStatus] = useState('');
  const [error, setError] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [charCount, setCharCount] = useState(0);

  const extractText = useCallback(async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const content = e.target.result;
          const text = content.toString();
          setCharCount(text.length);
          resolve(text);
        } catch (err) {
          reject(new Error('Failed to process file content'));
        }
      };
      
      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };
      
      if (user?.subscription_active) {
        // Premium users can upload any supported file type
        if (file.type.includes('text') || 
            file.name.match(/\.(txt|md|pdf|docx|pptx|xlsx)$/i)) {
          reader.readAsText(file);
        } else {
          reject(new Error('Unsupported file format'));
        }
      } else {
        // Free tier only supports text files
        if (file.type.includes('text') || 
            file.name.match(/\.(txt|md)$/i)) {
          reader.readAsText(file);
        } else {
          reject(new Error('Free version only supports .txt and .md files'));
        }
      }
    });
  }, [user]);

  const handleFileChange = useCallback(async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    try {
      setError('');
      setDownloadUrl('');
      const content = await extractText(selectedFile);
      setFile(selectedFile);
      
      if (!user?.subscription_active && content.length > FREE_TIER_LIMIT) {
        setError(`Free version limited to ${FREE_TIER_LIMIT} characters. Please subscribe.`);
        setFile(null);
        return;
      }
    } catch (err) {
      setError(err.message);
      setFile(null);
    }
  }, [user, extractText]);

  const handleTranslate = useCallback(async () => {
    if (!file || !sourceLang || !targetLang) {
      setError('Please select a file and both source/target languages');
      return;
    }
    
    setIsTranslating(true);
    setProgress(0);
    setError('');
    setDownloadUrl('');

    try {
      const response = await translateFile(
        file,
        sourceLang,
        targetLang,
        (progress) => setProgress(progress)
      );

      const url = URL.createObjectURL(response.data);
      setDownloadUrl(url);
      setProgress(100);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Translation failed');
      console.error('Translation error:', err);
    } finally {
      setIsTranslating(false);
    }
  }, [file, sourceLang, targetLang, user]);

  const clearFile = useCallback(() => {
    setFile(null);
    setDownloadUrl('');
    setError('');
    setFileContent('');
    setCharCount(0);
  }, []);

  return (
    <div className="file-translation-container">
      <div className="language-selector">
        <select value={sourceLang} onChange={(e) => onSourceLangChange(e.target.value)}>
          {languages.map((lang) => (
            <option key={`source-${lang.code}`} value={lang.code}>
              {lang.name}
            </option>
          ))}
        </select>
        <span>to</span>
        <select value={targetLang} onChange={(e) => onTargetLangChange(e.target.value)}>
          {languages.map((lang) => (
            <option key={`target-${lang.code}`} value={lang.code}>
              {lang.name}
            </option>
          ))}
        </select>
      </div>

      {!user?.subscription_active && (
        <div className="free-tier-notice">
          Free version supports text files (.txt, .md) up to {FREE_TIER_LIMIT} characters
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <div className="file-upload-area">
        {!file ? (
          <>
            <input 
              type="file" 
              hidden
              id="file-upload" 
              onChange={handleFileChange}
              accept={user?.subscription_active ? 
                ".pdf,.docx,.pptx,.txt,.xlsx,.md" : 
                ".txt,.md"}
            />
            <label htmlFor="file-upload" className="file-upload-box">
              <FaUpload className="upload-icon" />
              <p>Drag and drop files here or click to browse</p>
              <small>
                {user?.subscription_active ? 
                  "Supported formats: PDF, DOCX, PPTX, TXT, XLSX, MD" : 
                  "Free version: TXT, MD only (max " + FREE_TIER_LIMIT + " chars)"}
              </small>
            </label>
          </>
        ) : (
          <div className="file-preview">
            <div className="file-info">
              <span>{file.name} ({charCount} characters)</span>
              <button onClick={clearFile} className="clear-file">
                <FaTimes />
              </button>
            </div>
            {!user?.subscription_active && (
              <div className="char-count">
                {charCount}/{FREE_TIER_LIMIT} characters
              </div>
            )}
            <button 
              onClick={handleTranslate} 
              disabled={isTranslating || (!user?.subscription_active && charCount > FREE_TIER_LIMIT)}
              className="translate-btn"
            >
              {isTranslating ? 'Translating...' : 'Translate File'}
            </button>
          </div>
        )}
      </div>

      {downloadUrl && (
        <div className="download-section">
          <a 
            href={downloadUrl} 
            download={`translated_${file?.name || 'document.txt'}`}
            className="download-btn"
          >
            <FaFileDownload /> Download Translated File
          </a>
        </div>
      )}

      {(isTranslating || progress > 0) && (
        <div className="progress-container">
          <div className="progress-bar">
            <div 
              className="progress" 
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <div className="loading">
            {translationStatus || (progress < 100 ? 'Processing...' : 'Complete!')}
          </div>
        </div>
      )}
    </div>
  );
}