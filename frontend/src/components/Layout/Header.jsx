import { useAuth } from '../../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { FaUser, FaSignInAlt, FaSignOutAlt } from 'react-icons/fa';

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="app-header">
      <div className="container">
        <Link to="/" className="logo">Unlimited Translation</Link>   
        <div className="user-controls">
          {user ? (
            <>
              <span className="user-info">
                <FaUser /> {user.username}
                {user.subscription_active ? (
                  <span className="badge premium">Premium</span>
                ) : (
                  <span className="badge free">Free</span>
                )}
              </span>
              {!user.subscription_active && (
                <button onClick={() => navigate('/plans')} className="btn subscribe-btn">
                  Upgrade
                </button>
              )}
              <button onClick={logout} className="btn logout-btn">
                <FaSignOutAlt /> Logout
              </button>
            </>
          ) : (
            <button onClick={() => navigate('/login')} className="btn login-btn">
              <FaSignInAlt /> Login
            </button>
          )}
        </div>
      </div>
    </header>
  );
}