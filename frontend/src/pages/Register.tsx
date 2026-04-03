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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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
      });

      const authData = await login(email, password);
      localStorage.setItem('token', authData.access_token);
      localStorage.setItem('user_full_name', authData.user?.full_name || fullName || username || 'Operator');
      localStorage.setItem('user_email', authData.user?.email || email);
      navigate('/dashboard');
    } catch (error) {
      setError(getErrorMessage(error, 'Registration failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <label className="theme-switch auth-theme-toggle">
        <span>{theme === 'dark' ? 'Dark' : 'Light'}</span>
        <input
          type="checkbox"
          checked={theme === 'dark'}
          onChange={onToggleTheme}
          aria-label="Toggle dark mode"
        />
        <span className="theme-slider" aria-hidden="true" />
      </label>

      <section className="auth-hero auth-hero-register">
        <div className="auth-hero-copy">
          <span className="eyebrow">Quick onboarding</span>
          <h1>Create your account and step directly into the monitoring workspace.</h1>
          <p>Simple registration, immediate access, and no unnecessary setup steps.</p>
        </div>

        <div className="auth-preview-panel auth-preview-panel-register">
          <div className="auth-preview-strip" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <div className="auth-preview-card auth-preview-card-primary">
            <span>Fast start</span>
            <strong>Register once and continue straight into operations</strong>
          </div>
          <div className="auth-preview-grid">
            <div className="auth-preview-card">
              <span>Access</span>
              <strong>Default role applied automatically</strong>
            </div>
            <div className="auth-preview-card">
              <span>Flow</span>
              <strong>Account creation and sign-in in one step</strong>
            </div>
          </div>
        </div>

        <div className="auth-metrics">
          <div>
            <strong>Fast</strong>
            <span>Clean self-registration</span>
          </div>
          <div>
            <strong>Secure</strong>
            <span>Email and password based access</span>
          </div>
          <div>
            <strong>Ready</strong>
            <span>Automatic default access</span>
          </div>
        </div>
      </section>

      <section className="auth-card">
        <div className="auth-card-header">
          <div>
            <span className="eyebrow">Registration</span>
            <h2>Create account</h2>
            <p>Enter your details and we will sign you in right away.</p>
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
            Password
            <div className="password-field">
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPassword ? 'text' : 'password'}
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
              >
                <span className={`eye-icon${showPassword ? ' eye-icon-off' : ''}`} aria-hidden="true" />
                <span className="sr-only">{showPassword ? 'Hide password' : 'Show password'}</span>
              </button>
            </div>
          </label>

          <label>
            Confirm password
            <div className="password-field">
              <input
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                type={showConfirmPassword ? 'text' : 'password'}
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowConfirmPassword((current) => !current)}
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showConfirmPassword}
              >
                <span className={`eye-icon${showConfirmPassword ? ' eye-icon-off' : ''}`} aria-hidden="true" />
                <span className="sr-only">{showConfirmPassword ? 'Hide password' : 'Show password'}</span>
              </button>
            </div>
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
