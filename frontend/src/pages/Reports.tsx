import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import Loader from "../components/common/Loader";
import api from "../services/api";
import type { Student } from "../types/Student";
import { getTodayIsoDate } from "../utils/dateUtils";

interface DailyTrendItem {
  date: string;
  present: number;
  absent: number;
  total: number;
  attendancePercentage: number;
}

interface ClassComparisonItem {
  classGroup: string;
  present: number;
  absent: number;
  total: number;
  attendancePercentage: number;
}

interface TrendResponse {
  data: DailyTrendItem[];
}

interface ClassResponse {
  data: ClassComparisonItem[];
}

const ReportsPage = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [fromDate, setFromDate] = useState(getDaysAgoIsoDate(6));
  const [toDate, setToDate] = useState(getTodayIsoDate());
  const [studentId, setStudentId] = useState<number | "">("");

  const [dailyData, setDailyData] = useState<DailyTrendItem[]>([]);
  const [studentTrendData, setStudentTrendData] = useState<DailyTrendItem[]>([]);
  const [classData, setClassData] = useState<ClassComparisonItem[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadStudents = async () => {
      try {
        const response = await api.get<Student[]>("/api/students");
        setStudents(response.data);
        if (response.data.length > 0) {
          setStudentId((previous) => (previous === "" ? response.data[0].id : previous));
        }
      } catch (err) {
        setError(extractError(err, "Failed to load students for reports."));
      }
    };

    void loadStudents();
  }, []);

  const loadReports = async () => {
    if (!fromDate || !toDate) {
      setError("Select a valid date range.");
      return;
    }
    if (fromDate > toDate) {
      setError("'From date' must be before or equal to 'To date'.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const dailyPromise = api.get<TrendResponse>("/api/attendance/trends/daily", {
        params: { from: fromDate, to: toDate },
      });
      const studentPromise =
        studentId === ""
          ? Promise.resolve({ data: { data: [] } })
          : api.get<TrendResponse>(`/api/attendance/trends/student/${studentId}`, {
              params: { from: fromDate, to: toDate },
            });
      const classPromise = api.get<ClassResponse>("/api/attendance/trends/class", {
        params: { date: toDate },
      });

      const [dailyResponse, studentResponse, classResponse] = await Promise.all([
        dailyPromise,
        studentPromise,
        classPromise,
      ]);

      setDailyData(dailyResponse.data.data ?? []);
      setStudentTrendData(studentResponse.data.data ?? []);
      setClassData(classResponse.data.data ?? []);
    } catch (err) {
      setError(extractError(err, "Failed to load report data."));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate, studentId]);

  const selectedStudentName = useMemo(() => {
    if (studentId === "") {
      return "N/A";
    }
    const student = students.find((item) => item.id === studentId);
    return student ? `${student.firstName} ${student.lastName}` : "N/A";
  }, [studentId, students]);

  const exportExcel = () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(dailyData), "Daily Trend");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(studentTrendData), "Student Trend");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(classData), "Class Comparison");
    XLSX.writeFile(workbook, `attendance_report_${fromDate}_to_${toDate}.xlsx`);
  };

  const exportPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Attendance Report", 14, 18);
    doc.setFontSize(11);
    doc.text(`Date Range: ${fromDate} to ${toDate}`, 14, 28);
    doc.text(`Student Trend: ${selectedStudentName}`, 14, 35);

    let cursorY = 45;
    doc.text("Daily Attendance Percentage", 14, cursorY);
    cursorY += 7;
    dailyData.forEach((row) => {
      doc.text(`${row.date}: ${row.attendancePercentage}% (${row.present}/${row.total})`, 16, cursorY);
      cursorY += 6;
      if (cursorY > 275) {
        doc.addPage();
        cursorY = 20;
      }
    });

    cursorY += 6;
    doc.text("Class-wise Comparison", 14, cursorY);
    cursorY += 7;
    classData.forEach((row) => {
      doc.text(`${row.classGroup}: ${row.attendancePercentage}% (${row.present}/${row.total})`, 16, cursorY);
      cursorY += 6;
      if (cursorY > 275) {
        doc.addPage();
        cursorY = 20;
      }
    });

    doc.save(`attendance_report_${fromDate}_to_${toDate}.pdf`);
  };

  return (
    <section style={{ display: "grid", gap: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
        <div>
          <h2 style={{ margin: 0 }}>Reports & Analytics</h2>
          <p style={{ margin: "0.35rem 0 0", color: "#4b5563" }}>
            Attendance trends by date, student, and class.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="button" onClick={exportPdf} style={secondaryButtonStyle}>
            Export PDF
          </button>
          <button type="button" onClick={exportExcel} style={primaryButtonStyle}>
            Export Excel
          </button>
        </div>
      </div>

      <section style={cardStyle}>
        <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <label style={{ display: "grid", gap: "0.25rem" }}>
            <span>From</span>
            <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} style={inputStyle} />
          </label>
          <label style={{ display: "grid", gap: "0.25rem" }}>
            <span>To</span>
            <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} style={inputStyle} />
          </label>
          <label style={{ display: "grid", gap: "0.25rem" }}>
            <span>Student</span>
            <select
              value={studentId === "" ? "" : String(studentId)}
              onChange={(event) => setStudentId(event.target.value ? Number(event.target.value) : "")}
              style={inputStyle}
            >
              <option value="">Select Student</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.rollNumber} - {student.firstName} {student.lastName}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {error && <div style={{ ...cardStyle, color: "#b91c1c", borderColor: "#fecaca" }}>{error}</div>}

      {isLoading ? (
        <Loader label="Loading analytics..." />
      ) : (
        <>
          <section style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Daily Attendance Percentage</h3>
            <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer>
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="attendancePercentage" fill="#2563eb" name="% Attendance" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Student-wise Trend ({selectedStudentName})</h3>
            <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer>
                <LineChart data={studentTrendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="attendancePercentage" stroke="#16a34a" name="% Attendance" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Class-wise Comparison ({toDate})</h3>
            <div style={{ width: "100%", height: 320 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={classData} dataKey="present" nameKey="classGroup" outerRadius={100} label />
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </section>
        </>
      )}
    </section>
  );
};

const cardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: "0.5rem",
  padding: "1rem",
  background: "#ffffff",
};

const inputStyle: CSSProperties = {
  padding: "0.55rem",
  border: "1px solid #d1d5db",
  borderRadius: "0.375rem",
};

const primaryButtonStyle: CSSProperties = {
  border: "none",
  borderRadius: "0.375rem",
  padding: "0.5rem 0.85rem",
  background: "#111827",
  color: "#ffffff",
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: "0.375rem",
  padding: "0.5rem 0.85rem",
  background: "#ffffff",
  color: "#111827",
  cursor: "pointer",
};

const getDaysAgoIsoDate = (days: number): string => {
  const now = new Date();
  now.setDate(now.getDate() - days);
  return now.toISOString().slice(0, 10);
};

const extractError = (error: unknown, fallback: string): string => {
  if (!error || typeof error !== "object") {
    return fallback;
  }
  const candidate = error as {
    response?: { data?: { message?: string } };
    message?: string;
  };
  return candidate.response?.data?.message || candidate.message || fallback;
};

export default ReportsPage;
