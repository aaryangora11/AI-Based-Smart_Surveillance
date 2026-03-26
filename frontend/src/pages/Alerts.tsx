import { useEffect, useState } from 'react';

import type { AlertItem } from '../api';
import { acknowledgeAlert, getAlerts, getErrorMessage } from '../api';

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async (showLoader = false) => {
    if (showLoader) {
      setLoading(true);
    }

    try {
      const data = await getAlerts();
      setAlerts(data.alerts || []);
      setError(null);
    } catch (error) {
      setError(getErrorMessage(error, 'Failed to load alerts'));
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    load(true);
    const id = window.setInterval(load, 5000);
    return () => window.clearInterval(id);
  }, []);

  const ack = async (id: string) => {
    setBusyId(id);
    try {
      await acknowledgeAlert(id);
      await load();
    } catch (error) {
      setError(getErrorMessage(error, 'Acknowledge failed'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <span className="eyebrow">Response queue</span>
          <h2>Active alerts</h2>
          <p>Monitor urgent detections and acknowledge incidents as they are reviewed.</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div className="panel">
          <div className="empty-state">Loading live alerts...</div>
        </div>
      ) : alerts.length === 0 ? (
        <div className="panel">
          <div className="empty-state">No active alerts right now.</div>
        </div>
      ) : (
        <div className="alert-grid">
          {alerts.map((alert) => (
            <article key={alert.id} className="alert-card">
              <div className="alert-card-header">
                <div>
                  <span className={`severity-pill severity-${alert.severity.toLowerCase()}`}>
                    {alert.severity}
                  </span>
                  <h3>{alert.type}</h3>
                </div>
                <button
                  onClick={() => ack(alert.id)}
                  disabled={alert.acknowledged || busyId === alert.id}
                >
                  {busyId === alert.id ? 'Updating...' : 'Acknowledge'}
                </button>
              </div>

              <div className="alert-meta">
                <div>
                  <span>Camera</span>
                  <strong>{alert.cameraName}</strong>
                </div>
                <div>
                  <span>Zone</span>
                  <strong>{alert.zoneName}</strong>
                </div>
                <div>
                  <span>Count</span>
                  <strong>{alert.count ?? '--'}</strong>
                </div>
                <div>
                  <span>Time</span>
                  <strong>{new Date(alert.timestamp).toLocaleString()}</strong>
                </div>
              </div>

              {alert.snapshotUrl ? (
                <a href={alert.snapshotUrl} target="_blank" rel="noreferrer" className="text-link">
                  Open snapshot
                </a>
              ) : (
                <span className="muted-text">No snapshot available</span>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
