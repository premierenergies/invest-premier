// src/components/MonthlyFileUpload.tsx
import { useState, useRef } from "react";
import axios from "axios";
import { parseMonthlyExcelFile } from "@/utils/csvUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Upload } from "lucide-react";

/* ------------------------------------------------------------------ */
/* Base-URL helper (identical logic to Dashboard)                      */
/* ------------------------------------------------------------------ */
function apiBase(): string {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) return envUrl.endsWith("/") ? envUrl.slice(0, -1) : envUrl;
  if (import.meta.env.DEV) return "http://localhost:5000";
  return window.location.origin;
}
const API = `${apiBase()}/api`;

interface MonthlyFileUploadProps {
  onDataLoaded: () => void;
}

export default function MonthlyFileUpload({
  onDataLoaded,
}: MonthlyFileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    if (!/\.(xlsx|xls)$/i.test(f.name)) {
      toast({
        title: "Invalid file type",
        description: "Please upload an Excel file (.xlsx or .xls)",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    try {
      // ✅ parser already:
      // - supports OLD + NEW formats
      // - groups by PAN (new) / Name (old)
      // - extracts ISO date
      const { date, data } = await parseMonthlyExcelFile(f);

      // Build payload expected by backend (/api/monthly)
      const rows = data.map((inv) => ({
        date, // ISO YYYY-MM-DD

        // identity / grouping
        pan: inv.pan ?? null,
        dpid: inv.dpid ?? null,
        clientId: inv.clientId ?? null,

        // display + categorisation
        name: inv.name,
        category: inv.category ?? null,

        // values
        shares: inv.monthlyShares[date] || 0,
        percentEquity: inv.percentToEquity ?? null,
      }));

      const resp = await axios.post(`${API}/monthly`, rows, {
        withCredentials: true,
      });

      toast({
        title: "Upload successful",
        description: `Inserted ${resp.data.inserted} PAN-grouped records for ${date}`,
      });

      onDataLoaded();
    } catch (err: any) {
      console.error("Monthly upload failed:", err);
      toast({
        title: "Upload failed",
        description:
          err?.response?.data?.error || err?.message || "Unexpected error",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div>
      <Input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handle}
        className="hidden"
      />
      <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
        <Upload className="mr-2 h-4 w-4" />
        {uploading ? "Uploading..." : "Upload Monthly Data"}
      </Button>
    </div>
  );
}
