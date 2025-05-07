import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './login.css'

const API_BASE_URL = `${window.location.protocol}//${window.location.hostname}:5000`;

const Login = ({ setIsAuthenticated }) => {
  const [userId, setUserId] = useState('');
  const [error, setError] = useState('');
  const [loginSuccess, setLoginSuccess] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.get(`${API_BASE_URL}/api/test-db`);
      const userExists = response.data.some(record => record.USRID === userId);

      if (userExists) {
        const userRecord = response.data.find(record => record.USRID === userId);
        const userData = {
          id: userRecord.USRID,
          name: userRecord.Employee_Name,
          department: userRecord.DEPARTMENT
        };
        
        // Store user info and token in localStorage
        localStorage.setItem('user', JSON.stringify(userData));
        localStorage.setItem('token', 'authenticated'); // Simple token for now
        
        // Show success message before redirect
        setLoginSuccess(true);
        setError('');
        
        // Delay navigation to show success message
        setTimeout(() => {
          setIsAuthenticated(true);
          navigate('/');
        }, 1500);
      } else {
        setError('Invalid User ID');
      }
    } catch (err) {
      setError('Error validating user ID');
      console.error('Login error:', err);
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
            <button type="submit" disabled={loginSuccess}>Sign in</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login; 