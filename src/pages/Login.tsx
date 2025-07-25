import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import ii from "../assets/ii.png";      // left logo
import rightlogo from "../assets/P.png"; // right logo

const API_BASE_URL = window.location.origin;
type Step = "enterEmail" | "enterOtp";

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<Step>("enterEmail");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendOtp = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Failed to send OTP");
      } else {
        setStep("enterOtp");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/verify-otp`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Invalid OTP");
      } else {
        navigate("/dashboard");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="w-full flex justify-between items-center bg-white shadow-sm">
        {/* same height (h-16), wider (w-32) */}
        <img src={ii} alt="Logo" className="h-24 object-contain" />
        <img src={rightlogo} alt="Right Logo" className="h-16 object-contain" />
      </header>

      {/* Main */}
      <div className="flex-grow flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-card rounded-lg shadow-lg p-8">
          <h2 className="text-2xl font-bold mb-6 text-center">Login</h2>
          {error && <div className="mb-4 text-red-600 text-center">{error}</div>}

          {step === "enterEmail" ? (
            <>
              <label htmlFor="email" className="block text-sm font-medium mb-1">
                Email
              </label>
              <input
                id="email"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border rounded p-2 mb-2"
                placeholder="your.email"
                required
              />
              <p className="text-xs text-muted-foreground mb-4">
                We'll append "@premierenergies.com" automatically.
              </p>
              <button
                onClick={sendOtp}
                disabled={loading}
                className="w-full bg-primary text-white py-2 rounded hover:bg-primary-dark transition-colors"
              >
                {loading ? "Sending OTP..." : "Send OTP"}
              </button>
            </>
          ) : (
            <>
              <label htmlFor="otp" className="block text-sm font-medium mb-1">
                Enter OTP
              </label>
              <input
                id="otp"
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                className="w-full border rounded p-2 mb-4"
                placeholder="6‑digit code"
                required
              />
              <button
                onClick={verifyOtp}
                disabled={loading}
                className="w-full bg-primary text-white py-2 rounded hover:bg-primary-dark transition-colors"
              >
                {loading ? "Verifying..." : "Verify & Login"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full p-4 bg-gray-100 border-t text-center text-sm text-gray-600">
        © {new Date().getFullYear()} Premier Energies. All rights reserved.
      </footer>
    </div>
  );
};

export default Login;
