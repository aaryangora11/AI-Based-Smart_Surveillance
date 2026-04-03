import { useEffect, useState } from 'react';

import type { SnapshotItem } from '../api';
import { getErrorMessage, getSnapshots } from '../api';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

export default function SnapshotsPage() {
  const [snapshots, setSnapshots] = useState<SnapshotItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSnapshots = async (showLoader = false) => {
    if (showLoader) {
      setLoading(true);
    }

    try {
      const data = await getSnapshots();
      setSnapshots(data.snapshots || []);
      setError(null);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Failed to load snapshots'));
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    void loadSnapshots(true);
  }, []);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <span className="eyebrow">Evidence</span>
          <h2>Snapshots</h2>
          <p>Browse saved crowd-alert frames, review severity, and open the original capture when needed.</p>
        </div>

        <button type="button" className="button-secondary" onClick={() => void loadSnapshots(true)} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      {loading ? (
        <section className="panel">
          <div className="empty-state">Loading captured snapshots...</div>
        </section>
      ) : snapshots.length === 0 ? (
        <section className="panel">
          <div className="empty-state">No saved snapshots yet. Threshold captures will appear here after a live run.</div>
        </section>
      ) : (
        <section className="snapshot-gallery">
          {snapshots.map((snapshot) => (
            <article key={snapshot.filename} className="snapshot-gallery-card panel">
              <div className="snapshot-gallery-media">
                <img src={`${API_BASE}${snapshot.url}`} alt={snapshot.message || snapshot.filename} />
              </div>

              <div className="snapshot-gallery-body">
                <div className="snapshot-gallery-header">
                  <div>
                    <span className="eyebrow">Saved frame</span>
                    <h3>{snapshot.camera_name || 'Monitoring camera'}</h3>
                  </div>
                  {snapshot.severity ? (
                    <span className={`severity-pill severity-${snapshot.severity.toLowerCase()}`}>
                      {snapshot.severity}
                    </span>
                  ) : null}
                </div>

                <p className="snapshot-gallery-message">
                  {snapshot.message || 'Captured automatically during a crowd-threshold transition.'}
                </p>

                <div className="snapshot-gallery-meta">
                  <div className="snapshot-gallery-stat">
                    <span>Zone</span>
                    <strong>{snapshot.zone_name || 'A0'}</strong>
                  </div>
                  <div className="snapshot-gallery-stat">
                    <span>Saved</span>
                    <strong>{new Date(snapshot.created_at).toLocaleString()}</strong>
                  </div>
                  <div className="snapshot-gallery-stat">
                    <span>Size</span>
                    <strong>{Math.max(1, Math.round(snapshot.size_bytes / 1024))} KB</strong>
                  </div>
                  <div className="snapshot-gallery-stat">
                    <span>Status</span>
                    <strong>{snapshot.acknowledged ? 'Acknowledged' : 'Unacknowledged'}</strong>
                  </div>
                </div>

                <div className="snapshot-gallery-footer">
                  <p>{snapshot.filename}</p>
                  <a className="text-link" href={`${API_BASE}${snapshot.url}`} target="_blank" rel="noreferrer">
                    Open full image
                  </a>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
