import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FaCheckCircle, FaExclamationTriangle } from 'react-icons/fa';
import { getUser } from '../../api';

export default function Success() {
  const { user, setUser } = useAuth() || {}; // Add fallback object
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('Verifying your payment...');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!setUser) {
      setError('Authentication system error. Please refresh the page.');
      setLoading(false);
      return;
    }

    const verifyPayment = async () => {
      const sessionId = searchParams.get('session_id');
      
      if (!sessionId) {
        navigate('/plans');
        return;
      }

      try {
        // First try to get user without forcing login
        let currentUser = user;
        if (!currentUser) {
          const token = localStorage.getItem('token');
          if (token) {
            currentUser = await getUser();
            if (setUser) setUser(currentUser); // Check setUser exists
          }
        }

        // If still no user, redirect to login with return URL
        if (!currentUser) {
          navigate('/login', { 
            state: { 
              from: `/success?session_id=${sessionId}`,
              message: 'Please login to complete your subscription' 
            } 
          });
          return;
        }

        // Verify subscription status
        const updatedUser = await getUser();
        if (setUser) setUser(updatedUser); // Check setUser exists

        if (updatedUser.subscription_active) {
          setMessage(`Payment successful! Your ${updatedUser.subscription_plan} plan is now active.`);
        } else {
          setTimeout(async () => {
            const recheckedUser = await getUser();
            if (setUser) setUser(recheckedUser);
            
            if (recheckedUser.subscription_active) {
              setMessage(`Payment successful! Your ${recheckedUser.subscription_plan} plan is now active.`);
            } else {
              setMessage('Subscription activation may take a few moments. Please refresh the page.');
            }
          }, 3000);
        }
      } catch (error) {
        console.error('Error verifying payment:', error);
        setError('Error verifying payment. Please contact support.');
      } finally {
        setLoading(false);
      }
    };

    verifyPayment();
  }, [user, navigate, searchParams, setUser]);

  return (
    <div className="success-container">
      <div className="success-card">
        {error ? (
          <>
            <FaExclamationTriangle className="error-icon" />
            <h2>Payment Verification Issue</h2>
            <p className="error-text">{error}</p>
          </>
        ) : (
          <>
            <FaCheckCircle className="success-icon" />
            <h2>Payment Processing</h2>
            <p>{message}</p>
          </>
        )}
        {!loading && (
          <div className='btn_position'>
            <button onClick={() => navigate('/dashboard')} className="cta-button">
              Go to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}