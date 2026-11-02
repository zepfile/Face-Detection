import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { AxiosError } from "axios";

import { useAuth } from "../hooks/useAuth";

const LoginPage = () => {
  const navigate = useNavigate();
  const { login, isLoading, isAuthenticated } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    try {
      await login({ username, password });
      navigate("/dashboard", { replace: true });
    } catch (err) {
      let message = "Login failed. Please check your credentials.";

      if (err instanceof AxiosError) {
        if (!err.response) {
          message = "Backend server unreachable. Please check if backend is running on port 8080.";
        } else if (err.response.status === 401) {
          message = "Invalid username or password.";
        } else {
          const responseMessage =
            typeof err.response.data === "object" &&
            err.response.data !== null &&
            "message" in err.response.data
              ? String((err.response.data as { message?: unknown }).message ?? "")
              : "";
          message = responseMessage || `Login failed with status ${err.response.status}.`;
        }
      } else if (err instanceof Error && err.message.trim().length > 0) {
        message = err.message;
      }

      setError(message);
    }
  };

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  if (isLoading) {
    return <p>Loading session...</p>;
  }

  return (
    <section style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "1rem" }}>
      <form
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          maxWidth: "360px",
          display: "grid",
          gap: "0.75rem",
          border: "1px solid #e5e7eb",
          borderRadius: "0.5rem",
          padding: "1rem",
          background: "#ffffff",
        }}
      >
        <h1 style={{ margin: 0 }}>Login</h1>

        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          required
          style={{ padding: "0.55rem", border: "1px solid #d1d5db", borderRadius: "0.375rem" }}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          style={{ padding: "0.55rem", border: "1px solid #d1d5db", borderRadius: "0.375rem" }}
        />

        {error && <p style={{ margin: 0, color: "#b91c1c", fontSize: "0.9rem" }}>{error}</p>}

        <button
          type="submit"
          disabled={isLoading}
          style={{
            padding: "0.6rem",
            border: "none",
            borderRadius: "0.375rem",
            background: "#111827",
            color: "#ffffff",
            cursor: "pointer",
          }}
        >
          {isLoading ? "Signing in..." : "Login"}
        </button>
      </form>
    </section>
  );
};

export default LoginPage;
