import { FormEvent, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

import Table from "../components/common/Table";
import type { TableColumn } from "../components/common/Table";
import { useAuth } from "../hooks/useAuth";
import api from "../services/api";
import { formatDateTime } from "../utils/dateUtils";

interface Coordinator {
  id: number;
  username: string;
  role: string;
  createdAt: string;
  updatedAt: string;
}

interface CoordinatorFormState {
  username: string;
  password: string;
}

const DEFAULT_FORM: CoordinatorFormState = {
  username: "",
  password: "",
};

const CoordinatorsPage = () => {
  const { user } = useAuth();
  const isAdmin = (user?.role ?? "").toUpperCase() === "ADMIN";

  const [coordinators, setCoordinators] = useState<Coordinator[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [form, setForm] = useState<CoordinatorFormState>(DEFAULT_FORM);

  const loadCoordinators = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await api.get<Coordinator[]>("/api/admin/coordinators");
      setCoordinators(data);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to load coordinators."));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) {
      return;
    }
    void loadCoordinators();
  }, [isAdmin]);

  const columns: TableColumn<Coordinator>[] = useMemo(
    () => [
      {
        id: "username",
        header: "Username",
        accessor: "username",
        sortable: true,
      },
      {
        id: "role",
        header: "Role",
        accessor: "role",
        sortable: true,
      },
      {
        id: "createdAt",
        header: "Created",
        render: (row) => formatDateTime(row.createdAt),
        sortAccessor: (row) => row.createdAt ?? "",
        sortable: true,
      },
      {
        id: "actions",
        header: "Actions",
        render: (row) => (
          <button type="button" onClick={() => void handleDelete(row)} style={dangerButtonStyle}>
            Delete
          </button>
        ),
      },
    ],
    [],
  );

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await api.post("/api/admin/coordinators", {
        username: form.username.trim(),
        password: form.password,
      });
      setForm(DEFAULT_FORM);
      setSuccessMessage("Coordinator created successfully.");
      await loadCoordinators();
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to create coordinator."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (coordinator: Coordinator) => {
    const confirmed = window.confirm(`Delete coordinator ${coordinator.username}?`);
    if (!confirmed) {
      return;
    }

    setError(null);
    setSuccessMessage(null);
    try {
      await api.delete(`/api/admin/coordinators/${coordinator.id}`);
      setSuccessMessage("Coordinator deleted.");
      setCoordinators((prev) => prev.filter((item) => item.id !== coordinator.id));
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to delete coordinator."));
    }
  };

  if (!isAdmin) {
    return (
      <section style={{ ...cardStyle, borderColor: "#fecaca", color: "#b91c1c" }}>
        Access denied. Only ADMIN can manage coordinators.
      </section>
    );
  }

  return (
    <section style={{ display: "grid", gap: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
        <div>
          <h2 style={{ margin: 0 }}>Coordinators</h2>
          <p style={{ margin: "0.35rem 0 0", color: "#4b5563" }}>
            Create and manage coordinator accounts.
          </p>
        </div>
        <button type="button" onClick={() => void loadCoordinators()} style={secondaryButtonStyle}>
          Refresh
        </button>
      </div>

      <section style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Create Coordinator</h3>
        <form onSubmit={handleCreate} style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "2fr 2fr auto" }}>
          <input
            type="text"
            placeholder="Username"
            value={form.username}
            onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))}
            style={inputStyle}
            minLength={4}
            maxLength={80}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
            style={inputStyle}
            minLength={10}
            required
          />
          <button type="submit" disabled={isSubmitting} style={primaryButtonStyle}>
            {isSubmitting ? "Creating..." : "Create"}
          </button>
        </form>
        <p style={{ margin: "0.6rem 0 0", color: "#6b7280", fontSize: "0.85rem" }}>
          Password rule: min 10 chars, 1 uppercase, 1 number, 1 special character.
        </p>
      </section>

      {successMessage && <div style={{ ...cardStyle, borderColor: "#bbf7d0", color: "#166534" }}>{successMessage}</div>}
      {error && <div style={{ ...cardStyle, borderColor: "#fecaca", color: "#b91c1c" }}>{error}</div>}

      <section style={cardStyle}>
        <Table<Coordinator>
          columns={columns}
          data={coordinators}
          keyExtractor={(row) => row.id}
          pageSize={10}
          initialSort={{ columnId: "username", direction: "asc" }}
          emptyMessage={isLoading ? "Loading coordinators..." : "No coordinators found."}
        />
      </section>
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

const dangerButtonStyle: CSSProperties = {
  border: "none",
  borderRadius: "0.375rem",
  padding: "0.4rem 0.7rem",
  background: "#dc2626",
  color: "#ffffff",
  cursor: "pointer",
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

export default CoordinatorsPage;
