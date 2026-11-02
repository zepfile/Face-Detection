import { Navigate, Outlet, Route, Routes } from "react-router-dom";

import { useAuth } from "../hooks/useAuth";
import AttendancePage from "../pages/Attendance";
import CoordinatorsPage from "../pages/Coordinators";
import DashboardPage from "../pages/Dashboard";
import LoginPage from "../pages/Login";
import ReportsPage from "../pages/Reports";
import StudentsPage from "../pages/Students";

const ProtectedRoute = () => {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) {
    return <p>Loading session...</p>;
  }
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
};

const RoleRoute = ({ allowedRoles }: { allowedRoles: string[] }) => {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return <p>Loading session...</p>;
  }

  const role = (user?.role ?? "").toUpperCase();
  return allowedRoles.includes(role) ? <Outlet /> : <Navigate to="/dashboard" replace />;
};

const NotFoundPage = () => (
  <section>
    <h1>404</h1>
    <p>Page not found.</p>
  </section>
);

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/students" element={<StudentsPage />} />
        <Route path="/attendance" element={<AttendancePage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route element={<RoleRoute allowedRoles={["ADMIN"]} />}>
          <Route path="/coordinators" element={<CoordinatorsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};

export default AppRoutes;
