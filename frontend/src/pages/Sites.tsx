import { useEffect, useState } from 'react';

import type { Camera, Site } from '../api';
import {
  createCamera,
  createSite,
  deleteCamera,
  deleteSite,
  getCameras,
  getErrorMessage,
  getSites,
  updateCamera,
  updateSite,
} from '../api';

export default function SitesPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [newName, setNewName] = useState('');
  const [newCameraName, setNewCameraName] = useState('');
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingCameraId, setEditingCameraId] = useState<string | null>(null);
  const [editingCameraName, setEditingCameraName] = useState('');
  const [editingCameraSiteId, setEditingCameraSiteId] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadInventory = async () => {
    setLoading(true);
    setError(null);

    try {
      const [sitesData, camerasData] = await Promise.all([getSites(), getCameras()]);
      setSites(sitesData);
      setCameras(camerasData);
      setSelectedSiteId((currentSiteId) => {
        if (currentSiteId && sitesData.some((site) => site.id === currentSiteId)) {
          return currentSiteId;
        }

        return sitesData[0]?.id ?? '';
      });
    } catch (error) {
      setError(getErrorMessage(error, 'Failed to load sites and cameras'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInventory();
  }, []);

  const handleAdd = async () => {
    if (!newName.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      await createSite(newName.trim());
      setNewName('');
      await loadInventory();
    } catch (error) {
      setError(getErrorMessage(error, 'Failed to create site'));
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (site: Site) => {
    setEditingId(site.id);
    setEditingName(site.name);
  };

  const saveEdit = async () => {
    if (!editingId || !editingName.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      await updateSite(Number(editingId), editingName.trim());
      setEditingId(null);
      setEditingName('');
      await loadInventory();
    } catch (error) {
      setError(getErrorMessage(error, 'Failed to update site'));
    } finally {
      setSubmitting(false);
    }
  };

  const removeSite = async (id: string) => {
    setSubmitting(true);
    setError(null);
    try {
      await deleteSite(Number(id));
      await loadInventory();
    } catch (error) {
      setError(getErrorMessage(error, 'Failed to delete site'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCameraAdd = async () => {
    if (!newCameraName.trim() || !selectedSiteId) return;

    setSubmitting(true);
    setError(null);
    try {
      await createCamera(newCameraName.trim(), Number(selectedSiteId));
      setNewCameraName('');
      await loadInventory();
    } catch (error) {
      setError(getErrorMessage(error, 'Failed to create camera'));
    } finally {
      setSubmitting(false);
    }
  };

  const startCameraEdit = (camera: Camera) => {
    setEditingCameraId(camera.id);
    setEditingCameraName(camera.name);
    setEditingCameraSiteId(camera.site_id);
  };

  const saveCameraEdit = async () => {
    if (!editingCameraId || !editingCameraName.trim() || !editingCameraSiteId) return;

    setSubmitting(true);
    setError(null);
    try {
      await updateCamera(
        Number(editingCameraId),
        editingCameraName.trim(),
        Number(editingCameraSiteId),
      );
      setEditingCameraId(null);
      setEditingCameraName('');
      setEditingCameraSiteId('');
      await loadInventory();
    } catch (error) {
      setError(getErrorMessage(error, 'Failed to update camera'));
    } finally {
      setSubmitting(false);
    }
  };

  const removeCamera = async (id: string) => {
    setSubmitting(true);
    setError(null);
    try {
      await deleteCamera(Number(id));
      await loadInventory();
    } catch (error) {
      setError(getErrorMessage(error, 'Failed to delete camera'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <span className="eyebrow">Registry</span>
          <h2>Sites and cameras</h2>
          <p>Keep your surveillance footprint organized across locations and devices.</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="stats-grid compact">
        <div className="stat-card accent-blue">
          <span>Sites</span>
          <strong>{loading ? '...' : sites.length}</strong>
          <p>Locations currently registered.</p>
        </div>
        <div className="stat-card accent-green">
          <span>Cameras</span>
          <strong>{loading ? '...' : cameras.length}</strong>
          <p>Video sources connected to the system.</p>
        </div>
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Create site</span>
              <h3>Add a new location</h3>
            </div>
          </div>

          <div className="stack-form">
            <label>
              Site name
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="North Gate Campus"
              />
            </label>
            <button onClick={handleAdd} disabled={submitting || !newName.trim()}>
              Add site
            </button>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Create camera</span>
              <h3>Assign a camera to a site</h3>
            </div>
          </div>

          <div className="stack-form">
            <label>
              Camera name
              <input
                value={newCameraName}
                onChange={(e) => setNewCameraName(e.target.value)}
                placeholder="Entrance Camera 01"
              />
            </label>
            <label>
              Site
              <select value={selectedSiteId} onChange={(e) => setSelectedSiteId(e.target.value)}>
                {sites.length === 0 ? <option value="">No sites available</option> : null}
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </label>
            <button onClick={handleCameraAdd} disabled={submitting || !newCameraName.trim() || !selectedSiteId}>
              Add camera
            </button>
          </div>
        </section>
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Sites</span>
              <h3>Location inventory</h3>
            </div>
          </div>

          {loading ? (
            <div className="empty-state">Loading sites...</div>
          ) : sites.length === 0 ? (
            <div className="empty-state">No sites registered yet.</div>
          ) : (
            <div className="table-wrap">
              <table className="simple-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Created At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sites.map((site) => (
                    <tr key={site.id}>
                      <td>
                        {editingId === site.id ? (
                          <input value={editingName} onChange={(e) => setEditingName(e.target.value)} />
                        ) : (
                          site.name
                        )}
                      </td>
                      <td>{new Date(site.created_at).toLocaleString()}</td>
                      <td className="row-actions">
                        {editingId === site.id ? (
                          <button onClick={saveEdit} disabled={submitting}>
                            Save
                          </button>
                        ) : (
                          <button onClick={() => startEdit(site)} disabled={submitting}>
                            Edit
                          </button>
                        )}
                        <button
                          className="button-secondary"
                          onClick={() => removeSite(site.id)}
                          disabled={submitting}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Cameras</span>
              <h3>Device inventory</h3>
            </div>
          </div>

          {loading ? (
            <div className="empty-state">Loading cameras...</div>
          ) : cameras.length === 0 ? (
            <div className="empty-state">No cameras registered yet.</div>
          ) : (
            <div className="table-wrap">
              <table className="simple-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Site</th>
                    <th>Created At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {cameras.map((camera) => (
                    <tr key={camera.id}>
                      <td>
                        {editingCameraId === camera.id ? (
                          <input
                            value={editingCameraName}
                            onChange={(e) => setEditingCameraName(e.target.value)}
                          />
                        ) : (
                          camera.name
                        )}
                      </td>
                      <td>
                        {editingCameraId === camera.id ? (
                          <select
                            value={editingCameraSiteId}
                            onChange={(e) => setEditingCameraSiteId(e.target.value)}
                          >
                            {sites.map((site) => (
                              <option key={site.id} value={site.id}>
                                {site.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          camera.site_name ?? camera.site_id
                        )}
                      </td>
                      <td>{new Date(camera.created_at).toLocaleString()}</td>
                      <td className="row-actions">
                        {editingCameraId === camera.id ? (
                          <button onClick={saveCameraEdit} disabled={submitting}>
                            Save
                          </button>
                        ) : (
                          <button onClick={() => startCameraEdit(camera)} disabled={submitting}>
                            Edit
                          </button>
                        )}
                        <button
                          className="button-secondary"
                          onClick={() => removeCamera(camera.id)}
                          disabled={submitting}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
