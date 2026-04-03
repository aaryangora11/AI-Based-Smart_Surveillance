import { useCallback, useEffect, useState } from 'react';

import type { AlertItem } from '../api';
import { acknowledgeAlert, acknowledgeAllAlerts, getAlerts, getErrorMessage } from '../api';

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(async (showLoader = false) => {
    if (showLoader) {
      setLoading(true);
    }

    try {
      const data = await getAlerts(
        selectedDate
          ? {
              date: selectedDate,
              includeAcknowledged: true,
            }
          : undefined,
      );
      setAlerts(data.alerts || []);
      setError(null);
    } catch (error) {
      setError(getErrorMessage(error, 'Failed to load alerts'));
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  }, [selectedDate]);

  useEffect(() => {
    void load(true);
    if (selectedDate) {
      return undefined;
    }

    const id = window.setInterval(() => {
      void load();
    }, 5000);
    return () => window.clearInterval(id);
  }, [load, selectedDate]);

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

  const ackAll = async () => {
    setBulkBusy(true);
    try {
      await acknowledgeAllAlerts();
      await load();
    } catch (error) {
      setError(getErrorMessage(error, 'Acknowledge all failed'));
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <span className="eyebrow">Response queue</span>
          <h2>{selectedDate ? 'Alerts history' : 'Active alerts'}</h2>
          <p>
            {selectedDate
              ? 'Review alerts captured on the selected date, including acknowledged entries.'
              : 'Review active incidents in one table and clear the queue quickly when needed.'}
          </p>
        </div>

        <div className="alerts-toolbar">
          <label className="alerts-date-filter">
            <span>Fetch by date</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
            />
          </label>

          {selectedDate ? (
            <button
              type="button"
              className="button-secondary"
              onClick={() => setSelectedDate('')}
              disabled={loading}
            >
              Clear date
            </button>
          ) : null}

          {!selectedDate && alerts.length > 0 ? (
            <button
              type="button"
              className="button-secondary"
              onClick={ackAll}
              disabled={loading || bulkBusy || Boolean(busyId)}
            >
              {bulkBusy ? 'Acknowledging...' : 'Acknowledge all'}
            </button>
          ) : null}
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div className="panel">
          <div className="empty-state">Loading live alerts...</div>
        </div>
      ) : alerts.length === 0 ? (
        <div className="panel">
          <div className="empty-state">
            {selectedDate ? 'No alerts found for the selected date.' : 'No active alerts right now.'}
          </div>
        </div>
      ) : (
        <section className="panel">
          <div className="table-wrap alerts-table-wrap">
            <table className="simple-table alerts-table">
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Type</th>
                  <th>Camera</th>
                  <th>Zone</th>
                  <th>Count</th>
                  <th>Time</th>
                  <th>Snapshot</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((alert) => (
                  <tr key={alert.id}>
                    <td>
                      <span className={`severity-pill severity-${alert.severity.toLowerCase()}`}>
                        {alert.severity}
                      </span>
                    </td>
                    <td>
                      <strong>{alert.message ?? alert.type}</strong>
                    </td>
                    <td>{alert.cameraName}</td>
                    <td>{alert.zoneName}</td>
                    <td>{alert.count ?? '--'}</td>
                    <td>{new Date(alert.timestamp).toLocaleString()}</td>
                    <td>
                      {alert.snapshotUrl ? (
                        <a href={alert.snapshotUrl} target="_blank" rel="noreferrer" className="text-link">
                          View
                        </a>
                      ) : (
                        <span className="muted-text">None</span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="button-secondary alerts-action-button"
                        onClick={() => ack(alert.id)}
                        disabled={alert.acknowledged || busyId === alert.id || bulkBusy}
                      >
                        {busyId === alert.id ? 'Updating...' : 'Acknowledge'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
