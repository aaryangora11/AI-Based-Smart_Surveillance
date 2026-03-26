import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { AnalyticsDatum } from '../api';
import { getAnalyticsByEventType, getAnalyticsBySeverity, getErrorMessage } from '../api';

const COLORS = ['#0f766e', '#ea580c', '#1d4ed8', '#be123c', '#7c3aed'];

export default function AnalyticsPage() {
  const [byEvent, setByEvent] = useState<AnalyticsDatum[]>([]);
  const [bySeverity, setBySeverity] = useState<AnalyticsDatum[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [eventData, severityData] = await Promise.all([
          getAnalyticsByEventType(),
          getAnalyticsBySeverity(),
        ]);
        setByEvent(eventData);
        setBySeverity(severityData);
      } catch (error) {
        setError(getErrorMessage(error, 'Failed to load analytics'));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <span className="eyebrow">Analytics</span>
          <h2>Event intelligence</h2>
          <p>Understand which incident types dominate and how severity is distributed.</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="chart-grid">
        <div className="chart-card">
          <h3>Events by type</h3>
          <div className="chart-wrap">
            {loading ? (
              <div className="empty-state">Loading event distribution...</div>
            ) : byEvent.length === 0 ? (
              <div className="empty-state">No event data available yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={byEvent} margin={{ top: 12, right: 12, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#d7dfef" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#1d4ed8" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="chart-card">
          <h3>Events by severity</h3>
          <div className="chart-wrap">
            {loading ? (
              <div className="empty-state">Loading severity distribution...</div>
            ) : bySeverity.length === 0 ? (
              <div className="empty-state">No severity data available yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={bySeverity} dataKey="value" nameKey="label" outerRadius={120} fill="#8884d8" label>
                    {bySeverity.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
