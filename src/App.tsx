// src/App.tsx
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "@/components/ProtectedRoute";
import { AuthProvider } from "@/contexts/AuthContext";
import { useAuth } from "@/contexts/AuthContext";

// Add this component above App:
const HomeGate: React.FC = () => {
  return <Navigate to="/dashboard" replace />;
};


const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Default: redirect "/" → Login */}
          <Route path="/" element={<HomeGate />} />

          {/* public login screen */}
          <Route path="/login" element={<Login />} />

          {/* protected dashboard lives at /dashboard */}
          <Route path="/dashboard" element={<Index />} />


          {/* any unknown URL → NotFound */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
