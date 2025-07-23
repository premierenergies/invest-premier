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
  onDataLoaded
}: MonthlyFileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    if (!f.name.toLowerCase().endsWith(".xlsx") && !f.name.toLowerCase().endsWith(".xls")) {
      toast({
        title: "Invalid file type",
        description: "Please upload .xlsx or .xls",
        variant: "destructive"
      });
      return;
    }

    setUploading(true);
    try {
      const { date, data } = await parseMonthlyExcelFile(f);

      const rows = data.map(r => ({
        date,
        name: r.name,
        category: r.category,
        shares: r.monthlyShares[date] || 0
      }));

      const resp = await axios.post(`${API}/monthly`, rows);
      toast({
        title: "Uploaded",
        description: `Inserted ${resp.data.inserted} records for ${date}`
      });
      onDataLoaded();
    } catch (err: any) {
      console.error(err);
      toast({
        title: "Upload failed",
        description: err.response?.data?.error || err.message,
        variant: "destructive"
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
        <Upload className="mr-2" />
        {uploading ? "Uploading..." : "Upload Monthly Data"}
      </Button>
    </div>
  );
}
