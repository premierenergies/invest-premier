import React, { useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Dashboard from "@/components/Dashboard";
import { useToast } from "@/components/ui/use-toast";
import { Toaster } from "@/components/ui/sonner";

const Index: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();

  // Welcome toast on load
  useEffect(() => {
    toast({
      title: "Welcome to the Investor Analytics Dashboard",
      description: "Upload your Excel file to start analyzing investor behavior.",
    });
  }, [toast]);

  // Logout action
  const logout = useCallback(async () => {
    try {
      await fetch(`${window.location.origin}/api/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      console.error("Logout failed", err);
    } finally {
      navigate("/");
    }
  }, [navigate]);

  // Auto‑logout after 5 minutes inactivity
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(logout, 5 * 60 * 1000);
    };

    const events = ["mousemove", "mousedown", "keydown", "touchstart"];
    events.forEach((ev) => window.addEventListener(ev, resetTimer));
    resetTimer();

    return () => {
      clearTimeout(timer);
      events.forEach((ev) => window.removeEventListener(ev, resetTimer));
    };
  }, [logout]);

  return (
    <div className="flex min-h-screen bg-muted/30">
      <Toaster position="top-right" />

      <div className="flex-1 space-y-4 p-4 md:p-8">
        {/* Logout button */}
        <div className="flex justify-end">
          <button
            onClick={logout}
            className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition-colors"
          >
            Logout
          </button>
        </div>

        {/* Main dashboard */}
        <Dashboard />

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>© 2025 Investor Analytics Dashboard. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
};

export default Index;