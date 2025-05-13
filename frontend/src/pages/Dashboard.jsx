import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import TextTranslation from '../components/Translation/TextTranslation';
import FileTranslation from '../components/Translation/FileTranslation';
import { FaExchangeAlt, FaHistory, FaChartPie, FaFileAlt } from 'react-icons/fa';

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
  { code: 'ko', name: 'Korean' },
  { code: 'tr', name: 'Turkish' },
  { code: 'nl', name: 'Dutch' },
  { code: 'pl', name: 'Polish' },
  { code: 'sv', name: 'Swedish' },
  { code: 'fi', name: 'Finnish' },
  { code: 'da', name: 'Danish' },
  { code: 'el', name: 'Greek' },
  { code: 'he', name: 'Hebrew' }
];

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('text');
  const [sourceLang, setSourceLang] = useState('auto');
  const [targetLang, setTargetLang] = useState('es');
  const [usage, setUsage] = useState({
    charactersUsed: 0,
    charactersRemaining: 0,
    monthlyLimit: 0
  });

  useEffect(() => {
    if (!user) {
      navigate('/login');
    } else {
      setUsage({
        charactersUsed: user.characters_used || 0,
        charactersRemaining: (user.monthly_character_limit || 0) - (user.characters_used || 0),
        monthlyLimit: user.monthly_character_limit || 0
      });
    }
  }, [user, navigate]);

  const handleTranslation = (textLength) => {
    setUsage(prev => ({
      ...prev,
      charactersUsed: prev.charactersUsed + textLength,
      charactersRemaining: Math.max(0, prev.charactersRemaining - textLength)
    }));
  };

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h2>Welcome back, {user?.username}</h2>
        {user?.subscription_active && (
          <div className="subscription-badge">
            {user.subscription_plan} plan
          </div>
        )}
        <div className="usage-meter">
          <div className="usage-info">
            <span>{usage.charactersUsed.toLocaleString()} characters used</span>
            <span>{usage.charactersRemaining.toLocaleString()} remaining</span>
            <span>{usage.monthlyLimit.toLocaleString()} monthly limit</span>
          </div>
          <div className="meter">
            <div 
              className="progress" 
              style={{ 
                width: `${Math.min(100, 
                  (usage.charactersUsed / 
                  usage.monthlyLimit) * 100
                )}%` 
              }}
            ></div>
          </div>
        </div>
      </div>

      <div className="dashboard-tabs">
        <button
          className={`tab ${activeTab === 'text' ? 'active' : ''}`}
          onClick={() => setActiveTab('text')}
        >
          <FaExchangeAlt /> Text Translation
        </button>
        <button
          className={`tab ${activeTab === 'file' ? 'active' : ''}`}
          onClick={() => {
            if (user?.subscription_active) {
              alert('File translation requires a premium subscription');
              navigate('/plans');
              return;
            }
            setActiveTab('file');
          }}
        >
          <FaFileAlt /> File Translation
        </button>
        {/* <button
          className={`tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <FaHistory /> History
        </button>
        <button
          className={`tab ${activeTab === 'stats' ? 'active' : ''}`}
          onClick={() => setActiveTab('stats')}
        >
          <FaChartPie /> Statistics
        </button> */}
      </div>

      <div className="dashboard-content">
        {activeTab === 'text' && (
          <TextTranslation 
            languages={LANGUAGES}
            sourceLang={sourceLang}
            targetLang={targetLang}
            onSourceLangChange={setSourceLang}
            onTargetLangChange={setTargetLang}
            onTranslate={handleTranslation}
            characterLimit={usage.charactersRemaining}
          />
        )}
        {activeTab === 'file' && (
          <FileTranslation 
            languages={LANGUAGES}
            sourceLang={sourceLang}
            targetLang={targetLang}
            onSourceLangChange={setSourceLang}
            onTargetLangChange={setTargetLang}
            onTranslate={handleTranslation}
            characterLimit={usage.charactersRemaining}
          />
        )}
        {/* {activeTab === 'history' && (
          <TranslationHistory />
        )}
        {activeTab === 'stats' && (
          <UsageStats />
        )} */}
      </div>
    </div>
  );
}