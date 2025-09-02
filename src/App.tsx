// src/App.tsx
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* Default: redirect "/" → Login */}
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* public login screen */}
        <Route path="/login" element={<Login />} />

        {/* protected dashboard now lives at /dashboard */}
        <Route path="/dashboard" element={<Index />} />

        {/* any unknown URL → NotFound */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
