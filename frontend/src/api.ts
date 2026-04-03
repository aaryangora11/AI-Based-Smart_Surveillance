import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

export interface Site {
  id: string;
  name: string;
  created_at: string;
}

export interface Camera {
  id: string;
  name: string;
  site_id: string;
  site_name?: string | null;
  created_at: string;
}

export interface AlertItem {
  id: string;
  type: string;
  cameraId: string;
  cameraName: string;
  zoneName: string;
  count: number | null;
  severity: string;
  timestamp: string;
  snapshotUrl?: string | null;
  acknowledged: boolean;
  message?: string;
}

export interface AnalyticsDatum {
  label: string;
  value: number;
}

export interface ProcessedVideo {
  filename: string;
  video_url: string;
  thumbnail_url?: string | null;
  uploaded_at: string;
  size_bytes: number;
}

export interface SnapshotItem {
  filename: string;
  url: string;
  created_at: string;
  size_bytes: number;
  camera_name?: string | null;
  zone_name?: string | null;
  severity?: string | null;
  event_type?: string | null;
  message?: string | null;
  acknowledged?: boolean;
}

export interface VisionModelOption {
  id: string;
  label: string;
  size_mb: number;
  is_default: boolean;
}

export interface VisionPresetOption {
  id: string;
  label: string;
  description: string;
  confidence: number;
  frame_skip: number;
  preprocess_mode: string;
}

export interface VisionQualityAssessment {
  resolution?: { width: number; height: number } | null;
  fps?: number | null;
  duration_seconds?: number | null;
  brightness_score?: number | null;
  sharpness_score?: number | null;
  reliability: 'high' | 'medium' | 'low' | 'unknown';
  reliability_score: number;
  issues: string[];
  message: string;
  recommended_preset: string;
}

export interface VisionProcessResult {
  message: string;
  video: ProcessedVideo;
  csv_log: string;
  snapshots: string[];
  polygons_used: number[][][];
  stats: {
    total_frames: number;
    processed_frames: number;
    max_count: number;
  };
  event: {
    id: number;
    type: string;
    severity: string;
  };
  alert_created: boolean;
}

export interface VisionJob {
  job_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  message: string;
  source_filename: string;
  camera_id: string;
  crowd_limit: number;
  preview_image_url?: string | null;
  video: ProcessedVideo | null;
  csv_log: string | null;
  snapshots: string[];
  polygons_used: number[][][];
  quality_assessment?: VisionQualityAssessment | null;
  processing_profile?: {
    preset: string;
    confidence: number;
    frame_skip: number;
    preprocess_mode: string;
    model_name: string;
  } | null;
  progress: {
    total_frames: number;
    processed_frames: number;
    max_count: number;
  };
  event: {
    id: number;
    type: string;
    severity: string;
  } | null;
  alert_created: boolean;
  error: string | null;
  started_at: string;
  updated_at: string;
  finished_at: string | null;
}

export interface DashboardSummary {
  totalEvents: number;
  activeAlerts: number;
  totalSites: number;
  totalCameras: number;
  latestEvent: {
    type: string;
    severity: string;
    created_at: string;
  } | null;
}

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      localStorage.removeItem('token');
      if (window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  },
);

export function getErrorMessage(error: unknown, fallback = 'Something went wrong') {
  if (axios.isAxiosError(error)) {
    const detail =
      typeof error.response?.data === 'object' &&
      error.response?.data &&
      'detail' in error.response.data
        ? String(error.response.data.detail)
        : undefined;

    return detail || error.message || fallback;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

export async function login(email: string, password: string) {
  const response = await api.post('/auth/login', { email, password });
  return response.data;
}

export async function register(payload: {
  email: string;
  password: string;
  username?: string;
  full_name?: string;
  role?: string;
}) {
  const response = await api.post('/auth/register', payload);
  return response.data;
}

export async function getSites(): Promise<Site[]> {
  const response = await api.get('/sites');
  return response.data;
}

export async function createSite(name: string) {
  const response = await api.post('/sites', { name });
  return response.data;
}

export async function updateSite(id: number, name: string) {
  const response = await api.put(`/sites/${id}`, { name });
  return response.data;
}

export async function deleteSite(id: number) {
  const response = await api.delete(`/sites/${id}`);
  return response.data;
}

export async function getCameras(): Promise<Camera[]> {
  const response = await api.get('/sites/cameras');
  return response.data;
}

export async function createCamera(name: string, siteId: number) {
  const response = await api.post('/sites/cameras', { name, site_id: siteId });
  return response.data;
}

export async function updateCamera(id: number, name: string, siteId: number) {
  const response = await api.put(`/sites/cameras/${id}`, { name, site_id: siteId });
  return response.data;
}

export async function deleteCamera(id: number) {
  const response = await api.delete(`/sites/cameras/${id}`);
  return response.data;
}

export async function getAlerts(options?: {
  limit?: number;
  date?: string;
  includeAcknowledged?: boolean;
}): Promise<{ alerts: AlertItem[] }> {
  const response = await api.get('/alerts', {
    params: {
      ...(options?.limit ? { limit: options.limit } : {}),
      ...(options?.date ? { date: options.date } : {}),
      ...(options?.includeAcknowledged ? { include_acknowledged: true } : {}),
    },
  });
  return response.data;
}

export async function acknowledgeAlert(alertId: string) {
  const response = await api.post(`/alerts/${alertId}/acknowledge`);
  return response.data;
}

export async function acknowledgeAllAlerts() {
  const response = await api.post('/alerts/acknowledge-all');
  return response.data;
}

export async function getAnalyticsCount() {
  const response = await api.get('/analytics/count');
  return response.data;
}

export async function getAnalyticsByEventType(): Promise<AnalyticsDatum[]> {
  const response = await api.get('/analytics/by-event-type');
  return response.data;
}

export async function getAnalyticsBySeverity(): Promise<AnalyticsDatum[]> {
  const response = await api.get('/analytics/by-severity');
  return response.data;
}

export async function getAnalyticsSummary(): Promise<DashboardSummary> {
  const response = await api.get('/analytics/summary');
  return response.data;
}

export async function uploadSnapshot(file: File) {
  const form = new FormData();
  form.append('file', file);
  const response = await api.post('/uploads/snapshot', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function getLatestProcessedVideo(): Promise<{ video: ProcessedVideo | null }> {
  const response = await api.get('/vision/latest');
  return response.data;
}

export async function getVisionOptions(): Promise<{
  models: VisionModelOption[];
  default_model: string;
  presets: VisionPresetOption[];
}> {
  const response = await api.get('/vision/options');
  return response.data;
}

export async function getSnapshots(limit = 60): Promise<{ snapshots: SnapshotItem[] }> {
  const response = await api.get('/vision/snapshots', {
    params: { limit },
  });
  return response.data;
}

export async function uploadProcessedVideo(file: File): Promise<{ video: ProcessedVideo }> {
  const form = new FormData();
  form.append('file', file);
  const response = await api.post('/vision/upload-video', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function startVisionProcessingJob(payload: {
  file: File;
  crowdLimit: number;
  cameraId: string;
  confidence: number;
  frameSkip: number;
  preset: string;
  modelName: string;
  polygons?: number[][][] | null;
}): Promise<{ job_id: string; status: string; message: string }> {
  const form = new FormData();
  form.append('file', payload.file);
  form.append('crowd_limit', String(payload.crowdLimit));
  form.append('camera_id', payload.cameraId);
  form.append('confidence', String(payload.confidence));
  form.append('frame_skip', String(payload.frameSkip));
  form.append('preset', payload.preset);
  form.append('model_name', payload.modelName);
  if (payload.polygons?.length) {
    form.append('polygons_json', JSON.stringify(payload.polygons));
  }

  const response = await api.post('/vision/process-video', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 0,
  });
  return response.data;
}

export async function getVisionJob(jobId: string): Promise<VisionJob> {
  const response = await api.get(`/vision/jobs/${jobId}`);
  return response.data;
}

export default api;
