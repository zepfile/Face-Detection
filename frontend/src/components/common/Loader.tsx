import { CSSProperties, useEffect } from "react";

interface LoaderProps {
  size?: number;
  label?: string;
  color?: string;
  className?: string;
}

const LOADER_ANIMATION_NAME = "fd-spin-loader";

const ensureLoaderAnimation = () => {
  if (typeof document === "undefined") {
    return;
  }

  if (document.getElementById(LOADER_ANIMATION_NAME)) {
    return;
  }

  const style = document.createElement("style");
  style.id = LOADER_ANIMATION_NAME;
  style.textContent = `
    @keyframes ${LOADER_ANIMATION_NAME} {
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
};

const Loader = ({ size = 32, label = "Loading...", color = "#2563eb", className }: LoaderProps) => {
  useEffect(() => {
    ensureLoaderAnimation();
  }, []);

  const spinnerStyle: CSSProperties = {
    width: size,
    height: size,
    borderRadius: "50%",
    border: `${Math.max(2, Math.round(size / 8))}px solid #e5e7eb`,
    borderTopColor: color,
    animation: `${LOADER_ANIMATION_NAME} 0.8s linear infinite`,
  };

  return (
    <div
      className={className}
      role="status"
      aria-live="polite"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.6rem",
        color: "#374151",
      }}
    >
      <span aria-hidden="true" style={spinnerStyle} />
      <span style={{ fontSize: "0.92rem" }}>{label}</span>
    </div>
  );
};

export default Loader;
