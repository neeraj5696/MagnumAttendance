import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_BASE_URL = `${window.location.protocol}//${window.location.hostname}:5000`;

const Login = ({ setIsAuthenticated }) => {
  const [userId, setUserId] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // First fetch all attendance data to check if user exists
      const response = await axios.get(`${API_BASE_URL}/api/test-db`);
      const userExists = response.data.some(record => record.USRID === userId);

      if (userExists) {
        // Get user details from the first matching record
        const userRecord = response.data.find(record => record.USRID === userId);
        // Store user info in localStorage
        localStorage.setItem('user', JSON.stringify({
          id: userRecord.USRID,
          name: userRecord.Employee_Name,
          department: userRecord.DEPARTMENT
        }));
        setIsAuthenticated(true);
        navigate('/');
      } else {
        setError('Invalid User ID');
      }
    } catch (err) {
      setError('Error validating user ID');
      console.error('Login error:', err);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Sign in to your account
          </h2>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="userId" className="sr-only">
                User ID
              </label>
              <input
                id="userId"
                name="userId"
                type="text"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Enter your User ID"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className="text-red-500 text-sm text-center">{error}</div>
          )}

          <div>
            <button
              type="submit"
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Sign in
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login; 