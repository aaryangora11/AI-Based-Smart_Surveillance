import type { MouseEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { ProcessedVideo, VisionJob, VisionModelOption, VisionPresetOption } from '../api';
import {
  getErrorMessage,
  getLatestProcessedVideo,
  getVisionJob,
  getVisionOptions,
  startVisionProcessingJob,
} from '../api';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';
const VISION_SESSION_KEY = 'vision-page-state';
const POLYGON_CLOSE_THRESHOLD = 28;
const VISION_WS_BASE = `${API_BASE.replace(/^http/, 'ws')}/vision/jobs`;
const VISION_POLL_MS = 1800;

type Point = {
  x: number;
  y: number;
};

type StoredVisionState = {
  video: ProcessedVideo | null;
  crowdLimit: number;
  cameraId: string;
  confidence: number;
  frameSkip: number;
  preset: string;
  modelName: string;
  success: string | null;
  framePreviewUrl: string | null;
  videoDimensions: { width: number; height: number } | null;
  draftPoints: Point[];
  polygonPoints: Point[];
  activeJobId: string | null;
  activeJob: VisionJob | null;
};

const defaultVisionState: StoredVisionState = {
  video: null,
  crowdLimit: 4,
  cameraId: '7',
  confidence: 0.35,
  frameSkip: 3,
  preset: 'balanced',
  modelName: '',
  success: null,
  framePreviewUrl: null,
  videoDimensions: null,
  draftPoints: [],
  polygonPoints: [],
  activeJobId: null,
  activeJob: null,
};

function loadStoredVisionState(): StoredVisionState {
  const stored = sessionStorage.getItem(VISION_SESSION_KEY);
  if (!stored) {
    return defaultVisionState;
  }

  try {
    return {
      ...defaultVisionState,
      ...(JSON.parse(stored) as Partial<StoredVisionState>),
    };
  } catch {
    return defaultVisionState;
  }
}

export default function VisionPage() {
  const storedState = loadStoredVisionState();
  const [video, setVideo] = useState<ProcessedVideo | null>(storedState.video);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [crowdLimit, setCrowdLimit] = useState(storedState.crowdLimit);
  const [cameraId, setCameraId] = useState(storedState.cameraId);
  const [confidence, setConfidence] = useState(storedState.confidence);
  const [frameSkip, setFrameSkip] = useState(storedState.frameSkip);
  const [preset, setPreset] = useState(storedState.preset);
  const [modelName, setModelName] = useState(storedState.modelName);
  const [activeJobId, setActiveJobId] = useState<string | null>(storedState.activeJobId);
  const [activeJob, setActiveJob] = useState<VisionJob | null>(storedState.activeJob);
  const [modelOptions, setModelOptions] = useState<VisionModelOption[]>([]);
  const [presetOptions, setPresetOptions] = useState<VisionPresetOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(storedState.activeJob?.status === 'queued' || storedState.activeJob?.status === 'processing');
  const [videoPlaybackError, setVideoPlaybackError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(storedState.success);
  const [framePreviewUrl, setFramePreviewUrl] = useState<string | null>(storedState.framePreviewUrl);
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number } | null>(
    storedState.videoDimensions,
  );
  const [draftPoints, setDraftPoints] = useState<Point[]>(storedState.draftPoints);
  const [polygonPoints, setPolygonPoints] = useState<Point[]>(storedState.polygonPoints);
  const frameRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    sessionStorage.setItem(
      VISION_SESSION_KEY,
      JSON.stringify({
        video,
        crowdLimit,
        cameraId,
        confidence,
        frameSkip,
        preset,
        modelName,
        success,
        framePreviewUrl,
        videoDimensions,
        draftPoints,
        polygonPoints,
        activeJobId,
        activeJob,
      } satisfies StoredVisionState),
    );
  }, [video, crowdLimit, cameraId, confidence, frameSkip, preset, modelName, success, framePreviewUrl, videoDimensions, draftPoints, polygonPoints, activeJobId, activeJob]);

  const loadLatestVideo = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getLatestProcessedVideo();
      setVideo(data.video);
    } catch (error) {
      setError(getErrorMessage(error, 'Failed to load processed video'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLatestVideo();
  }, []);

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const data = await getVisionOptions();
        setModelOptions(data.models);
        setPresetOptions(data.presets);
        setModelName((current) => current || data.default_model);
      } catch {
        // Keep defaults when options are unavailable.
      }
    };

    void loadOptions();
  }, []);

  useEffect(() => {
    setVideoPlaybackError(false);
  }, [video?.video_url]);

  useEffect(() => {
    if (!selectedFile) {
      return undefined;
    }

    let cancelled = false;
    const objectUrl = URL.createObjectURL(selectedFile);
    const videoElement = document.createElement('video');
    videoElement.src = objectUrl;
    videoElement.muted = true;
    videoElement.playsInline = true;
    videoElement.preload = 'metadata';
    videoElement.crossOrigin = 'anonymous';

    const captureFrame = () => {
      if (cancelled) return;

      const width = videoElement.videoWidth || 1280;
      const height = videoElement.videoHeight || 720;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');

      if (!context) {
        setError('Unable to prepare the frame preview for polygon drawing.');
        return;
      }

      context.drawImage(videoElement, 0, 0, width, height);
      setFramePreviewUrl(canvas.toDataURL('image/jpeg', 0.92));
      setVideoDimensions({ width, height });
      setDraftPoints([]);
      setPolygonPoints([]);
      setError(null);
    };

    const handleLoadedMetadata = () => {
      const seekTarget = Number.isFinite(videoElement.duration) && videoElement.duration > 0.15 ? 0.15 : 0;
      try {
        videoElement.currentTime = seekTarget;
      } catch {
        captureFrame();
      }
    };

    const handleSeeked = () => {
      captureFrame();
    };

    const handleError = () => {
      if (!cancelled) {
        setError('Unable to read the uploaded video preview.');
      }
    };

    videoElement.addEventListener('loadedmetadata', handleLoadedMetadata);
    videoElement.addEventListener('seeked', handleSeeked);
    videoElement.addEventListener('error', handleError);
    videoElement.load();

    return () => {
      cancelled = true;
      videoElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
      videoElement.removeEventListener('seeked', handleSeeked);
      videoElement.removeEventListener('error', handleError);
      URL.revokeObjectURL(objectUrl);
    };
  }, [selectedFile]);

  useEffect(() => {
    if (!activeJobId) {
      return undefined;
    }

    let socket: WebSocket | null = null;
    let closedByEffect = false;
    let pollingInterval: number | null = null;
    let isUsingPolling = false;

    const applyJobUpdate = (job: VisionJob) => {
      setActiveJob(job);
      setProcessing(job.status === 'queued' || job.status === 'processing');

      if (job.status === 'completed') {
        setVideo(job.video);
        setSuccess(
          job.alert_created
            ? 'Live crowd detection finished and threshold alerts were pushed to the dashboard.'
            : 'Live crowd detection finished successfully.',
        );
      }

      if (job.status === 'failed') {
        setError(job.error || 'Vision processing failed.');
      }
    };

    const startPollingFallback = () => {
      if (isUsingPolling) {
        return;
      }
      isUsingPolling = true;

      const pollJob = async () => {
        try {
          const job = await getVisionJob(activeJobId);
          applyJobUpdate(job);

          if (job.status === 'completed' || job.status === 'failed') {
            if (pollingInterval !== null) {
              window.clearInterval(pollingInterval);
              pollingInterval = null;
            }
          }
        } catch (error) {
          setError(getErrorMessage(error, 'Failed to fetch live job status'));
        }
      };

      void pollJob();
      pollingInterval = window.setInterval(() => {
        void pollJob();
      }, VISION_POLL_MS);
    };

    const connect = () => {
      socket = new WebSocket(`${VISION_WS_BASE}/${activeJobId}/stream`);

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data) as
          | { type: 'job_update'; job: VisionJob }
          | { type: 'job_missing'; job_id: string };

        if (data.type === 'job_missing') {
          setProcessing(false);
          setError('The active vision job is no longer available.');
          return;
        }

        applyJobUpdate(data.job);
      };

      socket.onclose = () => {
        if (closedByEffect || !activeJobId) {
          return;
        }
        startPollingFallback();
      };

      socket.onerror = () => {
        socket?.close();
        startPollingFallback();
      };
    };

    connect();

    return () => {
      closedByEffect = true;
      if (pollingInterval !== null) {
        window.clearInterval(pollingInterval);
      }
      socket?.close();
    };
  }, [activeJobId]);

  const handleFrameClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!videoDimensions || polygonPoints.length >= 3 || !frameRef.current) {
      return;
    }

    const rect = frameRef.current.getBoundingClientRect();
    const relativeX = (event.clientX - rect.left) / rect.width;
    const relativeY = (event.clientY - rect.top) / rect.height;
    const x = Math.round(relativeX * videoDimensions.width);
    const y = Math.round(relativeY * videoDimensions.height);

    setDraftPoints((current) => {
      if (current.length >= 3) {
        const firstPoint = current[0];
        const distance = Math.hypot(firstPoint.x - x, firstPoint.y - y);
        if (distance <= POLYGON_CLOSE_THRESHOLD) {
          setPolygonPoints(current);
          setError(null);
          return current;
        }
      }
      return [...current, { x, y }];
    });
  };

  const finalizePolygon = () => {
    if (draftPoints.length < 3) {
      setError('Add at least 3 points to create a polygon.');
      return;
    }
    setPolygonPoints(draftPoints);
    setError(null);
  };

  const resetPolygon = () => {
    setDraftPoints([]);
    setPolygonPoints([]);
    setError(null);
  };

  const removeLastPoint = () => {
    setDraftPoints((current) => current.slice(0, -1));
  };

  const clearSelection = () => {
    setSelectedFile(null);
    setFramePreviewUrl(null);
    setVideoDimensions(null);
    setDraftPoints([]);
    setPolygonPoints([]);
    setError(null);
    setSuccess(null);
  };

  const activePolygon = polygonPoints.length >= 3 ? polygonPoints : draftPoints;
  const polygonPath = useMemo(
    () => activePolygon.map((point) => `${point.x},${point.y}`).join(' '),
    [activePolygon],
  );
  const presetSummary = presetOptions.find((item) => item.id === preset);
  const qualityAssessment = activeJob?.quality_assessment;
  const issueLabels: Record<string, string> = {
    low_resolution: 'Low resolution',
    low_light: 'Low light',
    dim: 'Dim lighting',
    blurry: 'Blur detected',
    high_fps: 'High FPS input',
    unreadable_video: 'Unreadable video',
  };

  const handleProcess = async () => {
    if (!selectedFile) return;

    setProcessing(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await startVisionProcessingJob({
        file: selectedFile,
        crowdLimit,
        cameraId,
        confidence,
        frameSkip,
        preset,
        modelName,
        polygons: polygonPoints.length >= 3 ? [polygonPoints.map((point) => [point.x, point.y])] : undefined,
      });

      setActiveJobId(response.job_id);
      setActiveJob({
        job_id: response.job_id,
        status: 'queued',
        message: response.message,
        source_filename: selectedFile.name,
        camera_id: cameraId,
        crowd_limit: crowdLimit,
        preview_image_url: null,
        video: null,
        csv_log: null,
        snapshots: [],
        polygons_used: polygonPoints.length >= 3 ? [polygonPoints.map((point) => [point.x, point.y])] : [],
        quality_assessment: null,
        processing_profile: {
          preset,
          confidence,
          frame_skip: frameSkip,
          preprocess_mode: preset === 'fast' ? 'off' : 'auto',
          model_name: modelName,
        },
        progress: {
          total_frames: 0,
          processed_frames: 0,
          max_count: 0,
        },
        event: null,
        alert_created: false,
        error: null,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        finished_at: null,
      });
      setSelectedFile(null);
    } catch (error) {
      setProcessing(false);
      setError(getErrorMessage(error, 'Failed to start live crowd detection'));
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <span className="eyebrow">Vision</span>
          <h2>Crowd detection pipeline</h2>
          <p>Upload, mark the zone, watch the run live, and review snapshots and final output in one place.</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {success && <div className="success-banner">{success}</div>}
      {qualityAssessment && qualityAssessment.reliability !== 'high' ? (
        <div className="warning-banner">
          {qualityAssessment.message}
          {qualityAssessment.issues.length
            ? ` Issues: ${qualityAssessment.issues.map((issue) => issueLabels[issue] || issue).join(', ')}.`
            : ''}
        </div>
      ) : null}

      <section className="panel vision-command-panel">
        <div className="vision-command-grid">
          <div className="vision-command-copy">
            <span className="eyebrow">Live workflow</span>
            <h3>Draw once, monitor the run, and review the output without leaving the page.</h3>
          </div>

          <div className="vision-command-metrics">
            <article className="vision-command-chip">
              <span>Current mode</span>
              <strong>{activeJob ? 'Live job active' : 'Ready to start'}</strong>
            </article>
            <article className="vision-command-chip">
              <span>Polygon</span>
              <strong>{polygonPoints.length >= 3 ? 'Locked custom area' : 'Optional region'}</strong>
            </article>
            <article className="vision-command-chip">
              <span>Snapshots</span>
              <strong>{activeJob?.snapshots.length ?? 0}</strong>
            </article>
            <article className="vision-command-chip">
              <span>Reliability</span>
              <strong>{qualityAssessment?.reliability ?? 'Pending'}</strong>
            </article>
          </div>
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="panel vision-panel-strong">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Run detection</span>
              <h3>Source and detector settings</h3>
            </div>
          </div>

          <div className="stack-form">
            <label>
              Source video
              <input
                type="file"
                accept="video/mp4,video/webm,video/quicktime,video/x-msvideo,video/x-matroska,.mp4,.webm,.mov,.avi,.mkv"
                onChange={(event) => {
                  setSelectedFile(event.target.files?.[0] ?? null);
                  setSuccess(null);
                }}
              />
            </label>

            <label>
              Camera ID
              <input value={cameraId} onChange={(event) => setCameraId(event.target.value)} />
            </label>

            <label>
              Crowd limit
              <input
                type="number"
                min={1}
                value={crowdLimit}
                onChange={(event) => setCrowdLimit(Number(event.target.value))}
              />
            </label>

            <label>
              Detection preset
              <select value={preset} onChange={(event) => setPreset(event.target.value)}>
                {presetOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Model
              <select value={modelName} onChange={(event) => setModelName(event.target.value)}>
                {modelOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label} ({option.size_mb} MB)
                  </option>
                ))}
              </select>
            </label>

            <label>
              Confidence
              <input
                type="number"
                min={0.05}
                max={1}
                step={0.05}
                value={confidence}
                onChange={(event) => setConfidence(Number(event.target.value))}
              />
            </label>

            <label>
              Frame skip
              <input
                type="number"
                min={1}
                value={frameSkip}
                onChange={(event) => setFrameSkip(Number(event.target.value))}
              />
            </label>

            {presetSummary ? (
              <div className="vision-note-card">
                <strong>{presetSummary.label} preset</strong>
                <p>{presetSummary.description}</p>
              </div>
            ) : null}

            <button onClick={handleProcess} disabled={!selectedFile || processing}>
              {processing ? 'Detection running live...' : 'Run crowd detection'}
            </button>

            {selectedFile ? (
              <button type="button" className="button-secondary" onClick={clearSelection}>
                Clear selected video
              </button>
            ) : null}
          </div>
        </section>

        <section className="panel vision-panel-strong">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Polygon setup</span>
              <h3>Draw the monitored area</h3>
            </div>
          </div>

          {framePreviewUrl && videoDimensions ? (
            <>
              <div
                className={`polygon-stage${polygonPoints.length >= 3 ? ' polygon-locked' : ''}`}
                onClick={handleFrameClick}
                ref={frameRef}
                role="presentation"
              >
                <img src={framePreviewUrl} alt="Video frame preview for polygon drawing" />
                <svg
                  className="polygon-overlay"
                  viewBox={`0 0 ${videoDimensions.width} ${videoDimensions.height}`}
                  preserveAspectRatio="none"
                >
                  {activePolygon.length >= 2 ? (
                    <polyline points={polygonPath} className="polygon-line" fill="none" />
                  ) : null}
                  {polygonPoints.length >= 3 ? (
                    <polygon points={polygonPath} className="polygon-shape" />
                  ) : null}
                  {activePolygon.map((point, index) => (
                    <g key={`${point.x}-${point.y}-${index}`}>
                      <circle cx={point.x} cy={point.y} r="10" className="polygon-point" />
                      <text x={point.x + 12} y={point.y - 12} className="polygon-label">
                        {index + 1}
                      </text>
                    </g>
                  ))}
                </svg>
              </div>

              <div className="vision-polygon-toolbar">
                <button
                  type="button"
                  className="button-secondary"
                  onClick={finalizePolygon}
                  disabled={draftPoints.length < 3 || polygonPoints.length >= 3}
                >
                  Complete polygon
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={removeLastPoint}
                  disabled={draftPoints.length === 0 || polygonPoints.length >= 3}
                >
                  Undo last point
                </button>
                <button type="button" className="button-secondary" onClick={resetPolygon}>
                  Reset polygon
                </button>
              </div>

              <div className="vision-polygon-status">
                <div className="vision-note-card">
                  <strong>Frame size</strong>
                  <p>
                    {videoDimensions.width} x {videoDimensions.height}
                  </p>
                </div>
                <div className="vision-note-card">
                  <strong>Points placed</strong>
                  <p>{activePolygon.length}</p>
                </div>
                <div className="vision-note-card">
                  <strong>Detection area</strong>
                  <p>
                    {polygonPoints.length >= 3
                      ? 'Custom polygon locked in'
                      : draftPoints.length >= 3
                        ? 'Click near point 1 to auto-close'
                        : 'Full frame if not completed'}
                  </p>
                </div>
                <div className="vision-note-card">
                  <strong>Model mode</strong>
                  <p>{modelName || 'Default detector'}</p>
                </div>
              </div>
            </>
          ) : (
            <div className="empty-state">
              Upload a video first and the first usable frame will appear here so you can draw the polygon.
            </div>
          )}
        </section>
      </div>

      <div className="dashboard-grid">
        <section className="panel vision-panel-strong">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Live run</span>
              <h3>Processing stream</h3>
            </div>
          </div>

          {activeJob ? (
            <div className="vision-preview-fallback">
              {activeJob.preview_image_url ? (
                <img
                  className="vision-preview-image"
                  src={`${API_BASE}${activeJob.preview_image_url}?t=${encodeURIComponent(activeJob.updated_at)}`}
                  alt="Live crowd-detection frame"
                />
              ) : (
                <div className="empty-state">Waiting for the first processed frame...</div>
              )}

              <div className="vision-meta">
                <div className="vision-meta-chip">
                  <span>Status</span>
                  <strong>{activeJob.status}</strong>
                </div>
                <div className="vision-meta-chip">
                  <span>Processed frames</span>
                  <strong>
                    {activeJob.progress.processed_frames} / {Math.max(activeJob.progress.total_frames, 0)}
                  </strong>
                </div>
                <div className="vision-meta-chip">
                  <span>Max count</span>
                  <strong>{activeJob.progress.max_count}</strong>
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              Start a crowd-detection run and the backend will stream live annotated frames here.
            </div>
          )}
        </section>

        <section className="panel vision-panel-strong">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Run summary</span>
              <h3>Current job output</h3>
            </div>
          </div>

          {activeJob ? (
            <div className="vision-notes">
              <div className="vision-note-card">
                <strong>Job message</strong>
                <p>{activeJob.message}</p>
              </div>
              <div className="vision-note-card">
                <strong>Snapshots saved</strong>
                <p>{activeJob.snapshots.length}</p>
              </div>
              <div className="vision-note-card">
                <strong>Live alerts</strong>
                <p>{activeJob.alert_created ? 'Threshold hit and alert emitted' : 'No alert yet'}</p>
              </div>
              <div className="vision-note-card">
                <strong>Polygon mode</strong>
                <p>{activeJob.polygons_used.length ? 'Custom region used' : 'Full frame used'}</p>
              </div>
              <div className="vision-note-card">
                <strong>Reliability score</strong>
                <p>{qualityAssessment ? `${qualityAssessment.reliability_score}/100` : 'Pending analysis'}</p>
              </div>
              <div className="vision-note-card">
                <strong>Resolved profile</strong>
                <p>
                  {activeJob.processing_profile
                    ? `${activeJob.processing_profile.preset} · ${activeJob.processing_profile.model_name} · skip ${activeJob.processing_profile.frame_skip}`
                    : 'Pending'}
                </p>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              Start a run and the current job summary will appear here.
            </div>
          )}
        </section>
      </div>

      <section className="panel vision-panel-strong">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Snapshots</span>
            <h3>Captured crowd-alert frames</h3>
          </div>
        </div>

        {activeJob?.snapshots?.length ? (
          <div className="dashboard-snapshot-strip">
            {activeJob.snapshots.map((snapshot) => (
              <article key={snapshot} className="snapshot-tile">
                <img src={`${API_BASE}${snapshot}`} alt="Crowd detection snapshot" />
                <div>
                  <strong>Alert capture</strong>
                  <p>Saved live during threshold breach</p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            Snapshots will appear here as soon as the live detector captures an overcrowding frame.
          </div>
        )}
      </section>

      <section className="panel vision-player-panel vision-panel-strong">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Preview</span>
            <h3>Latest processed crowd-detection output</h3>
            <p>Review the final annotated output once the live run finishes.</p>
          </div>
          <button className="button-secondary" onClick={loadLatestVideo} disabled={loading || processing}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {loading ? (
          <div className="empty-state">Loading latest processed video...</div>
        ) : video ? (
          <div className="vision-player-wrap">
            {!videoPlaybackError ? (
              <video
                className="vision-player"
                controls
                preload="metadata"
                poster={video.thumbnail_url ? `${API_BASE}${video.thumbnail_url}` : undefined}
                src={`${API_BASE}${video.video_url}`}
                onError={() => setVideoPlaybackError(true)}
              />
            ) : video.thumbnail_url ? (
              <div className="vision-preview-fallback">
                <img
                  className="vision-preview-image"
                  src={`${API_BASE}${video.thumbnail_url}`}
                  alt="Preview frame from processed crowd-detection video"
                />
                <div className="vision-preview-note">
                  <strong>Video preview fallback</strong>
                  <p>
                    Your browser could not play this processed codec directly, so a saved preview
                    frame is shown here instead.
                  </p>
                  <a className="text-link" href={`${API_BASE}${video.video_url}`} target="_blank" rel="noreferrer">
                    Open processed video in a new tab
                  </a>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                The processed video was generated, but this browser could not render it inline.
              </div>
            )}

            <div className="vision-meta">
              <div className="vision-meta-chip">
                <span>File</span>
                <strong>{video.filename}</strong>
              </div>
              <div className="vision-meta-chip">
                <span>Uploaded</span>
                <strong>{new Date(video.uploaded_at).toLocaleString()}</strong>
              </div>
              <div className="vision-meta-chip">
                <span>Size</span>
                <strong>{Math.max(1, Math.round(video.size_bytes / 1024 / 1024))} MB</strong>
              </div>
            </div>
          </div>
        ) : (
          <div className="empty-state">
            No processed crowd-detection video available yet. Run the detector above to generate one.
          </div>
        )}
      </section>
    </div>
  );
}
