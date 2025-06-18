
import { useState, useRef } from "react";
import { parseMonthlyExcelFile, saveMonthlyData, exportToExcel } from "@/utils/csvUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Upload, Download, FileSpreadsheet } from "lucide-react";

interface MonthlyFileUploadProps {
  onDataLoaded: () => void;
}

export default function MonthlyFileUpload({ onDataLoaded }: MonthlyFileUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    console.log("Monthly files selected:", files.length);
    setIsUploading(true);

    try {
      let totalProcessed = 0;
      const processedFiles: string[] = [];

      for (const file of files) {
        // Check if it's an Excel file
        if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
          toast({
            title: "Invalid file type",
            description: `Skipping ${file.name} - Please upload Excel files only (.xlsx or .xls)`,
            variant: "destructive",
          });
          continue;
        }

        console.log(`Processing file: ${file.name}`);
        const { date, data } = await parseMonthlyExcelFile(file);
        
        saveMonthlyData(date, data, file.name);
        totalProcessed += data.length;
        processedFiles.push(file.name);
        
        console.log(`Processed ${file.name} for ${date}: ${data.length} records`);
      }

      setUploadedFiles(prev => [...prev, ...processedFiles]);
      
      toast({
        title: "Files uploaded successfully",
        description: `Processed ${processedFiles.length} files with ${totalProcessed} total investor records`,
      });
      
      onDataLoaded();
      
    } catch (error) {
      console.error("Error uploading files:", error);
      toast({
        title: "Error uploading files",
        description: "There was an error processing your files. Please check the format and try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleExportExcel = async () => {
    try {
      await exportToExcel();
      toast({
        title: "Excel exported",
        description: "Your investor data has been downloaded as Excel with color formatting",
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: "There was an error exporting to Excel",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex items-center space-x-4">
      <Input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFileUpload}
        className="hidden"
        multiple
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
        onClick={handleExportExcel}
        variant="outline"
        size="sm"
      >
        <FileSpreadsheet className="w-4 h-4 mr-2" />
        Export Excel
      </Button>
      
      {uploadedFiles.length > 0 && (
        <span className="text-sm text-green-600">
          ✓ {uploadedFiles.length} file(s) uploaded
        </span>
      )}
    </div>
  );
}
