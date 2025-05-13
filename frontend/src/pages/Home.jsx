import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { FaGlobe, FaFileAlt, FaChartLine, FaLock } from 'react-icons/fa';

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleGetStarted = () => {
    navigate(user ? '/dashboard' : '/register');
  };

  return (
    <div className="home-page">
      <section className="hero">
        <div className="container">
          <div className="hero-content">
            <h1>Professional Translation Made Simple</h1>
            <p>Translate text and documents instantly with our Deep Learning Neuroptogramming platform</p>
            <div className="btn_position">
                <button onClick={handleGetStarted} className="cta-button">
                {user ? 'Go to Dashboard' : 'Get Started for Free'}
                </button>
            </div>
          </div>
        </div>
      </section>

      <section className="features">
        <div className="container">
          <h2>Why Choose Our Service</h2>
          <div className="features-grid">
            <div className="feature-card">
              <FaGlobe className="feature-icon" />
              <h3>100+ Languages</h3>
              <p>Translate between dozens of languages with high accuracy</p>
            </div>
            <div className="feature-card">
              <FaFileAlt className="feature-icon" />
              <h3>Document Support</h3>
              <p>Translate PDFs, Word docs, PowerPoint files and more</p>
            </div>
            <div className="feature-card">
              <FaChartLine className="feature-icon" />
              <h3>Fast Processing</h3>
              <p>Get translations in seconds with our powerful AI</p>
            </div>
            <div className="feature-card">
              <FaLock className="feature-icon" />
              <h3>Secure & Private</h3>
              <p>Your documents are processed securely and never stored</p>
            </div>
          </div>
        </div>
      </section>

      <section className="pricing-cta">
        <div className="container">
          <h2>Ready to Get Started?</h2>
          <p>Choose the plan that fits your needs</p>
            <div className='btn_position'>
                <button onClick={() => navigate('/plans')} className="cta-button">
                    View Pricing Plans
                </button>
            </div>
        </div>
      </section>
    </div>
  );
}