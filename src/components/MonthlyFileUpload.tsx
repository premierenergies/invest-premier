
import { useState, useRef } from "react";
import { parseMonthlyExcelFile, saveMonthlyData } from "@/utils/csvUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Upload, Download } from "lucide-react";
import { exportToCSV } from "@/utils/csvUtils";

interface MonthlyFileUploadProps {
  onDataLoaded: () => void;
}

export default function MonthlyFileUpload({ onDataLoaded }: MonthlyFileUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    console.log("Monthly file selected:", file.name);

    // Check if it's an Excel file
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      toast({
        title: "Invalid file type",
        description: "Please upload an Excel file (.xlsx or .xls)",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      console.log("Starting monthly file parsing...");
      const { date, data } = await parseMonthlyExcelFile(file);
      console.log(`Parsed monthly data for ${date}:`, data.length, "records");
      
      saveMonthlyData(date, data, file.name);
      setFileName(file.name);
      
      toast({
        title: "Monthly data uploaded successfully",
        description: `Loaded ${data.length} investor records for ${date}`,
      });
      
      onDataLoaded();
      
    } catch (error) {
      console.error("Error uploading monthly file:", error);
      toast({
        title: "Error uploading file",
        description: "There was an error processing your monthly file. Please check the format and try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleExportCSV = () => {
    exportToCSV();
    toast({
      title: "CSV exported",
      description: "Your monthly investor data has been downloaded as CSV",
    });
  };

  return (
    <div className="flex items-center space-x-4">
      <Input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFileUpload}
        className="hidden"
      />
      <Button 
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="bg-blue-600 hover:bg-blue-700"
        disabled={isUploading}
        size="sm"
      >
        <Upload className="w-4 h-4 mr-2" />
        {isUploading ? "Uploading..." : "Upload Monthly Data"}
      </Button>
      
      <Button 
        onClick={handleExportCSV}
        variant="outline"
        size="sm"
      >
        <Download className="w-4 h-4 mr-2" />
        Export CSV
      </Button>
      
      {fileName && (
        <span className="text-sm text-green-600">
          ✓ {fileName}
        </span>
      )}
    </div>
  );
}
