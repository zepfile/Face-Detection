import { NavLink } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

const linkStyle = ({ isActive }: { isActive: boolean }) => ({
  display: "block",
  padding: "0.65rem 0.75rem",
  borderRadius: "0.375rem",
  textDecoration: "none",
  color: isActive ? "#111827" : "#374151",
  background: isActive ? "#e5e7eb" : "transparent",
  fontWeight: isActive ? 600 : 500,
});

const Sidebar = () => {
  const { user } = useAuth();
  const isAdmin = (user?.role ?? "").toUpperCase() === "ADMIN";

  return (
    <aside
      style={{
        borderRight: "1px solid #e5e7eb",
        padding: "1rem 0.75rem",
        background: "#f9fafb",
      }}
    >
      <nav style={{ display: "grid", gap: "0.25rem" }}>
        <NavLink to="/dashboard" style={linkStyle}>
          Dashboard
        </NavLink>
        <NavLink to="/students" style={linkStyle}>
          Students
        </NavLink>
        <NavLink to="/attendance" style={linkStyle}>
          Attendance
        </NavLink>
        <NavLink to="/reports" style={linkStyle}>
          Reports
        </NavLink>
        {isAdmin && (
          <NavLink to="/coordinators" style={linkStyle}>
            Coordinators
          </NavLink>
        )}
      </nav>
    </aside>
  );
};

export default Sidebar;
