import { useLocation } from "react-router-dom";

import Navbar from "./components/layout/Navbar";
import Sidebar from "./components/layout/Sidebar";
import AppRoutes from "./routes/AppRoutes";

const App = () => {
  const location = useLocation();
  const showLayout = location.pathname !== "/login";

  if (!showLayout) {
    return <AppRoutes />;
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", minHeight: "100vh" }}>
      <Sidebar />
      <div style={{ display: "flex", flexDirection: "column" }}>
        <Navbar />
        <main style={{ padding: "1rem", flex: 1 }}>
          <AppRoutes />
        </main>
      </div>
    </div>
  );
};

export default App;
