import { useState, useRef } from "react";
import axios from "axios";
import { parseMonthlyExcelFile } from "@/utils/csvUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Upload } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

interface MonthlyFileUploadProps {
  onDataLoaded: () => void;
}

export default function MonthlyFileUpload({ onDataLoaded }: MonthlyFileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    if (!/\.(xlsx|xls)$/i.test(f.name)) {
      toast({ title: "Invalid file type", description: "Please upload .xlsx or .xls", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      // parseMonthlyExcelFile returns { date: "YYYY-MM-DD", data: MonthlyInvestorData[] }
      const { date, data } = await parseMonthlyExcelFile(f);

      // map to {date, name, category, shares}
      const rows = data.map(r => ({
        date,
        name:     r.name,
        category: r.category,
        shares:   r.monthlyShares[date] || 0
      }));

      const resp = await axios.post(`${API}/monthly`, rows);
      toast({ title: "Uploaded", description: `Inserted ${resp.data.inserted} rows for ${date}` });
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
      <Button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
      >
        <Upload className="mr-2" /> {uploading ? "Uploading..." : "Upload Monthly Data"}
      </Button>
    </div>
  );
}
