import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './login.css'

const API_BASE_URL = `${window.location.protocol}//${window.location.hostname}:5000`;

const Login = ({ setIsAuthenticated }) => {
  const [userId, setUserId] = useState('');
  const [error, setError] = useState('');
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    if (!userId.trim()) {
      setError('Please enter your User ID');
      setIsLoading(false);
      return;
    }

    try {
      const response = await axios.get(`${API_BASE_URL}/api/LOGIN`);
      const userRecord = response.data.find(record => record.USRID === userId);
      
      if (userRecord) {
        // Create a formatted user object with consistent property names
        const userData = {
          id: userRecord.USRID,
          name: userRecord.name || userRecord.Employee_Name || userRecord.NM || userId,
          department: userRecord.DEPARTMENT || userRecord.department || ''
        };
        
        console.log('User authenticated:', userData);
        
        // Store complete user info and token in localStorage
        localStorage.setItem('user', JSON.stringify(userData));
        localStorage.setItem('token', 'authenticated');
        
        // Show success message
        setLoginSuccess(true);
        
        // Delay navigation to show success message
        setTimeout(() => {
          setIsAuthenticated(true);
          navigate('/');
        }, 1000);
      } else {
        setError('Invalid User ID. Please try again.');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('Server error. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <div>
          <h2 className="login-header">Sign in to your account</h2>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="userId" className="sr-only">User ID</label>
            <input
              id="userId"
              name="userId"
              type="text"
              required
              placeholder="Enter your User ID"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              disabled={isLoading || loginSuccess}
            />
          </div>
  
          {error && (
            <div className="error-message">{error}</div>
          )}
          
          {loginSuccess && (
            <div className="success-message">
              <i className="fas fa-check-circle"></i> Login Successful, redirecting...
            </div>
          )}
  
          <div>
            <button 
              type="submit" 
              disabled={isLoading || loginSuccess}
              className={isLoading ? 'loading' : ''}
            >
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login; 