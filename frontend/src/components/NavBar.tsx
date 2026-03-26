import type { KeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';

type NavBarProps = {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
};

export default function NavBar({ theme, onToggleTheme }: NavBarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const navRef = useRef<HTMLElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);

  const linkClassName = ({ isActive }: { isActive: boolean }) =>
    `nav-link${isActive ? ' active' : ''}`;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!navRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
        setActionsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const logout = () => {
    setMenuOpen(false);
    setActionsOpen(false);
    localStorage.removeItem('token');
    navigate('/login');
  };

  const goToDashboard = () => {
    setMenuOpen(false);
    setActionsOpen(false);
    navigate('/dashboard');
  };

  const onBrandKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      goToDashboard();
    }
  };

  const closeMenus = () => {
    setMenuOpen(false);
    setActionsOpen(false);
  };

  const pageTitle = location.pathname.slice(1) || 'dashboard';

  return (
    <nav className="navbar" ref={navRef}>
      <div
        className="nav-brand"
        onClick={goToDashboard}
        onKeyDown={onBrandKeyDown}
        role="button"
        tabIndex={0}
      >
        <span className="nav-brand-mark">SS</span>
        <div>
          <strong>Smart Surveillance</strong>
          <p>{pageTitle.charAt(0).toUpperCase() + pageTitle.slice(1)} workspace</p>
        </div>
      </div>

      <div className="nav-shell">
        <button
          type="button"
          className="nav-menu-toggle"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-label="Toggle navigation"
        >
          Navigate
        </button>

        <div className={`nav-links-shell${menuOpen ? ' open' : ''}`}>
          <div className="nav-left">
            <NavLink to="/dashboard" className={linkClassName} onClick={closeMenus}>
              Dashboard
            </NavLink>
            <NavLink to="/sites" className={linkClassName} onClick={closeMenus}>
              Sites
            </NavLink>
            <NavLink to="/alerts" className={linkClassName} onClick={closeMenus}>
              Alerts
            </NavLink>
            <NavLink to="/analytics" className={linkClassName} onClick={closeMenus}>
              Analytics
            </NavLink>
            <NavLink to="/vision" className={linkClassName} onClick={closeMenus}>
              Vision
            </NavLink>
          </div>
        </div>

        <div className="nav-actions">
          <button
            type="button"
            className="nav-actions-toggle"
            onClick={() => setActionsOpen((open) => !open)}
            aria-expanded={actionsOpen}
          >
            Controls
          </button>

          {actionsOpen ? (
            <div className="nav-action-panel">
              <div className="nav-action-panel-header">
                <span className="eyebrow">Workspace controls</span>
                <strong>{theme === 'dark' ? 'Dark mode active' : 'Light mode active'}</strong>
              </div>

              <button
                type="button"
                onClick={() => {
                  onToggleTheme();
                  setActionsOpen(false);
                }}
                className="button-secondary nav-action-button"
              >
                {theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              </button>

              <button type="button" onClick={logout} className="button-logout nav-action-button">
                Logout
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
