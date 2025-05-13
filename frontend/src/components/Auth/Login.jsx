import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await login(username, password);
      
      // Check if we were redirected from payment success page
      const from = location.state?.from || '/dashboard';
      const searchParams = new URLSearchParams(from.split('?')[1]);
      const sessionId = searchParams.get('session_id');

      if (sessionId) {
        // Redirect back to success page with session ID
        navigate(`/success?session_id=${sessionId}`, { 
          replace: true,
          state: { from: location.state?.from } 
        });
      } else {
        // Normal redirect to dashboard or intended page
        navigate(from, { replace: true });
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid username or password');
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-form">
        <h2>Login</h2>
        {error && <div className="error-message">{error}</div>}
        
        {/* Show special message if redirected from payment */}
        {location.state?.message && (
          <div className="info-message">
            {location.state.message}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="cta-button">
            Login
          </button>
        </form>
        <div className="auth-footer">
          Don't have an account? <a href="/register">Register</a>
        </div>
      </div>
    </div>
  );
}