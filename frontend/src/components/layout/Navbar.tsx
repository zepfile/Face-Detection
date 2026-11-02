import { useNavigate } from "react-router-dom";

import { useAuth } from "../../hooks/useAuth";

const Navbar = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <header
      style={{
        borderBottom: "1px solid #e5e7eb",
        padding: "0.75rem 1rem",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <h1 style={{ margin: 0, fontSize: "1.125rem" }}>Face Detection Attendance</h1>
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
        <span style={{ fontSize: "0.9rem", color: "#374151" }}>
          {user?.username} ({user?.role})
        </span>
        <button
          type="button"
          onClick={() => void handleLogout()}
          style={{
            background: "#111827",
            color: "#ffffff",
            border: "none",
            borderRadius: "0.375rem",
            padding: "0.4rem 0.7rem",
            cursor: "pointer",
          }}
        >
          Logout
        </button>
      </div>
    </header>
  );
};

export default Navbar;
