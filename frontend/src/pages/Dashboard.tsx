import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

import Loader from "../components/common/Loader";
import { useAuth } from "../hooks/useAuth";
import api from "../services/api";
import { connectAttendanceSocket } from "../services/attendanceSocket";
import type { Attendance } from "../types/Attendance";
import type { AttendanceRealtimeEvent } from "../types/AttendanceRealtimeEvent";
import type { Student } from "../types/Student";
import { formatDate, getTodayIsoDate } from "../utils/dateUtils";

interface AttendanceSummary {
  date: string;
  present: number;
  absent: number;
  total: number;
}

interface DashboardAttendance extends Attendance {
  createdAt?: string;
}

interface RecentAttendanceItem {
  key: string;
  studentId: number;
  studentName: string;
  date: string;
  entryTime: string;
  formattedTime: string;
  markedBy: string;
}

interface LiveCameraInfo {
  cameraKey: string;
  source: string;
  online: boolean;
  updatedAt?: string | null;
  streamPath?: string;
}

interface LiveCameraResponse {
  cameras?: LiveCameraInfo[];
  message?: string;
}

type CameraSourceMethod = "device-index" | "rtsp-url" | "http-url" | "custom";

interface CameraMethodOption {
  value: CameraSourceMethod;
  label: string;
  placeholder: string;
  hint: string;
  example: string;
}

const DEFAULT_AI_STREAM_URL = "http://localhost:5000/api/live/stream";
const DEFAULT_AI_BASE_URL = "http://localhost:5000";
const MAX_RECENT_ENTRIES = 10;
const TOAST_HIDE_DELAY_MS = 2400;
const TOAST_REMOVE_DELAY_MS = 3000;
const CAMERA_METHOD_OPTIONS: CameraMethodOption[] = [
  {
    value: "rtsp-url",
    label: "RTSP URL",
    placeholder: "rtsp://username:password@192.168.1.50:554/stream1",
    hint: "Use for IP/NVR cameras on your network.",
    example: "rtsp://admin:pass@192.168.1.50:554/stream1",
  },
  {
    value: "http-url",
    label: "HTTP/MJPEG URL",
    placeholder: "http://192.168.1.60:8080/video",
    hint: "Use for cameras that expose an HTTP stream endpoint.",
    example: "http://192.168.1.60:8080/video",
  },
  {
    value: "device-index",
    label: "Device ID (USB)",
    placeholder: "1",
    hint: "Numeric camera index on the AI-service machine (0/1/2...).",
    example: "1",
  },
  {
    value: "custom",
    label: "Custom Source",
    placeholder: "Add any source string supported by OpenCV",
    hint: "Use this when your source format does not match the presets.",
    example: "rtmp://10.0.0.22/live/cam-a",
  },
];

const cardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: "0.5rem",
  padding: "1rem",
  background: "#ffffff",
};

const DashboardPage = () => {
  const { user } = useAuth();
  const role = (user?.role ?? "").toUpperCase();
  const isAdmin = role === "ADMIN";
  const canViewLiveCamera = role === "ADMIN" || role === "COORDINATOR" || role === "TEACHER";
  const liveFeedFeatureEnabled = String(import.meta.env.VITE_ENABLE_LIVE_FEED ?? "true").toLowerCase() === "true";

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [socketError, setSocketError] = useState<string | null>(null);
  const [isLiveEnabled, setIsLiveEnabled] = useState(false);
  const [streamVersion, setStreamVersion] = useState(0);
  const [totalStudents, setTotalStudents] = useState(0);
  const [summary, setSummary] = useState<AttendanceSummary>({
    date: getTodayIsoDate(),
    present: 0,
    absent: 0,
    total: 0,
  });
  const [recentAttendance, setRecentAttendance] = useState<RecentAttendanceItem[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [cameras, setCameras] = useState<LiveCameraInfo[]>([]);
  const [selectedCameraKey, setSelectedCameraKey] = useState<string | null>(null);
  const [cameraSourceMethod, setCameraSourceMethod] = useState<CameraSourceMethod>("rtsp-url");
  const [cameraInput, setCameraInput] = useState("");
  const [cameraUpdateMessage, setCameraUpdateMessage] = useState<string | null>(null);
  const [cameraUpdateError, setCameraUpdateError] = useState<string | null>(null);
  const [isCameraUpdating, setIsCameraUpdating] = useState(false);

  const toastHideTimerRef = useRef<number | null>(null);
  const toastRemoveTimerRef = useRef<number | null>(null);

  const aiStreamUrl = useMemo(() => {
    const directUrl = String(import.meta.env.VITE_AI_STREAM_URL ?? "").trim();
    if (directUrl) {
      return directUrl;
    }

    const baseUrl = String(import.meta.env.VITE_AI_STREAM_BASE_URL ?? "").trim();
    if (baseUrl) {
      return `${baseUrl.replace(/\/+$/g, "")}/api/live/stream`;
    }

    return DEFAULT_AI_STREAM_URL;
  }, []);

  const aiBaseUrl = useMemo(() => {
    const envBase = String(import.meta.env.VITE_AI_STREAM_BASE_URL ?? "").trim();
    if (envBase) {
      return envBase.replace(/\/+$/g, "");
    }

    const streamWithoutQuery = aiStreamUrl.split("?")[0] ?? aiStreamUrl;
    const marker = "/api/live/stream";
    const markerIndex = streamWithoutQuery.indexOf(marker);
    if (markerIndex > 0) {
      return streamWithoutQuery.slice(0, markerIndex).replace(/\/+$/g, "");
    }
    return DEFAULT_AI_BASE_URL;
  }, [aiStreamUrl]);

  const cameraApiUrl = useMemo(() => `${aiBaseUrl}/api/live/cameras`, [aiBaseUrl]);
  const selectedCameraMethod = useMemo(
    () => CAMERA_METHOD_OPTIONS.find((option) => option.value === cameraSourceMethod) ?? CAMERA_METHOD_OPTIONS[0],
    [cameraSourceMethod],
  );

  const selectedStreamUrl = useMemo(() => {
    if (!selectedCameraKey) {
      return aiStreamUrl;
    }
    return `${aiBaseUrl}/api/live/stream/${encodeURIComponent(selectedCameraKey)}`;
  }, [aiBaseUrl, aiStreamUrl, selectedCameraKey]);

  const streamSrc = useMemo(() => {
    const separator = selectedStreamUrl.includes("?") ? "&" : "?";
    return `${selectedStreamUrl}${separator}v=${streamVersion}`;
  }, [selectedStreamUrl, streamVersion]);

  const attendancePercentage = useMemo(() => {
    if (summary.total <= 0) {
      return 0;
    }
    return Math.round((summary.present / summary.total) * 100);
  }, [summary.present, summary.total]);

  const clearToastTimers = useCallback(() => {
    if (toastHideTimerRef.current !== null) {
      window.clearTimeout(toastHideTimerRef.current);
      toastHideTimerRef.current = null;
    }
    if (toastRemoveTimerRef.current !== null) {
      window.clearTimeout(toastRemoveTimerRef.current);
      toastRemoveTimerRef.current = null;
    }
  }, []);

  const showToast = useCallback(
    (message: string) => {
      clearToastTimers();
      setToastMessage(message);
      setToastVisible(true);
      toastHideTimerRef.current = window.setTimeout(() => {
        setToastVisible(false);
      }, TOAST_HIDE_DELAY_MS);
      toastRemoveTimerRef.current = window.setTimeout(() => {
        setToastMessage(null);
      }, TOAST_REMOVE_DELAY_MS);
    },
    [clearToastTimers],
  );

  const fetchDashboardData = useCallback(async () => {
    const today = getTodayIsoDate();
    setIsLoading(true);
    setError(null);

    try {
      const [studentsResponse, summaryResponse, attendanceResponse] = await Promise.all([
        api.get<Student[]>("/api/students"),
        api.get<AttendanceSummary>("/api/attendance/summary", { params: { date: today } }),
        api.get<DashboardAttendance[]>("/api/attendance", { params: { date: today } }),
      ]);

      setTotalStudents(studentsResponse.data.length);
      setSummary(summaryResponse.data);

      const studentNameById = new Map<number, string>();
      for (const student of studentsResponse.data) {
        studentNameById.set(student.id, buildStudentName(student));
      }

      const sortedRecent = [...attendanceResponse.data].sort((a, b) => {
        const first = normalizeEntryTime(a.entryTime, a.date);
        const second = normalizeEntryTime(b.entryTime, b.date);
        return second.localeCompare(first);
      });

      const mapped = sortedRecent
        .map((record) => toRecentAttendanceFromApi(record, studentNameById))
        .filter((item): item is RecentAttendanceItem => item !== null)
        .slice(0, MAX_RECENT_ENTRIES);

      setRecentAttendance(mapped);
      setSocketError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard data.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadCameras = useCallback(async () => {
    if (!canViewLiveCamera || !liveFeedFeatureEnabled) {
      return;
    }

    try {
      const response = await fetch(cameraApiUrl);
      if (!response.ok) {
        throw new Error(`status ${response.status}`);
      }
      const payload: LiveCameraResponse = (await response.json()) as LiveCameraResponse;
      const cameraList = Array.isArray(payload.cameras) ? payload.cameras : [];
      setCameras(cameraList);
      setSelectedCameraKey((current) => {
        if (current && cameraList.some((camera) => camera.cameraKey === current)) {
          return current;
        }
        return cameraList[0]?.cameraKey ?? null;
      });
      setCameraUpdateError(null);
    } catch {
      setCameraUpdateError("Unable to fetch camera list from ai-service.");
    }
  }, [cameraApiUrl, canViewLiveCamera, liveFeedFeatureEnabled]);

  const updateCameras = useCallback(
    async (sources: string[]) => {
      setIsCameraUpdating(true);
      setCameraUpdateError(null);
      setCameraUpdateMessage(null);

      try {
        const response = await fetch(cameraApiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ sources }),
        });

        const payload: LiveCameraResponse = (await response.json()) as LiveCameraResponse;
        if (!response.ok) {
          throw new Error(payload.message || `status ${response.status}`);
        }

        const cameraList = Array.isArray(payload.cameras) ? payload.cameras : [];
        setCameras(cameraList);
        setSelectedCameraKey((current) => {
          if (current && cameraList.some((camera) => camera.cameraKey === current)) {
            return current;
          }
          return cameraList[0]?.cameraKey ?? null;
        });
        setCameraUpdateMessage(payload.message ?? "Camera list updated.");
      } catch (err) {
        setCameraUpdateError(err instanceof Error ? err.message : "Failed to update camera list.");
      } finally {
        setIsCameraUpdating(false);
      }
    },
    [cameraApiUrl],
  );

  useEffect(() => {
    void fetchDashboardData();
    return () => {
      clearToastTimers();
    };
  }, [fetchDashboardData, clearToastTimers]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const disconnect = connectAttendanceSocket(
      (event: AttendanceRealtimeEvent) => {
        const item = toRecentAttendanceFromRealtime(event);
        setRecentAttendance((current) => [item, ...current.filter((entry) => entry.key !== item.key)].slice(0, MAX_RECENT_ENTRIES));
        setSummary((current) => ({
          ...current,
          present: current.present + 1,
          absent: Math.max(current.absent - 1, 0),
        }));
        setSocketError(null);
        showToast(`${event.studentName} present at ${event.formattedTime}`);
      },
      (message: string) => {
        setSocketError(message);
      },
    );

    return () => {
      disconnect();
      clearToastTimers();
    };
  }, [user, showToast, clearToastTimers]);

  useEffect(() => {
    if (!canViewLiveCamera) {
      setIsLiveEnabled(false);
      setLiveError(null);
      return;
    }
    setIsLiveEnabled(false);
    setLiveError(null);
    void loadCameras();
  }, [canViewLiveCamera, liveFeedFeatureEnabled, loadCameras]);

  const handleStartLive = () => {
    setLiveError(null);
    setIsLiveEnabled(true);
    setStreamVersion((previous) => previous + 1);
  };

  const handleStopLive = () => {
    setLiveError(null);
    setIsLiveEnabled(false);
  };

  const toNormalizedCameraSource = useCallback((method: CameraSourceMethod, rawValue: string): string => {
    const value = rawValue.trim();
    if (!value) {
      throw new Error("Enter a camera source value.");
    }

    switch (method) {
      case "device-index":
        if (!/^\d+$/.test(value)) {
          throw new Error("Device ID must be a non-negative number (example: 1).");
        }
        return String(Number.parseInt(value, 10));
      case "rtsp-url":
        if (!/^rtsps?:\/\//i.test(value)) {
          throw new Error("RTSP URL must start with rtsp:// or rtsps://.");
        }
        return value;
      case "http-url":
        if (!/^https?:\/\//i.test(value)) {
          throw new Error("HTTP stream URL must start with http:// or https://.");
        }
        return value;
      case "custom":
      default:
        return value;
    }
  }, []);

  const handleAddCamera = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isAdmin) {
      return;
    }

    let sourceValue = "";
    try {
      sourceValue = toNormalizedCameraSource(cameraSourceMethod, cameraInput);
    } catch (err) {
      setCameraUpdateError(err instanceof Error ? err.message : "Invalid camera source.");
      return;
    }

    const existingSources = cameras.map((camera) => camera.source.trim().toLowerCase());
    if (existingSources.includes(sourceValue.toLowerCase())) {
      setCameraUpdateError("This camera source is already configured.");
      return;
    }

    const nextSources = [...cameras.map((camera) => camera.source), sourceValue];
    await updateCameras(nextSources);
    setCameraInput("");
  };

  const handleRemoveCamera = async (cameraKey: string) => {
    if (!isAdmin) {
      return;
    }
    if (cameras.length <= 1) {
      setCameraUpdateError("At least one camera source is required.");
      return;
    }

    const nextSources = cameras.filter((camera) => camera.cameraKey !== cameraKey).map((camera) => camera.source);
    await updateCameras(nextSources);
  };

  return (
    <section style={{ display: "grid", gap: "1rem" }}>
      {toastMessage && (
        <div
          style={{
            position: "fixed",
            top: "1rem",
            right: "1rem",
            zIndex: 1000,
            background: "#166534",
            color: "#ffffff",
            borderRadius: "0.5rem",
            padding: "0.65rem 0.85rem",
            boxShadow: "0 6px 18px rgba(22, 101, 52, 0.25)",
            opacity: toastVisible ? 1 : 0,
            transition: "opacity 0.35s ease",
          }}
        >
          {toastMessage}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0 }}>Dashboard</h2>
          <p style={{ margin: "0.35rem 0 0", color: "#4b5563" }}>
            Overview for {formatDate(summary.date || getTodayIsoDate())}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchDashboardData()}
          style={{
            border: "1px solid #d1d5db",
            borderRadius: "0.375rem",
            padding: "0.45rem 0.75rem",
            background: "#ffffff",
            cursor: "pointer",
          }}
        >
          Refresh
        </button>
      </div>

      {socketError && (
        <div
          style={{
            ...cardStyle,
            borderColor: "#fed7aa",
            color: "#9a3412",
            padding: "0.75rem 1rem",
          }}
        >
          Real-time attendance connection issue: {socketError}
        </div>
      )}

      {isLoading ? (
        <Loader label="Loading dashboard..." />
      ) : error ? (
        <div
          style={{
            ...cardStyle,
            borderColor: "#fecaca",
            color: "#b91c1c",
          }}
        >
          {error}
        </div>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gap: "1rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            }}
          >
            <article style={cardStyle}>
              <p style={{ margin: 0, color: "#6b7280" }}>Total Students</p>
              <h3 style={{ margin: "0.5rem 0 0", fontSize: "1.8rem" }}>{totalStudents}</h3>
            </article>

            <article style={cardStyle}>
              <p style={{ margin: 0, color: "#6b7280" }}>Today's Attendance</p>
              <h3 style={{ margin: "0.5rem 0 0", fontSize: "1.8rem" }}>{summary.total}</h3>
            </article>

            <article style={cardStyle}>
              <p style={{ margin: 0, color: "#6b7280" }}>Present</p>
              <h3 style={{ margin: "0.5rem 0 0", fontSize: "1.8rem", color: "#166534" }}>
                {summary.present}
              </h3>
            </article>

            <article style={cardStyle}>
              <p style={{ margin: 0, color: "#6b7280" }}>Absent</p>
              <h3 style={{ margin: "0.5rem 0 0", fontSize: "1.8rem", color: "#b91c1c" }}>
                {summary.absent}
              </h3>
            </article>
          </div>

          <section style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Attendance Trend</h3>
            <p style={{ marginTop: 0, color: "#6b7280" }}>
              Present ratio today: {attendancePercentage}%
            </p>
            <div
              style={{
                height: "14px",
                borderRadius: "999px",
                background: "#e5e7eb",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${attendancePercentage}%`,
                  background: "#16a34a",
                  height: "100%",
                }}
              />
            </div>
            <div style={{ marginTop: "0.5rem", color: "#4b5563", fontSize: "0.9rem" }}>
              {summary.present} present / {summary.absent} absent
            </div>
          </section>

          <section style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Live Camera Feed</h3>
            {canViewLiveCamera ? (
              <>
                {liveFeedFeatureEnabled ? (
                  <>
                    <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={handleStartLive}
                        disabled={isLiveEnabled}
                        style={{
                          border: "none",
                          borderRadius: "0.375rem",
                          padding: "0.45rem 0.75rem",
                          background: "#16a34a",
                          color: "#ffffff",
                          cursor: isLiveEnabled ? "not-allowed" : "pointer",
                          opacity: isLiveEnabled ? 0.7 : 1,
                        }}
                      >
                        Start Live Feed
                      </button>
                      <button
                        type="button"
                        onClick={handleStopLive}
                        disabled={!isLiveEnabled}
                        style={{
                          border: "none",
                          borderRadius: "0.375rem",
                          padding: "0.45rem 0.75rem",
                          background: "#dc2626",
                          color: "#ffffff",
                          cursor: !isLiveEnabled ? "not-allowed" : "pointer",
                          opacity: !isLiveEnabled ? 0.7 : 1,
                        }}
                      >
                        Stop Live Feed
                      </button>
                      <button type="button" onClick={() => void loadCameras()} style={secondaryButtonStyle}>
                        Refresh Cameras
                      </button>
                    </div>

                    {cameras.length > 0 && (
                      <div style={{ marginBottom: "0.75rem", display: "grid", gap: "0.5rem" }}>
                        <label htmlFor="camera-select" style={{ color: "#374151", fontSize: "0.9rem", fontWeight: 600 }}>
                          Selected Camera
                        </label>
                        <select
                          id="camera-select"
                          value={selectedCameraKey ?? ""}
                          onChange={(event) => setSelectedCameraKey(event.target.value || null)}
                          style={{
                            width: "100%",
                            maxWidth: "380px",
                            padding: "0.5rem",
                            borderRadius: "0.375rem",
                            border: "1px solid #d1d5db",
                            background: "#ffffff",
                          }}
                        >
                          {cameras.map((camera) => (
                            <option key={camera.cameraKey} value={camera.cameraKey}>
                              {camera.source} {camera.online ? "(online)" : "(reconnecting)"}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {isAdmin && (
                      <div
                        style={{
                          border: "1px solid #e5e7eb",
                          borderRadius: "0.5rem",
                          padding: "0.75rem",
                          background: "#f9fafb",
                          marginBottom: "0.75rem",
                        }}
                      >
                        <h4 style={{ margin: "0 0 0.5rem", fontSize: "1rem" }}>Admin Camera Manager</h4>
                        <div style={{ display: "grid", gap: "0.35rem", marginBottom: "0.65rem" }}>
                          <label htmlFor="camera-add-method" style={{ color: "#374151", fontSize: "0.85rem", fontWeight: 600 }}>
                            Add Method
                          </label>
                          <select
                            id="camera-add-method"
                            value={cameraSourceMethod}
                            onChange={(event) => {
                              setCameraSourceMethod(event.target.value as CameraSourceMethod);
                              setCameraInput("");
                              setCameraUpdateError(null);
                              setCameraUpdateMessage(null);
                            }}
                            style={{
                              width: "100%",
                              maxWidth: "260px",
                              padding: "0.5rem",
                              borderRadius: "0.375rem",
                              border: "1px solid #d1d5db",
                              background: "#ffffff",
                            }}
                          >
                            {CAMERA_METHOD_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <p style={{ margin: 0, color: "#4b5563", fontSize: "0.85rem" }}>{selectedCameraMethod.hint}</p>
                          <p style={{ margin: 0, color: "#6b7280", fontSize: "0.82rem" }}>
                            Example:{" "}
                            <code style={{ color: "#111827", background: "#e5e7eb", borderRadius: "0.25rem", padding: "0.1rem 0.25rem" }}>
                              {selectedCameraMethod.example}
                            </code>
                          </p>
                        </div>
                        <form onSubmit={handleAddCamera} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                          <input
                            value={cameraInput}
                            onChange={(event) => setCameraInput(event.target.value)}
                            placeholder={selectedCameraMethod.placeholder}
                            style={{
                              flex: "1 1 260px",
                              minWidth: "220px",
                              padding: "0.5rem",
                              borderRadius: "0.375rem",
                              border: "1px solid #d1d5db",
                            }}
                          />
                          <button type="submit" disabled={isCameraUpdating} style={secondaryButtonStyle}>
                            {isCameraUpdating ? "Saving..." : "Add Camera"}
                          </button>
                        </form>
                        <p style={{ margin: "0.55rem 0 0", color: "#4b5563", fontSize: "0.82rem" }}>
                          Browser laptop camera permission is not required here. This only updates AI-service camera sources.
                        </p>
                        {cameras.length > 0 && (
                          <div style={{ marginTop: "0.75rem", display: "grid", gap: "0.45rem" }}>
                            {cameras.map((camera) => (
                              <div
                                key={camera.cameraKey}
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  gap: "0.75rem",
                                  border: "1px solid #e5e7eb",
                                  borderRadius: "0.4rem",
                                  padding: "0.45rem 0.6rem",
                                  background: "#ffffff",
                                }}
                              >
                                <span style={{ color: "#374151", fontSize: "0.9rem" }}>
                                  {camera.source} ({camera.online ? "online" : "reconnecting"})
                                </span>
                                <button
                                  type="button"
                                  onClick={() => void handleRemoveCamera(camera.cameraKey)}
                                  disabled={isCameraUpdating || cameras.length <= 1}
                                  style={{
                                    border: "none",
                                    borderRadius: "0.35rem",
                                    padding: "0.35rem 0.55rem",
                                    background: "#ef4444",
                                    color: "#ffffff",
                                    cursor: "pointer",
                                    opacity: isCameraUpdating || cameras.length <= 1 ? 0.65 : 1,
                                  }}
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {isLiveEnabled ? (
                      <div
                        style={{
                          position: "relative",
                          width: "100%",
                          borderRadius: "0.5rem",
                          overflow: "hidden",
                          background: "#111827",
                        }}
                      >
                        <img
                          src={streamSrc}
                          alt="Live AI camera stream"
                          style={{ width: "100%", display: "block" }}
                          onLoad={() => setLiveError(null)}
                          onError={() =>
                            setLiveError(
                              "AI live stream unavailable. Start ai-service on host and verify CAMERA_ID/CAMERA_IDS/BACKEND_API_KEY.",
                            )
                          }
                        />
                      </div>
                    ) : (
                      <p style={{ marginBottom: 0, color: "#4b5563" }}>
                        Live camera feed is stopped by default to keep laptop load low. Click "Start Live Feed" only when needed.
                      </p>
                    )}
                  </>
                ) : (
                  <div
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: "0.5rem",
                      padding: "0.75rem",
                      background: "#f9fafb",
                    }}
                  >
                    <p style={{ margin: 0, color: "#374151" }}>
                      Lightweight mode enabled. Live preview is off to keep app fast.
                    </p>
                    <p style={{ margin: "0.4rem 0 0", color: "#4b5563" }}>
                      Attendance still auto-marks in background when AI service recognizes faces.
                    </p>
                  </div>
                )}

                <p style={{ marginBottom: 0, color: "#4b5563" }}>
                  Attendance updates are pushed instantly via WebSocket. No polling is used.
                </p>
                {cameraUpdateMessage && <p style={{ marginBottom: 0, color: "#166534" }}>{cameraUpdateMessage}</p>}
                {cameraUpdateError && <p style={{ marginBottom: 0, color: "#b91c1c" }}>{cameraUpdateError}</p>}
                {liveError && <p style={{ marginBottom: 0, color: "#b91c1c" }}>{liveError}</p>}
              </>
            ) : (
              <p style={{ marginBottom: 0, color: "#4b5563" }}>
                Live camera access is available for admin, coordinator, and teacher accounts.
              </p>
            )}
          </section>

          <section style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Recent Attendance</h3>
            {recentAttendance.length === 0 ? (
              <p style={{ marginBottom: 0, color: "#6b7280" }}>No attendance records for today.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                      <th style={{ padding: "0.6rem 0.4rem" }}>Student ID</th>
                      <th style={{ padding: "0.6rem 0.4rem" }}>Student Name</th>
                      <th style={{ padding: "0.6rem 0.4rem" }}>Date</th>
                      <th style={{ padding: "0.6rem 0.4rem" }}>Entry Time</th>
                      <th style={{ padding: "0.6rem 0.4rem" }}>Marked By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentAttendance.map((record) => (
                      <tr key={record.key} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "0.55rem 0.4rem" }}>{record.studentId}</td>
                        <td style={{ padding: "0.55rem 0.4rem" }}>{record.studentName}</td>
                        <td style={{ padding: "0.55rem 0.4rem" }}>{record.date}</td>
                        <td style={{ padding: "0.55rem 0.4rem" }}>{record.formattedTime}</td>
                        <td style={{ padding: "0.55rem 0.4rem" }}>{record.markedBy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
};

const secondaryButtonStyle: CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: "0.375rem",
  padding: "0.45rem 0.75rem",
  background: "#ffffff",
  color: "#111827",
  cursor: "pointer",
};

const toRecentAttendanceFromApi = (
  record: DashboardAttendance,
  studentNameById: Map<number, string>,
): RecentAttendanceItem | null => {
  const studentId = record.studentId ?? record.student?.id ?? null;
  if (studentId === null) {
    return null;
  }

  const normalizedEntryTime = normalizeEntryTime(record.entryTime, record.date);
  if (!normalizedEntryTime) {
    return null;
  }

  return {
    key: buildAttendanceKey(studentId, normalizedEntryTime),
    studentId,
    studentName: studentNameById.get(studentId) ?? `Student ${studentId}`,
    date: normalizedEntryTime.split("T")[0] ?? record.date,
    entryTime: normalizedEntryTime,
    formattedTime: formatClockTime(normalizedEntryTime),
    markedBy: record.markedBy ?? "AI",
  };
};

const toRecentAttendanceFromRealtime = (event: AttendanceRealtimeEvent): RecentAttendanceItem => {
  const normalizedEntryTime = normalizeEntryTime(event.entryTime);
  return {
    key: buildAttendanceKey(event.studentId, normalizedEntryTime),
    studentId: event.studentId,
    studentName: event.studentName,
    date: normalizedEntryTime.split("T")[0] ?? getTodayIsoDate(),
    entryTime: normalizedEntryTime,
    formattedTime: event.formattedTime || formatClockTime(normalizedEntryTime),
    markedBy: "AI",
  };
};

const buildStudentName = (student: Student): string => {
  const fullName = `${student.firstName ?? ""} ${student.lastName ?? ""}`.trim();
  if (fullName) {
    return fullName;
  }
  return `Student ${student.id}`;
};

const normalizeEntryTime = (entryTime?: string, date?: string): string => {
  if (!entryTime) {
    return "";
  }
  if (entryTime.includes("T")) {
    return entryTime;
  }
  if (date) {
    return `${date}T${entryTime}`;
  }
  return entryTime;
};

const formatClockTime = (value: string): string => {
  if (!value) {
    return "-";
  }

  const parsed = parseUtcDate(value);
  if (!parsed) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(parsed);
};

const parseUtcDate = (value: string): Date | null => {
  if (!value) {
    return null;
  }
  const normalized = value.endsWith("Z") ? value : `${value}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const buildAttendanceKey = (studentId: number, entryTime: string): string => `${studentId}-${entryTime}`;

export default DashboardPage;
