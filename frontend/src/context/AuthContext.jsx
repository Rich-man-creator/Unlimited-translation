import { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUser, login as apiLogin, register as apiRegister } from '../api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const initializeAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const userData = await getUser();
          setUser(userData);

          // Add this check for success page
          if (window.location.pathname === '/success') {
            const params = new URLSearchParams(window.location.search);
            if (params.has('session_id')) {
              return; // Stay on success page
            }
          }



        } catch (error) {
          localStorage.removeItem('token');
          if (window.location.pathname !== '/login') {
            navigate('/login');
          }
        }
      } else if (window.location.pathname !== '/login' && 
              window.location.pathname !== '/register') {
      navigate('/login');
      }
      setLoading(false);
    };

    initializeAuth();
  }, [navigate]);

  const login = async (username, password) => {
    try {
      const { access_token, user: userData } = await apiLogin(username, password);
      localStorage.setItem('token', access_token);
      setUser(userData);
      navigate('/dashboard');
      return true;
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  };

  const register = async (username, email, password) => {
    try {
      const { access_token, user: userData } = await apiRegister(username, email, password);
      localStorage.setItem('token', access_token);
      setUser(userData);
      navigate('/dashboard');
      return true;
    } catch (error) {
      console.error('Registration failed:', error);
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
    navigate('/login');
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      setUser, // Make sure this is included
      login, 
      register, 
      logout 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}