import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { getErrorMessage, login } from '../api';

type LoginPageProps = {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
};

export default function LoginPage({ theme, onToggleTheme }: LoginPageProps) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@smartsurveillance.local');
  const [password, setPassword] = useState('password');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const data = await login(email, password);
      localStorage.setItem('token', data.access_token);
      navigate('/dashboard');
    } catch (error) {
      setError(getErrorMessage(error, 'Login failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <button type="button" className="theme-toggle auth-theme-toggle" onClick={onToggleTheme}>
        {theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
      </button>

      <section className="auth-hero">
        <span className="eyebrow">Command center</span>
        <h1>Monitor sites, catch anomalies, and respond faster.</h1>
        <p>
          A sharper control surface for surveillance teams with live alerts,
          event analytics, and site management in one place.
        </p>
        <div className="auth-metrics">
          <div>
            <strong>24/7</strong>
            <span>Operations visibility</span>
          </div>
          <div>
            <strong>Live</strong>
            <span>Alert acknowledgement</span>
          </div>
          <div>
            <strong>Unified</strong>
            <span>Sites and cameras</span>
          </div>
        </div>
      </section>

      <section className="auth-card">
        <div className="auth-card-header">
          <div>
            <span className="eyebrow">Secure sign in</span>
            <h2>Welcome back</h2>
            <p>Use your operator credentials to enter the console.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="stack-form">
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </label>

          <label>
            Password
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
          </label>

          <button type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>

          {error && <div className="error">{error}</div>}
        </form>

        <div className="auth-footer">
          <span>New here?</span>
          <Link to="/register" className="text-link">
            Create an account
          </Link>
        </div>
      </section>
    </div>
  );
}
