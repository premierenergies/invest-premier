import React, { useEffect,useLayoutEffect, useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Dashboard from "@/components/Dashboard";
import { useToast } from "@/components/ui/use-toast";
import { Toaster } from "@/components/ui/sonner";
import axios from "axios";

const Index: React.FC = () => {
  // keep spinner up until /api/monthly GET returns
  const awaitingMonthly = useRef(true);

  // route-level network spinner for API calls
  const [busy, setBusy] = useState(true);
  const pending = useRef(0);

  useLayoutEffect(() => {
    const originalFetch = window.fetch.bind(window) as typeof window.fetch;

    // Start optimistic busy; if no API calls start, we’ll clear it shortly
    setBusy(true);

    const maybeClear = () => {
      // De-flicker + require monthly to have completed
      setTimeout(() => {
        if (pending.current <= 0 && !awaitingMonthly.current) {
          setBusy(false);
        }
      }, 120);
    };

    // Patch fetch (for any non-axios callers)
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const href =
        typeof input === "string" ? input : (input as Request).url ?? "";
      const isApi = href.includes("/api/") && !href.includes("/api/session"); // absolute or relative, but skip /api/session

      if (isApi) {
        pending.current += 1;
        setBusy(true);
      }

      try {
        const r = await originalFetch(input, {
          credentials: "include",
          ...init,
        });
        return r;
      } finally {
        if (isApi) {
          pending.current -= 1;
          maybeClear(); // respect monthly gate
        }
      }
    };

    // --- Axios interceptors: track GET /api/monthly only ---
    const isMonthlyGet = (url?: string, method?: string) =>
      !!url &&
      url.includes("/api/monthly") &&
      (method ?? "get").toLowerCase() === "get";

    const reqId = axios.interceptors.request.use((config) => {
      if (isMonthlyGet(config.url, config.method)) {
        pending.current += 1;
        setBusy(true);
      }
      return { ...config, withCredentials: true };
    });

    const resId = axios.interceptors.response.use(
      (resp) => {
        if (isMonthlyGet(resp.config.url, resp.config.method)) {
          pending.current -= 1;
          awaitingMonthly.current = false; // monthly is done (success)
          maybeClear();
        }
        return resp;
      },
      (error) => {
        if (isMonthlyGet(error?.config?.url, error?.config?.method)) {
          pending.current -= 1;
          awaitingMonthly.current = false; // monthly is done (even on error)
          maybeClear();
        }
        return Promise.reject(error);
      }
    );

    // If nothing triggered within a moment, clear optimistic busy,
    // but only if monthly already finished.
    const t = setTimeout(() => {
      if (pending.current === 0 && !awaitingMonthly.current) setBusy(false);
    }, 350);

    return () => {
      window.fetch = originalFetch;
      clearTimeout(t);
      axios.interceptors.request.eject(reqId);
      axios.interceptors.response.eject(resId);
    };
  }, []);

  const { toast } = useToast();
  const navigate = useNavigate();

  // Welcome toast on load
  useEffect(() => {
    toast({
      title: "Welcome to the Investor Analytics Dashboard",
      description:
        "Upload your Excel file to start analyzing investor behavior.",
    });
  }, [toast]);

  // Logout action
  const logout = useCallback(async () => {
    try {
      await fetch(`/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      console.error("Logout failed", err);
    } finally {
      // full-page redirect to reset the SPA and land on /login
      window.location.href = "/login";
    }
  }, []);

  // Auto-logout after 5 minutes inactivity //changed to 60 minutes as per user request
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(logout, 60 * 60 * 1000);
    };

    const events: (keyof WindowEventMap)[] = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
    ];
    events.forEach((ev) => window.addEventListener(ev, resetTimer));
    resetTimer();

    return () => {
      clearTimeout(timer);
      events.forEach((ev) => window.removeEventListener(ev, resetTimer));
    };
  }, [logout]);

  return (
    <div className="flex flex-col min-h-screen bg-muted/30">
      <Toaster position="top-right" />
      {/* Global route data-loading overlay */}
      {busy && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/60 backdrop-blur-sm">
          <div className="loader" aria-label="Loading data" />
          <p className="mt-3 text-sm text-muted-foreground">Loading data…</p>
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col space-y-4 p-4 md:p-8">
        {/* Main dashboard */}
        <div className="flex-1 min-h-0">
          <Dashboard />
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>
            © {new Date().getFullYear()} Investor Analytics Dashboard. All
            rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Index;
