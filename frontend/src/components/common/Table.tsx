import { ReactNode, useEffect, useMemo, useState } from "react";

export type SortDirection = "asc" | "desc";

export interface TableColumn<T> {
  id: string;
  header: ReactNode;
  accessor?: keyof T | ((row: T) => unknown);
  render?: (row: T) => ReactNode;
  sortable?: boolean;
  sortAccessor?: (row: T) => unknown;
  width?: number | string;
  className?: string;
  headerClassName?: string;
}

interface TableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  keyExtractor?: (row: T, index: number) => string | number;
  pageSize?: number;
  pageSizeOptions?: number[];
  initialSort?: { columnId: string; direction?: SortDirection };
  emptyMessage?: ReactNode;
  showPagination?: boolean;
  className?: string;
}

interface SortState {
  columnId: string;
  direction: SortDirection;
}

const getValue = <T,>(row: T, column: TableColumn<T>): unknown => {
  if (column.sortAccessor) {
    return column.sortAccessor(row);
  }

  if (typeof column.accessor === "function") {
    return column.accessor(row);
  }

  if (typeof column.accessor === "string") {
    return row[column.accessor];
  }

  return undefined;
};

const normalizeSortValue = (value: unknown): string | number => {
  if (value === null || value === undefined) {
    return Number.POSITIVE_INFINITY;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  return String(value).toLowerCase();
};

const Table = <T,>({
  columns,
  data,
  keyExtractor,
  pageSize = 10,
  pageSizeOptions = [5, 10, 25, 50],
  initialSort,
  emptyMessage = "No records found.",
  showPagination = true,
  className,
}: TableProps<T>) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(Math.max(1, pageSize));
  const [sortState, setSortState] = useState<SortState | null>(() => {
    if (!initialSort) {
      return null;
    }

    const column = columns.find((col) => col.id === initialSort.columnId);
    if (!column || !column.sortable) {
      return null;
    }

    return {
      columnId: initialSort.columnId,
      direction: initialSort.direction ?? "asc",
    };
  });

  useEffect(() => {
    setRowsPerPage(Math.max(1, pageSize));
  }, [pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [data, rowsPerPage]);

  const sortedData = useMemo(() => {
    if (!sortState) {
      return data;
    }

    const sortColumn = columns.find((column) => column.id === sortState.columnId);
    if (!sortColumn || !sortColumn.sortable) {
      return data;
    }

    return [...data].sort((a, b) => {
      const valueA = normalizeSortValue(getValue(a, sortColumn));
      const valueB = normalizeSortValue(getValue(b, sortColumn));

      if (valueA < valueB) {
        return sortState.direction === "asc" ? -1 : 1;
      }
      if (valueA > valueB) {
        return sortState.direction === "asc" ? 1 : -1;
      }
      return 0;
    });
  }, [columns, data, sortState]);

  const totalPages = showPagination
    ? Math.max(1, Math.ceil(sortedData.length / rowsPerPage))
    : 1;

  const safeCurrentPage = Math.min(currentPage, totalPages);

  useEffect(() => {
    if (currentPage !== safeCurrentPage) {
      setCurrentPage(safeCurrentPage);
    }
  }, [currentPage, safeCurrentPage]);

  const paginatedData = useMemo(() => {
    if (!showPagination) {
      return sortedData;
    }
    const start = (safeCurrentPage - 1) * rowsPerPage;
    return sortedData.slice(start, start + rowsPerPage);
  }, [showPagination, sortedData, safeCurrentPage, rowsPerPage]);

  const toggleSort = (column: TableColumn<T>) => {
    if (!column.sortable) {
      return;
    }

    setSortState((prev) => {
      if (!prev || prev.columnId !== column.id) {
        return { columnId: column.id, direction: "asc" };
      }
      return {
        columnId: column.id,
        direction: prev.direction === "asc" ? "desc" : "asc",
      };
    });
  };

  const sortIndicator = (columnId: string) => {
    if (!sortState || sortState.columnId !== columnId) {
      return "";
    }
    return sortState.direction === "asc" ? " (asc)" : " (desc)";
  };

  return (
    <div className={className}>
      <div style={{ overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: "0.5rem" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f9fafb" }}>
              {columns.map((column) => (
                <th
                  key={column.id}
                  className={column.headerClassName}
                  style={{
                    textAlign: "left",
                    padding: "0.75rem",
                    borderBottom: "1px solid #e5e7eb",
                    cursor: column.sortable ? "pointer" : "default",
                    width: column.width,
                    userSelect: "none",
                  }}
                  onClick={() => toggleSort(column)}
                >
                  {column.header}
                  {column.sortable ? sortIndicator(column.id) : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  style={{
                    textAlign: "center",
                    padding: "1rem",
                    color: "#6b7280",
                  }}
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paginatedData.map((row, index) => (
                <tr
                  key={
                    keyExtractor
                      ? keyExtractor(row, index)
                      : (safeCurrentPage - 1) * rowsPerPage + index
                  }
                >
                  {columns.map((column) => (
                    <td
                      key={column.id}
                      className={column.className}
                      style={{
                        padding: "0.75rem",
                        borderBottom: "1px solid #f3f4f6",
                        verticalAlign: "top",
                      }}
                    >
                      {column.render
                        ? column.render(row)
                        : String(getValue(row, column) ?? "")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showPagination && (
        <div
          style={{
            marginTop: "0.75rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "0.75rem",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <span style={{ color: "#374151", fontSize: "0.9rem" }}>Rows per page</span>
            <select
              value={rowsPerPage}
              onChange={(event) => setRowsPerPage(Number(event.target.value))}
              style={{ padding: "0.35rem", borderRadius: "0.375rem", border: "1px solid #d1d5db" }}
            >
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={safeCurrentPage <= 1}
              style={{
                padding: "0.35rem 0.6rem",
                borderRadius: "0.375rem",
                border: "1px solid #d1d5db",
                background: "#ffffff",
                cursor: safeCurrentPage <= 1 ? "not-allowed" : "pointer",
              }}
            >
              Prev
            </button>
            <span style={{ color: "#374151", fontSize: "0.9rem" }}>
              Page {safeCurrentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              disabled={safeCurrentPage >= totalPages}
              style={{
                padding: "0.35rem 0.6rem",
                borderRadius: "0.375rem",
                border: "1px solid #d1d5db",
                background: "#ffffff",
                cursor: safeCurrentPage >= totalPages ? "not-allowed" : "pointer",
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Table;

