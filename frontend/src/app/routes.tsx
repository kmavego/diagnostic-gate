import React from "react";
import { createBrowserRouter } from "react-router-dom";
import { Layout } from "../ui/Layout";
import { ProjectsPage } from "../pages/ProjectsPage";
import { ProjectPage } from "../pages/ProjectPage";
import { AuditPage } from "../pages/AuditPage";

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <ProjectsPage /> },
      { path: "/projects/:id", element: <ProjectPage /> },

      // Audit list
      { path: "/projects/:id/audit", element: <AuditPage /> },

      // Audit detail (same page, different mode by presence of :submissionId)
      { path: "/projects/:id/audit/:submissionId", element: <AuditPage /> },
    ],
  },
]);

