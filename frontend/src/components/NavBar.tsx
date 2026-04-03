import type { KeyboardEvent } from 'react';
import { useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';

type NavBarProps = {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
};

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', glyph: 'grid' },
  { to: '/sites', label: 'Sites', glyph: 'stack' },
  { to: '/alerts', label: 'Alerts', glyph: 'bell' },
  { to: '/analytics', label: 'Analytics', glyph: 'bars' },
  { to: '/vision', label: 'Vision', glyph: 'lens' },
  { to: '/snapshots', label: 'Snapshots', glyph: 'frame' },
];

export default function NavBar({ theme, onToggleTheme }: NavBarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const currentPageLabel = useMemo(
    () => NAV_ITEMS.find((item) => item.to === location.pathname)?.label ?? 'Dashboard',
    [location.pathname],
  );

  const goToDashboard = () => {
    setMenuOpen(false);
    navigate('/dashboard');
  };

  const logout = () => {
    setMenuOpen(false);
    localStorage.removeItem('token');
    localStorage.removeItem('user_full_name');
    localStorage.removeItem('user_email');
    navigate('/login');
  };

  const onBrandKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      goToDashboard();
    }
  };

  const linkClassName = ({ isActive }: { isActive: boolean }) =>
    `sidebar-link${isActive ? ' active' : ''}`;

  return (
    <>
      <button
        type="button"
        className="sidebar-mobile-toggle"
        onClick={() => setMenuOpen((open) => !open)}
        aria-expanded={menuOpen}
        aria-label="Toggle sidebar"
      >
        {menuOpen ? 'Close' : 'Menu'}
      </button>

      {menuOpen ? <button type="button" className="sidebar-backdrop" onClick={() => setMenuOpen(false)} /> : null}

      <aside className={`sidebar-shell${menuOpen ? ' open' : ''}`}>
        <div
          className="sidebar-brand"
          onClick={goToDashboard}
          onKeyDown={onBrandKeyDown}
          role="button"
          tabIndex={0}
        >
          <span className="sidebar-brand-mark">SS</span>
          <div>
            <strong>Smart Surveillance</strong>
            <p>{currentPageLabel} workspace</p>
          </div>
        </div>

        <nav className="sidebar-nav">
          <span className="sidebar-nav-label">Workspace</span>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={linkClassName}
              onClick={() => setMenuOpen(false)}
            >
              <span className={`sidebar-link-icon sidebar-icon-${item.glyph}`} aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
              </span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-controls">
          <label className="theme-switch sidebar-theme-switch">
            <span>{theme === 'dark' ? 'Dark mode' : 'Light mode'}</span>
            <input
              type="checkbox"
              checked={theme === 'dark'}
              onChange={() => onToggleTheme()}
              aria-label="Toggle dark mode"
            />
            <span className="theme-slider" aria-hidden="true" />
          </label>

          <button type="button" onClick={logout} className="button-logout sidebar-logout">
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}
