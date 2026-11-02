import { FormEvent, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

import Loader from "../components/common/Loader";
import Table from "../components/common/Table";
import type { TableColumn } from "../components/common/Table";
import { useAuth } from "../hooks/useAuth";
import api from "../services/api";
import type { Attendance } from "../types/Attendance";
import type { Student } from "../types/Student";
import { formatDateTime, getTodayIsoDate } from "../utils/dateUtils";

interface AttendanceRecord extends Attendance {
  createdAt?: string;
}

interface ManualAttendanceForm {
  studentId: string;
  entryTimeLocal: string;
}

function currentDateTimeInput(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

const DEFAULT_FORM: ManualAttendanceForm = {
  studentId: "",
  entryTimeLocal: currentDateTimeInput(),
};

const cardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: "0.5rem",
  padding: "1rem",
  background: "#ffffff",
};

const AttendancePage = () => {
  const { user } = useAuth();
  const canMarkManual = ["ADMIN", "COORDINATOR"].includes((user?.role ?? "").toUpperCase());

  const [selectedDate, setSelectedDate] = useState(getTodayIsoDate());
  const [lateAfter, setLateAfter] = useState("09:15");
  const [classFilter, setClassFilter] = useState("");

  const [students, setStudents] = useState<Student[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [lateRecords, setLateRecords] = useState<AttendanceRecord[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isNotifying, setIsNotifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState("");

  const [manualForm, setManualForm] = useState<ManualAttendanceForm>(DEFAULT_FORM);

  const studentMap = useMemo(
    () => new Map<number, Student>(students.map((student) => [student.id, student])),
    [students],
  );

  const classGroupOptions = useMemo(() => {
    return [...new Set(students.map((student) => student.classGroup).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b),
    );
  }, [students]);

  const filteredStudentsForManual = useMemo(() => {
    if (!classFilter) {
      return students;
    }
    return students.filter((student) => student.classGroup === classFilter);
  }, [students, classFilter]);

  const filteredRecords = useMemo(() => {
    if (!classFilter) {
      return records;
    }
    return records.filter((record) => {
      const student = record.studentId ? studentMap.get(record.studentId) : undefined;
      return student?.classGroup === classFilter;
    });
  }, [records, classFilter, studentMap]);

  const loadStudents = async () => {
    try {
      const response = await api.get<Student[]>("/api/students");
      setStudents(response.data);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to load students."));
    }
  };

  const loadAttendance = async (date: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.get<AttendanceRecord[]>("/api/attendance", {
        params: { date },
      });
      setRecords(response.data);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to load attendance records."));
      setRecords([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadLateAttendance = async (date: string, after: string) => {
    try {
      const response = await api.get<AttendanceRecord[]>("/api/attendance/late", {
        params: { date, after },
      });
      setLateRecords(response.data);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to load late arrivals."));
      setLateRecords([]);
    }
  };

  const handleNotifyAbsent = async () => {
    setIsNotifying(true);
    setError(null);
    setSuccessMessage("");
    try {
      const response = await api.post("/api/notifications/notify-absent", null, {
        params: {
          date: selectedDate,
          classGroup: classFilter || undefined,
        },
      });
      const count = response.data?.count ?? 0;
      setSuccessMessage(`Absent notifications dispatched for ${count} student(s) on ${selectedDate}.`);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to send absent notifications."));
    } finally {
      setIsNotifying(false);
    }
  };

  const refreshData = async () => {
    setSuccessMessage("");
    await Promise.all([loadStudents(), loadAttendance(selectedDate), loadLateAttendance(selectedDate, lateAfter)]);
  };

  useEffect(() => {
    void loadStudents();
  }, []);

  useEffect(() => {
    void Promise.all([loadAttendance(selectedDate), loadLateAttendance(selectedDate, lateAfter)]);
  }, [selectedDate, lateAfter]);

  const handleManualSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canMarkManual) {
      return;
    }

    if (!manualForm.studentId) {
      setError("Select a student to record entry.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage("");

    try {
      await api.post("/api/attendance", {
        studentId: Number(manualForm.studentId),
        entryTime: normalizeEntryTime(manualForm.entryTimeLocal),
        markedBy: "MANUAL",
      });

      setSuccessMessage("Entry recorded successfully.");
      setManualForm((prev) => ({
        ...prev,
        entryTimeLocal: currentDateTimeInput(),
      }));

      await loadAttendance(selectedDate);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to record entry."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns: TableColumn<AttendanceRecord>[] = useMemo(
    () => [
      {
        id: "name",
        header: "Student Name",
        render: (row) => {
          const student = row.studentId ? studentMap.get(row.studentId) : undefined;
          return student ? `${student.firstName} ${student.lastName}` : "-";
        },
        sortAccessor: (row) => {
          const student = row.studentId ? studentMap.get(row.studentId) : undefined;
          return student ? `${student.firstName} ${student.lastName}` : "";
        },
        sortable: true,
      },
      {
        id: "rollNumber",
        header: "Roll Number",
        render: (row) => {
          const student = row.studentId ? studentMap.get(row.studentId) : undefined;
          return student?.rollNumber ?? "-";
        },
        sortAccessor: (row) => {
          const student = row.studentId ? studentMap.get(row.studentId) : undefined;
          return student?.rollNumber ?? "";
        },
        sortable: true,
      },
      {
        id: "date",
        header: "Date",
        accessor: "date",
        sortable: true,
      },
      {
        id: "entryTime",
        header: "Entry Time",
        render: (row) => formatUtcEntryTime(row.entryTime),
        sortAccessor: (row) => row.entryTime ?? "",
        sortable: true,
      },
      {
        id: "markedBy",
        header: "Marked By",
        accessor: "markedBy",
        sortable: true,
      },
    ],
    [studentMap],
  );

  return (
    <section style={{ display: "grid", gap: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
        <div>
          <h2 style={{ margin: 0 }}>Attendance Entries</h2>
          <p style={{ margin: "0.35rem 0 0", color: "#4b5563" }}>
            First recognized entry timestamp per student per day.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {canMarkManual && (
            <button
              type="button"
              onClick={handleNotifyAbsent}
              disabled={isNotifying}
              style={{
                border: "none",
                borderRadius: "0.375rem",
                padding: "0.45rem 0.85rem",
                background: isNotifying ? "#93c5fd" : "#2563eb",
                color: "#ffffff",
                cursor: isNotifying ? "not-allowed" : "pointer",
                fontWeight: 500,
              }}
            >
              {isNotifying ? "Sending Alerts..." : "Notify Absent Guardians"}
            </button>
          )}
          <button
            type="button"
            onClick={() => void refreshData()}
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
            <span style={{ fontSize: "0.9rem", color: "#374151" }}>Date</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
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

      {canMarkManual && (
        <section style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Manual Entry</h3>
          <form
            onSubmit={handleManualSubmit}
            style={{
              display: "grid",
              gap: "0.75rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              alignItems: "end",
            }}
          >
            <label style={{ display: "grid", gap: "0.3rem" }}>
              <span style={{ fontSize: "0.9rem", color: "#374151" }}>Student</span>
              <select
                value={manualForm.studentId}
                onChange={(event) => setManualForm((prev) => ({ ...prev, studentId: event.target.value }))}
                style={inputStyle}
                required
              >
                <option value="">Select student</option>
                {filteredStudentsForManual.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.rollNumber} - {student.firstName} {student.lastName}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: "0.3rem" }}>
              <span style={{ fontSize: "0.9rem", color: "#374151" }}>Entry Time</span>
              <input
                type="datetime-local"
                value={manualForm.entryTimeLocal}
                onChange={(event) =>
                  setManualForm((prev) => ({
                    ...prev,
                    entryTimeLocal: event.target.value,
                  }))
                }
                style={inputStyle}
                required
              />
            </label>

            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                border: "none",
                borderRadius: "0.375rem",
                padding: "0.55rem 0.85rem",
                background: "#111827",
                color: "#ffffff",
                cursor: "pointer",
                height: "fit-content",
              }}
            >
              {isSubmitting ? "Saving..." : "Record Entry"}
            </button>
          </form>
        </section>
      )}

      {successMessage && (
        <div
          style={{
            ...cardStyle,
            borderColor: "#bbf7d0",
            color: "#166534",
          }}
        >
          {successMessage}
        </div>
      )}

      {error && (
        <div
          style={{
            ...cardStyle,
            borderColor: "#fecaca",
            color: "#b91c1c",
          }}
        >
          {error}
        </div>
      )}

      {isLoading ? (
        <Loader label="Loading attendance entries..." />
      ) : (
        <>
          <section style={cardStyle}>
            <Table<AttendanceRecord>
              columns={columns}
              data={filteredRecords}
              keyExtractor={(row) => row.id}
              pageSize={10}
              initialSort={{ columnId: "entryTime", direction: "desc" }}
              emptyMessage="No attendance entries found for selected filters."
            />
          </section>

          <section style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>Late Arrivals</h3>
              <label style={{ display: "grid", gap: "0.3rem" }}>
                <span style={{ fontSize: "0.85rem", color: "#374151" }}>Late After</span>
                <input
                  type="time"
                  value={lateAfter}
                  onChange={(event) => setLateAfter(event.target.value)}
                  style={inputStyle}
                />
              </label>
            </div>
            <div style={{ marginTop: "0.8rem" }}>
              <Table<AttendanceRecord>
                columns={columns}
                data={lateRecords.filter((record) => {
                  if (!classFilter) {
                    return true;
                  }
                  const student = record.studentId ? studentMap.get(record.studentId) : undefined;
                  return student?.classGroup === classFilter;
                })}
                keyExtractor={(row) => `late-${row.id}`}
                pageSize={10}
                initialSort={{ columnId: "entryTime", direction: "desc" }}
                emptyMessage="No late arrivals for selected date/threshold."
              />
            </div>
          </section>
        </>
      )}
    </section>
  );
};

const inputStyle: CSSProperties = {
  padding: "0.55rem",
  border: "1px solid #d1d5db",
  borderRadius: "0.375rem",
};

const normalizeEntryTime = (value: string): string => {
  const parsed = value ? new Date(value) : new Date();
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString().slice(0, 19);
  }
  // Backend stores LocalDateTime in UTC (without offset suffix).
  return parsed.toISOString().slice(0, 19);
};

const formatUtcEntryTime = (value: string): string => {
  if (!value) {
    return "-";
  }
  const parsed = new Date(`${value}Z`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return formatDateTime(parsed);
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

export default AttendancePage;
