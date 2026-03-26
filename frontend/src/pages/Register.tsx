import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { getErrorMessage, login, register } from '../api';

type RegisterPageProps = {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
};

export default function RegisterPage({ theme, onToggleTheme }: RegisterPageProps) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState('viewer');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      await register({
        email,
        username,
        full_name: fullName,
        password,
        role,
      });

      const authData = await login(email, password);
      localStorage.setItem('token', authData.access_token);
      navigate('/dashboard');
    } catch (error) {
      setError(getErrorMessage(error, 'Registration failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <button type="button" className="theme-toggle auth-theme-toggle" onClick={onToggleTheme}>
        {theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
      </button>

      <section className="auth-hero auth-hero-register">
        <span className="eyebrow">New operator setup</span>
        <h1>Create an account and join the monitoring workspace.</h1>
        <p>
          Register with your email, username, full name, and role so new team members
          can start using the system immediately.
        </p>
        <div className="auth-metrics">
          <div>
            <strong>Email</strong>
            <span>Identity and login</span>
          </div>
          <div>
            <strong>Profile</strong>
            <span>Username and full name</span>
          </div>
          <div>
            <strong>Role</strong>
            <span>Viewer, operator, or admin</span>
          </div>
        </div>
      </section>

      <section className="auth-card">
        <div className="auth-card-header">
          <div>
            <span className="eyebrow">Registration</span>
            <h2>Create account</h2>
            <p>Fill in the account details shown in your API schema and we will log you in.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="stack-form">
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </label>

          <label>
            Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} required />
          </label>

          <label>
            Full name
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </label>

          <label>
            Role
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="viewer">Viewer</option>
              <option value="operator">Operator</option>
              <option value="admin">Admin</option>
            </select>
          </label>

          <label>
            Password
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
          </label>

          <label>
            Confirm password
            <input
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              type="password"
              required
            />
          </label>

          <button type="submit" disabled={loading}>
            {loading ? 'Creating account...' : 'Create account'}
          </button>

          {error && <div className="error">{error}</div>}
        </form>

        <div className="auth-footer">
          <span>Already have an account?</span>
          <Link to="/login" className="text-link">
            Go to sign in
          </Link>
        </div>
      </section>
    </div>
  );
}
