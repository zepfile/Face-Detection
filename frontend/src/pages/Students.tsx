import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import * as XLSX from "xlsx";

import Loader from "../components/common/Loader";
import Table from "../components/common/Table";
import type { TableColumn } from "../components/common/Table";
import { useAuth } from "../hooks/useAuth";
import api from "../services/api";
import type { Student } from "../types/Student";

interface StudentFormState {
  firstName: string;
  lastName: string;
  email: string;
  rollNumber: string;
  classGroup: string;
  parentPhone: string;
  parentEmail: string;
  faceEncoding: string;
}

interface StudentUploadPayload {
  firstName: string;
  lastName: string;
  email: string;
  rollNumber: string;
  classGroup: string;
  parentPhone?: string;
  parentEmail?: string;
}

const DEFAULT_FORM: StudentFormState = {
  firstName: "",
  lastName: "",
  email: "",
  rollNumber: "",
  classGroup: "",
  parentPhone: "",
  parentEmail: "",
  faceEncoding: "",
};

const ENROLLMENT_CAPTURE_STEPS = [
  "Look straight into the camera.",
  "Turn slightly left around 30 degrees.",
  "Turn slightly right around 30 degrees.",
  "Give a left-side profile view.",
  "Give a right-side profile view.",
];

const cardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: "0.5rem",
  padding: "1rem",
  background: "#ffffff",
};

const StudentsPage = () => {
  const { user } = useAuth();
  const role = (user?.role ?? "").toUpperCase();
  const isAdmin = role === "ADMIN";
  const canManageStudents = ["ADMIN", "COORDINATOR"].includes(role);

  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingExcel, setIsUploadingExcel] = useState(false);
  const [isSavingPhotos, setIsSavingPhotos] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [classFilter, setClassFilter] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [form, setForm] = useState<StudentFormState>(DEFAULT_FORM);

  const [captureStudent, setCaptureStudent] = useState<Student | null>(null);
  const [captureImages, setCaptureImages] = useState<string[]>([]);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const loadStudents = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await api.get<Student[]>("/api/students");
      setStudents(data);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to load students."));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadStudents();
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  useEffect(() => {
    if (!captureStudent) {
      stopCamera();
      return;
    }
    void startCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureStudent]);

  const classGroupOptions = useMemo(() => {
    return [...new Set(students.map((student) => student.classGroup).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b),
    );
  }, [students]);

  const filteredStudents = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return students.filter((student) => {
      const classMatches = !classFilter || student.classGroup === classFilter;
      if (!classMatches) {
        return false;
      }

      if (!search) {
        return true;
      }

      return (
        student.firstName.toLowerCase().includes(search) ||
        student.lastName.toLowerCase().includes(search) ||
        student.email.toLowerCase().includes(search) ||
        student.rollNumber.toLowerCase().includes(search) ||
        student.classGroup.toLowerCase().includes(search)
      );
    });
  }, [students, searchTerm, classFilter]);

  const columns: TableColumn<Student>[] = useMemo(
    () => [
      {
        id: "rollNumber",
        header: "Roll No.",
        accessor: "rollNumber",
        sortable: true,
      },
      {
        id: "name",
        header: "Name",
        accessor: (row) => `${row.firstName} ${row.lastName}`,
        sortable: true,
        sortAccessor: (row) => `${row.firstName} ${row.lastName}`,
      },
      {
        id: "email",
        header: "Email",
        accessor: "email",
        sortable: true,
      },
      {
        id: "classGroup",
        header: "Class Group",
        accessor: "classGroup",
        sortable: true,
      },
      {
        id: "guardian",
        header: "Guardian Contact",
        render: (row) => `${row.parentPhone ?? "-"} / ${row.parentEmail ?? "-"}`,
        sortAccessor: (row) => `${row.parentPhone ?? ""} ${row.parentEmail ?? ""}`,
        sortable: true,
      },
      {
        id: "enrollment",
        header: "Enrollment Photos",
        render: (row) => `${row.enrollmentPhotoCount ?? 0}/5`,
        sortAccessor: (row) => row.enrollmentPhotoCount ?? 0,
        sortable: true,
      },
      {
        id: "faceEncoding",
        header: "Face Encoding",
        render: (row) => (row.faceEncoding ? "Available" : "Not available"),
        sortAccessor: (row) => (row.faceEncoding ? 1 : 0),
        sortable: true,
      },
      {
        id: "actions",
        header: "Actions",
        render: (row) => (
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {canManageStudents && (
              <button type="button" onClick={() => handleEdit(row)} style={buttonStyle("#2563eb")}>
                Edit
              </button>
            )}
            {canManageStudents && (
              <button type="button" onClick={() => openCaptureDialog(row)} style={buttonStyle("#16a34a")}>
                Capture 5 Photos
              </button>
            )}
            {isAdmin && (
              <button type="button" onClick={() => void handleDelete(row)} style={buttonStyle("#dc2626")}>
                Delete
              </button>
            )}
          </div>
        ),
      },
    ],
    [canManageStudents, isAdmin],
  );

  const handleOpenCreate = () => {
    setEditingStudent(null);
    setForm(DEFAULT_FORM);
    setShowForm(true);
    setError(null);
    setSuccessMessage(null);
  };

  const handleEdit = (student: Student) => {
    setEditingStudent(student);
    setForm({
      firstName: student.firstName,
      lastName: student.lastName,
      email: student.email,
      rollNumber: student.rollNumber,
      classGroup: student.classGroup,
      parentPhone: student.parentPhone ?? "",
      parentEmail: student.parentEmail ?? "",
      faceEncoding: student.faceEncoding ?? "",
    });
    setShowForm(true);
    setError(null);
    setSuccessMessage(null);
  };

  const handleDelete = async (student: Student) => {
    const confirmed = window.confirm(`Delete student ${student.firstName} ${student.lastName}?`);
    if (!confirmed) {
      return;
    }

    setError(null);
    setSuccessMessage(null);
    try {
      await api.delete(`/api/students/${student.id}`);
      setStudents((prev) => prev.filter((item) => item.id !== student.id));
      setSuccessMessage("Student deleted.");
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to delete student."));
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    const payload = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      rollNumber: form.rollNumber.trim(),
      classGroup: form.classGroup.trim(),
      parentPhone: form.parentPhone.trim() || undefined,
      parentEmail: form.parentEmail.trim() || undefined,
      faceEncoding: form.faceEncoding.trim() || undefined,
    };

    try {
      if (editingStudent) {
        await api.put(`/api/students/${editingStudent.id}`, payload);
        setSuccessMessage("Student updated.");
      } else {
        await api.post("/api/students", payload);
        setSuccessMessage("Student created.");
      }

      setShowForm(false);
      setEditingStudent(null);
      setForm(DEFAULT_FORM);
      await loadStudents();
    } catch (err) {
      setError(
        extractErrorMessage(
          err,
          editingStudent ? "Failed to update student." : "Failed to create student.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExcelFile = async (file: File) => {
    setIsUploadingExcel(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const studentsPayload = await parseStudentsFromExcel(file);
      if (studentsPayload.length === 0) {
        throw new Error("No valid student rows found in file.");
      }
      await api.post("/api/students/bulk", studentsPayload);
      setSuccessMessage(`Imported ${studentsPayload.length} students successfully.`);
      await loadStudents();
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to import students from Excel."));
    } finally {
      setIsUploadingExcel(false);
    }
  };

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      setCameraError(extractErrorMessage(err, "Unable to access laptop camera."));
    }
  };

  const stopCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const openCaptureDialog = (student: Student) => {
    setCaptureStudent(student);
    setCaptureImages([]);
    setCameraError(null);
    setError(null);
    setSuccessMessage(null);
  };

  const closeCaptureDialog = () => {
    setCaptureStudent(null);
    setCaptureImages([]);
    setCameraError(null);
    stopCamera();
  };

  const capturePhoto = () => {
    if (!videoRef.current) {
      setCameraError("Camera preview is not ready.");
      return;
    }
    if (captureImages.length >= 5) {
      return;
    }

    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const context = canvas.getContext("2d");
    if (!context) {
      setCameraError("Unable to capture frame.");
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL("image/jpeg", 0.9);
    setCaptureImages((prev) => [...prev, image]);
  };

  const removeCapturedPhoto = (index: number) => {
    setCaptureImages((prev) => prev.filter((_, idx) => idx !== index));
  };

  const saveEnrollmentPhotos = async () => {
    if (!captureStudent) {
      return;
    }
    if (captureImages.length !== 5) {
      setCameraError("Capture exactly 5 photos before saving.");
      return;
    }

    setIsSavingPhotos(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await api.post(`/api/students/${captureStudent.id}/enrollment-photos`, {
        images: captureImages,
      });
      try {
        const streamBase = import.meta.env.VITE_AI_STREAM_BASE_URL || "http://localhost:5000";
        void fetch(`${streamBase}/api/live/reload-encodings`, { method: "POST" });
      } catch {
        // AI service will also auto-sync in its background loop
      }
      setSuccessMessage(`Saved 5 enrollment photos for ${captureStudent.firstName} ${captureStudent.lastName}.`);
      closeCaptureDialog();
      await loadStudents();
    } catch (err) {
      setCameraError(extractErrorMessage(err, "Failed to save enrollment photos."));
    } finally {
      setIsSavingPhotos(false);
    }
  };

  return (
    <section style={{ display: "grid", gap: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
        <div>
          <h2 style={{ margin: 0 }}>Students</h2>
          <p style={{ margin: "0.35rem 0 0", color: "#4b5563" }}>
            List, filter, import students and capture enrollment photos.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button type="button" onClick={() => void loadStudents()} style={secondaryButtonStyle}>
            Refresh
          </button>
          {canManageStudents && (
            <label style={secondaryButtonStyle}>
              {isUploadingExcel ? "Importing..." : "Upload Excel"}
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: "none" }}
                disabled={isUploadingExcel}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.currentTarget.value = "";
                  if (file) {
                    void handleExcelFile(file);
                  }
                }}
              />
            </label>
          )}
          {canManageStudents && (
            <button type="button" onClick={handleOpenCreate} style={primaryButtonStyle}>
              Add Student
            </button>
          )}
        </div>
      </div>

      <section style={cardStyle}>
        <div
          style={{
            display: "grid",
            gap: "0.75rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            alignItems: "end",
          }}
        >
          <label style={{ display: "grid", gap: "0.3rem" }}>
            <span style={{ fontSize: "0.9rem", color: "#374151" }}>Search</span>
            <input
              type="text"
              value={searchTerm}
              placeholder="Name, email, roll number..."
              onChange={(event) => setSearchTerm(event.target.value)}
              style={inputStyle}
            />
          </label>

          <label style={{ display: "grid", gap: "0.3rem" }}>
            <span style={{ fontSize: "0.9rem", color: "#374151" }}>Class Group</span>
            <select value={classFilter} onChange={(event) => setClassFilter(event.target.value)} style={inputStyle}>
              <option value="">All Classes</option>
              {classGroupOptions.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {showForm && (
        <section style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>{editingStudent ? "Edit Student" : "Add Student"}</h3>
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: "0.75rem" }}>
            <div
              style={{
                display: "grid",
                gap: "0.75rem",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              }}
            >
              <input
                type="text"
                placeholder="First Name"
                value={form.firstName}
                onChange={(event) => setForm((prev) => ({ ...prev, firstName: event.target.value }))}
                required
                style={inputStyle}
              />
              <input
                type="text"
                placeholder="Last Name"
                value={form.lastName}
                onChange={(event) => setForm((prev) => ({ ...prev, lastName: event.target.value }))}
                required
                style={inputStyle}
              />
              <input
                type="email"
                placeholder="Email"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                required
                style={inputStyle}
              />
              <input
                type="text"
                placeholder="Roll Number"
                value={form.rollNumber}
                onChange={(event) => setForm((prev) => ({ ...prev, rollNumber: event.target.value }))}
                required
                style={inputStyle}
              />
              <input
                type="text"
                placeholder="Class Group (e.g. 10A)"
                value={form.classGroup}
                onChange={(event) => setForm((prev) => ({ ...prev, classGroup: event.target.value }))}
                required
                style={inputStyle}
              />
              <input
                type="text"
                placeholder="Parent Phone (optional)"
                value={form.parentPhone}
                onChange={(event) => setForm((prev) => ({ ...prev, parentPhone: event.target.value }))}
                style={inputStyle}
              />
              <input
                type="email"
                placeholder="Parent Email (optional)"
                value={form.parentEmail}
                onChange={(event) => setForm((prev) => ({ ...prev, parentEmail: event.target.value }))}
                style={inputStyle}
              />
              <input
                type="text"
                placeholder="Face Encoding (optional)"
                value={form.faceEncoding}
                onChange={(event) => setForm((prev) => ({ ...prev, faceEncoding: event.target.value }))}
                style={inputStyle}
              />
            </div>

            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button type="submit" disabled={isSubmitting} style={primaryButtonStyle}>
                {isSubmitting ? "Saving..." : editingStudent ? "Update Student" : "Create Student"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingStudent(null);
                  setForm(DEFAULT_FORM);
                }}
                style={secondaryButtonStyle}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      {successMessage && (
        <div style={{ ...cardStyle, borderColor: "#bbf7d0", color: "#166534" }}>
          {successMessage}
        </div>
      )}

      {error && (
        <div style={{ ...cardStyle, borderColor: "#fecaca", color: "#b91c1c" }}>
          {error}
        </div>
      )}

      {isLoading ? (
        <Loader label="Loading students..." />
      ) : (
        <section style={cardStyle}>
          <Table<Student>
            columns={columns}
            data={filteredStudents}
            keyExtractor={(row) => row.id}
            pageSize={10}
            initialSort={{ columnId: "rollNumber", direction: "asc" }}
            emptyMessage="No students match the current filter."
          />
        </section>
      )}

      {captureStudent && (
        <section style={dialogOverlayStyle}>
          <div style={dialogCardStyle}>
            <h3 style={{ marginTop: 0 }}>
              Capture Enrollment Photos: {captureStudent.firstName} {captureStudent.lastName}
            </h3>
            <p style={{ marginTop: 0, color: "#4b5563" }}>
              Capture exactly 5 photos with different face angles so the AI can recognize front, partial, and side views better.
            </p>
            <div
              style={{
                border: "1px solid #dbeafe",
                borderRadius: "0.5rem",
                padding: "0.75rem",
                background: "#eff6ff",
                color: "#1e3a8a",
                marginBottom: "0.75rem",
              }}
            >
              <strong style={{ display: "block", marginBottom: "0.35rem" }}>Recommended capture order</strong>
              <ol style={{ margin: 0, paddingLeft: "1.2rem" }}>
                {ENROLLMENT_CAPTURE_STEPS.map((step) => (
                  <li key={step} style={{ marginBottom: "0.2rem" }}>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
            <div style={{ position: "relative", border: "1px solid #d1d5db", borderRadius: "0.5rem", overflow: "hidden" }}>
              <video ref={videoRef} muted playsInline style={{ width: "100%", maxHeight: "340px", objectFit: "cover" }} />
            </div>
            {cameraError && <p style={{ color: "#b91c1c", marginBottom: 0 }}>{cameraError}</p>}

            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={capturePhoto}
                disabled={captureImages.length >= 5}
                style={primaryButtonStyle}
              >
                Capture Photo ({captureImages.length}/5)
              </button>
              <button type="button" onClick={saveEnrollmentPhotos} disabled={isSavingPhotos || captureImages.length !== 5} style={buttonStyle("#16a34a")}>
                {isSavingPhotos ? "Saving..." : "Save 5 Photos"}
              </button>
              <button type="button" onClick={closeCaptureDialog} style={secondaryButtonStyle}>
                Close
              </button>
            </div>

            <div style={{ display: "grid", gap: "0.5rem", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", marginTop: "0.9rem" }}>
              {captureImages.map((image, index) => (
                <div key={`${image}-${index}`} style={{ border: "1px solid #e5e7eb", borderRadius: "0.5rem", padding: "0.45rem" }}>
                  <p style={{ margin: "0 0 0.35rem", fontSize: "0.82rem", color: "#4b5563" }}>
                    {ENROLLMENT_CAPTURE_STEPS[index] ?? `Capture ${index + 1}`}
                  </p>
                  <img src={image} alt={`Capture ${index + 1}`} style={{ width: "100%", borderRadius: "0.35rem" }} />
                  <button
                    type="button"
                    onClick={() => removeCapturedPhoto(index)}
                    style={{ ...buttonStyle("#dc2626"), width: "100%", marginTop: "0.4rem" }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </section>
  );
};

const parseStudentsFromExcel = async (file: File): Promise<StudentUploadPayload[]> => {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return [];
  }
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const payload: StudentUploadPayload[] = [];

  rows.forEach((row) => {
    const firstName = pickValue(row, ["firstName", "first name", "firstname"]);
    const lastName = pickValue(row, ["lastName", "last name", "lastname"]);
    const email = pickValue(row, ["email", "email address"]);
    const rollNumber = pickValue(row, ["rollNumber", "roll number", "roll_no", "rollno"]);
    const classGroup = pickValue(row, ["classGroup", "class group", "section", "class"]);
    const parentPhone = pickValue(row, ["parentPhone", "parent phone", "guardian phone"]);
    const parentEmail = pickValue(row, ["parentEmail", "parent email", "guardian email"]);

    if (!firstName || !lastName || !email || !rollNumber || !classGroup) {
      return;
    }

    payload.push({
      firstName,
      lastName,
      email,
      rollNumber,
      classGroup,
      parentPhone: parentPhone || undefined,
      parentEmail: parentEmail || undefined,
    });
  });

  return payload;
};

const pickValue = (row: Record<string, unknown>, aliases: string[]): string => {
  const normalized = Object.entries(row).reduce<Record<string, string>>((acc, [key, value]) => {
    acc[normalizeHeader(key)] = String(value ?? "").trim();
    return acc;
  }, {});

  for (const alias of aliases) {
    const value = normalized[normalizeHeader(alias)];
    if (value) {
      return value;
    }
  }
  return "";
};

const normalizeHeader = (value: string): string => value.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();

const inputStyle: CSSProperties = {
  padding: "0.55rem",
  border: "1px solid #d1d5db",
  borderRadius: "0.375rem",
};

const primaryButtonStyle: CSSProperties = {
  border: "none",
  borderRadius: "0.375rem",
  padding: "0.45rem 0.75rem",
  background: "#111827",
  color: "#ffffff",
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: "0.375rem",
  padding: "0.45rem 0.75rem",
  background: "#ffffff",
  cursor: "pointer",
};

const buttonStyle = (background: string): CSSProperties => ({
  border: "none",
  borderRadius: "0.375rem",
  padding: "0.45rem 0.75rem",
  background,
  color: "#ffffff",
  cursor: "pointer",
});

const dialogOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(17, 24, 39, 0.55)",
  display: "grid",
  placeItems: "center",
  padding: "1rem",
  zIndex: 40,
};

const dialogCardStyle: CSSProperties = {
  width: "min(920px, 96vw)",
  maxHeight: "90vh",
  overflowY: "auto",
  borderRadius: "0.75rem",
  padding: "1rem",
  background: "#ffffff",
  border: "1px solid #e5e7eb",
};

const extractErrorMessage = (error: unknown, fallback: string): string => {
  if (!error || typeof error !== "object") {
    return fallback;
  }

  const maybeAxiosError = error as {
    response?: {
      data?: {
        message?: string;
      };
    };
    message?: string;
  };

  return maybeAxiosError.response?.data?.message || maybeAxiosError.message || fallback;
};

export default StudentsPage;
