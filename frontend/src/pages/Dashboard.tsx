import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { AlertItem, AnalyticsDatum, DashboardSummary, ProcessedVideo } from '../api';
import {
  getAnalyticsByEventType,
  getAnalyticsBySeverity,
  getAnalyticsSummary,
  getErrorMessage,
  getLatestProcessedVideo,
} from '../api';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';
const ALERTS_WS_URL = `${API_BASE.replace(/^http/, 'ws')}/alerts/stream`;
const DASHBOARD_POLL_MS = 10000;

type ToastAlert = AlertItem & {
  toastKey: string;
};

export default function DashboardPage() {
  const fullName = localStorage.getItem('user_full_name') || 'Operator';
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [byEvent, setByEvent] = useState<AnalyticsDatum[]>([]);
  const [bySeverity, setBySeverity] = useState<AnalyticsDatum[]>([]);
  const [recentAlerts, setRecentAlerts] = useState<AlertItem[]>([]);
  const [video, setVideo] = useState<ProcessedVideo | null>(null);
  const [toastAlerts, setToastAlerts] = useState<ToastAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seenAlertIdsRef = useRef<Set<string>>(new Set());
  const hasHydratedAlertsRef = useRef(false);

  const playAlertBeep = (severity: string) => {
    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextClass) {
      return;
    }

    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = severity.toLowerCase() === 'high' ? 1040 : 880;
    gainNode.gain.value = 0.04;
    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.18);
    oscillator.onended = () => {
      void context.close();
    };
  };

  const loadDashboard = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }

    try {
      const [summaryData, eventData, severityData, latestVideoData] = await Promise.all([
        getAnalyticsSummary(),
        getAnalyticsByEventType(),
        getAnalyticsBySeverity(),
        getLatestProcessedVideo(),
      ]);

      setSummary(summaryData);
      setByEvent(eventData);
      setBySeverity(severityData);
      setVideo(latestVideoData.video);
    } catch (error) {
      setError(getErrorMessage(error, 'Failed to load dashboard'));
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadDashboard();

    const interval = window.setInterval(() => {
      void loadDashboard(true);
    }, DASHBOARD_POLL_MS);

    return () => window.clearInterval(interval);
  }, [loadDashboard]);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimeout: number | null = null;
    let closedByEffect = false;

    const connect = () => {
      socket = new WebSocket(ALERTS_WS_URL);

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data) as { type?: string; alerts?: AlertItem[] };
        if (data.type !== 'alerts_snapshot' || !data.alerts) {
          return;
        }

        const alerts = data.alerts;
        setRecentAlerts(alerts);

        const currentIds = new Set(alerts.map((alert) => alert.id));
        if (!hasHydratedAlertsRef.current) {
          seenAlertIdsRef.current = currentIds;
          hasHydratedAlertsRef.current = true;
          return;
        }

        const newAlerts = alerts.filter((alert) => !seenAlertIdsRef.current.has(alert.id));
        if (newAlerts.length > 0) {
          const toastBatch = newAlerts.map((alert) => ({
            ...alert,
            toastKey: `${alert.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          }));

          setToastAlerts((current) => [...toastBatch, ...current].slice(0, 4));
          playAlertBeep(toastBatch[0].severity);

          toastBatch.forEach((toast) => {
            window.setTimeout(() => {
              setToastAlerts((current) => current.filter((item) => item.toastKey !== toast.toastKey));
            }, 6500);
          });
        }

        seenAlertIdsRef.current = currentIds;
      };

      socket.onclose = () => {
        if (closedByEffect) {
          return;
        }
        reconnectTimeout = window.setTimeout(connect, 2000);
      };

      socket.onerror = () => {
        socket?.close();
      };
    };

    connect();

    return () => {
      closedByEffect = true;
      if (reconnectTimeout !== null) {
        window.clearTimeout(reconnectTimeout);
      }
      socket?.close();
    };
  }, []);

  const severityPeak = Math.max(...bySeverity.map((entry) => entry.value), 1);
  const totalEvents = summary?.totalEvents ?? 0;
  const activeAlerts = summary?.activeAlerts ?? 0;
  const totalSites = summary?.totalSites ?? 0;
  const totalCameras = summary?.totalCameras ?? 0;
  const latestEvent = summary?.latestEvent;
  const snapshotAlerts = useMemo(
    () => recentAlerts.filter((alert) => alert.snapshotUrl).slice(0, 3),
    [recentAlerts],
  );

  return (
    <div className="page-container">
      <div className="dashboard-toast-stack">
        {toastAlerts.map((alert) => (
          <article key={alert.toastKey} className={`dashboard-toast toast-${alert.severity.toLowerCase()}`}>
            <span className="eyebrow">Incoming alert</span>
            <strong>{alert.message ?? alert.type}</strong>
            <p>
              {alert.cameraName} in {alert.zoneName}
              {alert.count !== null ? ` reached ${alert.count} people.` : ' triggered a crowd alert.'}
            </p>
          </article>
        ))}
      </div>

      <div className="dashboard-greeting">
        <strong>Hello, {fullName}</strong>
      </div>

      <div className="page-header dashboard-header-compact">
        <div>
          <span className="eyebrow">Overview</span>
          <h2>Operations dashboard</h2>
        </div>
        <button className="button-secondary" onClick={() => void loadDashboard()} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <section className="panel dashboard-command-panel">
        <div className="dashboard-command-grid">
          <div className="dashboard-command-lead">
            <span className="eyebrow">Command Strip</span>
            <h3>System posture</h3>
          </div>
          <div className="dashboard-signal-row">
            <div className="signal-chip">
              <span>Alert queue</span>
              <strong>{loading ? '...' : activeAlerts}</strong>
            </div>
            <div className="signal-chip">
              <span>Latest event</span>
              <strong>{latestEvent ? latestEvent.type.replace('_', ' ') : 'No signal'}</strong>
            </div>
            <div className="signal-chip">
              <span>Latest severity</span>
              <strong>{latestEvent?.severity ?? 'idle'}</strong>
            </div>
            <div className="signal-chip">
              <span>Snapshot feed</span>
              <strong>{snapshotAlerts.length > 0 ? 'armed' : 'standby'}</strong>
            </div>
          </div>
        </div>
      </section>

      <div className="stats-grid">
        <div className="stat-card accent-blue stat-card-compact">
          <span>Total events</span>
          <strong>{loading ? '...' : totalEvents}</strong>
        </div>
        <div className="stat-card accent-red stat-card-compact">
          <span>Active alerts</span>
          <strong>{loading ? '...' : activeAlerts}</strong>
        </div>
        <div className="stat-card accent-gold stat-card-compact">
          <span>Sites</span>
          <strong>{loading ? '...' : totalSites}</strong>
        </div>
        <div className="stat-card accent-green stat-card-compact">
          <span>Cameras</span>
          <strong>{loading ? '...' : totalCameras}</strong>
        </div>
      </div>

      <div className="dashboard-grid dashboard-live-grid">
        <section className="panel dashboard-hero-panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">AI Live View</span>
              <h3>Latest crowd-detection output</h3>
            </div>
          </div>

          {video ? (
            <div className="dashboard-video-grid">
              <video
                className="dashboard-hero-video"
                controls
                preload="metadata"
                poster={video.thumbnail_url ? `${API_BASE}${video.thumbnail_url}` : undefined}
                src={`${API_BASE}${video.video_url}`}
              />
              <div className="dashboard-insight-list">
                <div className="dashboard-insight-card">
                  <span>File</span>
                  <strong>{video.filename}</strong>
                </div>
                <div className="dashboard-insight-card">
                  <span>Processed</span>
                  <strong>{new Date(video.uploaded_at).toLocaleString()}</strong>
                </div>
                <div className="dashboard-insight-card">
                  <span>Event</span>
                  <strong>{latestEvent ? latestEvent.type.replace('_', ' ') : 'Awaiting first run'}</strong>
                </div>
                <div className="dashboard-insight-card">
                  <span>Severity</span>
                  <strong>{latestEvent?.severity ?? 'No event yet'}</strong>
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              No processed crowd video yet.
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Snapshot Strip</span>
              <h3>Latest crowd evidence</h3>
            </div>
          </div>

          {snapshotAlerts.length === 0 ? (
            <div className="empty-state">
              Snapshots will appear here when overcrowding is detected.
            </div>
          ) : (
            <div className="dashboard-snapshot-strip">
              {snapshotAlerts.map((alert) => (
                <article key={alert.id} className="snapshot-tile">
                  <img src={`${API_BASE}${alert.snapshotUrl}`} alt={`${alert.cameraName} crowd snapshot`} />
                  <div>
                    <strong>{alert.cameraName}</strong>
                    <p>{new Date(alert.timestamp).toLocaleString()}</p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="dashboard-grid">
        <section className="panel panel-chart">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Distribution</span>
              <h3>Events by type</h3>
            </div>
          </div>

          <div className="chart-wrap">
            {loading ? (
              <div className="empty-state">Loading event analytics...</div>
            ) : byEvent.length === 0 ? (
              <div className="empty-state">No event data yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={byEvent}>
                  <defs>
                    <linearGradient id="dashboardFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0f766e" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#0f766e" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#d5e4df" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#0f766e"
                    fill="url(#dashboardFill)"
                    strokeWidth={3}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Severity</span>
              <h3>Current intensity</h3>
            </div>
          </div>

          {loading ? (
            <div className="empty-state">Loading severity data...</div>
          ) : bySeverity.length === 0 ? (
            <div className="empty-state">No severity data available yet.</div>
          ) : (
            <div className="severity-list">
              {bySeverity.map((item) => (
                <div key={item.label} className="severity-row">
                  <div>
                    <strong>{item.label}</strong>
                    <span>{item.value} events</span>
                  </div>
                  <div className="severity-bar">
                    <span style={{ width: `${Math.max(16, (item.value / severityPeak) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Snapshot</span>
            <h3>Severity distribution</h3>
          </div>
        </div>

        <div className="chart-wrap">
          {loading ? (
            <div className="empty-state">Loading severity distribution...</div>
          ) : bySeverity.length === 0 ? (
            <div className="empty-state">No severity data available yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={bySeverity}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eadfd0" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="value" fill="#c2410c" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>
    </div>
  );
}
