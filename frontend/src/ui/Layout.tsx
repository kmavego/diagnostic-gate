import React from "react";
import { Link, Outlet } from "react-router-dom";

export function Layout() {
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: 16, maxWidth: 1100, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Diagnostic Gate</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>thin-client MVP</div>
        </div>
        <nav style={{ display: "flex", gap: 12 }}>
          <Link to="/">Projects</Link>
        </nav>
      </header>
      <hr style={{ margin: "12px 0 16px" }} />
      <Outlet />
    </div>
  );
}

