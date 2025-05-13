import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { createSubscription } from '../../api';
import { loadStripe } from '@stripe/stripe-js';
import styled, { keyframes } from 'styled-components';
import { FaCheck, FaCrown, FaRocket, FaGem } from 'react-icons/fa';

const stripePromise = loadStripe("pk_live_51PRkrbC2fNwTESVNaMXBDSTP2iFoq85C4l9EwFn6tVhYz7XxXqKjGxGfESxEDN0p5d706vhAuRTWFn2I1NGCW5ya001pocDAaS");

// Animation for card hover
const floatAnimation = keyframes`
  0% { transform: translateY(0px); }
  50% { transform: translateY(-10px); }
  100% { transform: translateY(0px); }
`;

// Styled components
const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 3rem 1rem;
  font-family: 'Inter', sans-serif;
`;

const Title = styled.h2`
  text-align: center;
  font-size: 2.5rem;
  color: #2d3748;
  margin-bottom: 1.5rem;
  font-weight: 700;
  background: linear-gradient(90deg, #4f46e5, #10b981);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
`;

const Subtitle = styled.p`
  text-align: center;
  color: #718096;
  font-size: 1.1rem;
  max-width: 600px;
  margin: 0 auto 3rem;
  line-height: 1.6;
`;

const PlansGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
  padding: 1rem;
`;

const PlanCard = styled.div`
  background: white;
  border-radius: 16px;
  padding: 2.5rem;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  
  &:hover {
    transform: translateY(-5px);
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
    animation: ${floatAnimation} 3s ease-in-out infinite;
  }

  ${props => props.highlighted && `
    border: 2px solid #4f46e5;
    transform: scale(1.02);
  `}
`;

const PlanBadge = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  background: ${props => props.color};
  color: white;
  padding: 0.5rem 1.5rem;
  font-size: 0.8rem;
  font-weight: 600;
  border-bottom-left-radius: 12px;
  text-transform: uppercase;
`;

const PlanIcon = styled.div`
  font-size: 2.5rem;
  margin-bottom: 1.5rem;
  color: ${props => props.color};
`;

const PlanName = styled.h3`
  font-size: 1.5rem;
  font-weight: 700;
  color: #2d3748;
  margin-bottom: 0.5rem;
`;

const PlanPrice = styled.p`
  font-size: 2.2rem;
  font-weight: 800;
  color: ${props => props.color};
  margin-bottom: 1.5rem;
  
  span {
    font-size: 1rem;
    font-weight: 500;
    color: #718096;
  }
`;

const FeatureList = styled.ul`
  list-style: none;
  padding: 0;
  margin-bottom: 2.5rem;
`;

const FeatureItem = styled.li`
  margin-bottom: 0.8rem;
  display: flex;
  align-items: center;
  color: #4a5568;
  font-size: 0.95rem;
  
  svg {
    margin-right: 0.7rem;
    color: #10b981;
  }
`;

const SubscribeButton = styled.button`
  width: 100%;
  padding: 1rem;
  border: none;
  border-radius: 8px;
  background: ${props => props.isCurrent ? '#10b981' : props.color};
  color: white;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  
  &:hover {
    background: ${props => props.isCurrent ? '#0d9f6e' : props.hoverColor};
    transform: translateY(-2px);
  }
  
  &:disabled {
    background: #cbd5e0;
    cursor: not-allowed;
    transform: none;
  }
`;

const ErrorMessage = styled.div`
  color: #e53e3e;
  text-align: center;
  margin: 1rem 0;
  padding: 1rem;
  background: #fff5f5;
  border-radius: 8px;
  font-weight: 500;
`;

// Plan data
const PLANS = [
  {
    id: 'basic',
    name: 'Starter',
    price: '$9.99',
    period: '/month',
    features: [
      '50,000 characters per month',
      'Text translation',
      'Basic support',
      '3 file translations/month',
      'Email support'
    ],
    priceId: "price_1RNy69C2fNwTESVN01zBYfDj",
    color: '#4f46e5',
    hoverColor: '#4338ca',
    icon: <FaCheck />,
    badge: 'Popular'
  },
  {
    id: 'pro',
    name: 'Professional',
    price: '$19.99',
    period: '/month',
    features: [
      '200,000 characters',
      'Text & file translation',
      'Priority support',
      '50 files',
      'Faster processing',
      'API access'
    ],
    priceId: "price_1RNy9TC2fNwTESVNs3OqiHF8",
    color: '#10b981',
    hoverColor: '#0d9f6e',
    icon: <FaRocket />,
    badge: 'Best Value'
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: '$199.99',
    period: '/month',
    features: [
      'Unlimited characters',
      'All file types',
      '24/7 support',
      'Dedicated manager',
      'Highest priority',
      'Custom solutions',
      'Team access'
    ],
    priceId: "price_1RNyBVC2fNwTESVNDLv1xWPX",
    color: '#f59e0b',
    hoverColor: '#d97706',
    icon: <FaGem />,
    badge: 'Premium'
  }
];

export default function Plans() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedPlan, setSelectedPlan] = useState(null);

  const handleSubscribe = async (priceId, planId) => {
    setLoading(true);
    setError('');
    setSelectedPlan(planId);
    
    try {
      // Ensure priceId is being passed correctly
      const { sessionId } = await createSubscription(priceId);
      const stripe = await stripePromise;
      
      const result = await stripe.redirectToCheckout({
        sessionId
      });
      
      if (result.error) {
        setError(result.error.message);
      }
    } catch (err) {
      console.error('Subscription error:', err);
      setError(err.response?.data?.error || err.message || 'Failed to initiate subscription');
    } finally {
      setLoading(false);
      setSelectedPlan(null);
    }
  };

  return (
    <Container>
      <Title>Choose Your Perfect Plan</Title>
      <Subtitle>
        Select the subscription that fits your needs. Upgrade, downgrade, or cancel anytime.
      </Subtitle>
      
      {error && <ErrorMessage>{error}</ErrorMessage>}

      <PlansGrid>
        {PLANS.map(plan => {
          const isCurrentPlan = user?.subscription_active && user?.subscription_plan === plan.id;
          
          return (
            <PlanCard key={plan.id} highlighted={plan.id === 'pro'}>
              {plan.badge && (
                <PlanBadge color={plan.color}>
                  {plan.badge}
                </PlanBadge>
              )}
              
              <PlanIcon color={plan.color}>
                {plan.icon}
              </PlanIcon>
              
              <PlanName>{plan.name}</PlanName>
              <PlanPrice color={plan.color}>
                {plan.price} <span>{plan.period}</span>
              </PlanPrice>
              
              <FeatureList>
                {plan.features.map((feature, index) => (
                  <FeatureItem key={index}>
                    <FaCheck /> {feature}
                  </FeatureItem>
                ))}
              </FeatureList>
              
              <SubscribeButton
                onClick={() => handleSubscribe(plan.priceId, plan.id)}
                disabled={loading || isCurrentPlan}
                isCurrent={isCurrentPlan}
                color={plan.color}
                hoverColor={plan.hoverColor}
              >
                {loading && selectedPlan === plan.id ? (
                  'Processing...'
                ) : isCurrentPlan ? (
                  <>
                    <FaCrown style={{ marginRight: '8px' }} /> Current Plan
                  </>
                ) : (
                  'Get Started'
                )}
              </SubscribeButton>
            </PlanCard>
          );
        })}
      </PlansGrid>
    </Container>
  );
}