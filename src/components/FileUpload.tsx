
import { useState, useRef } from "react";
import { parseExcelFile, saveInvestorsData } from "@/utils/dataUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Upload } from "lucide-react";

interface FileUploadProps {
  onDataLoaded: () => void;
}

export default function FileUpload({ onDataLoaded }: FileUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check if it's an Excel file
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      toast({
        title: "Invalid file type",
        description: "Please upload an Excel file (.xlsx or .xls)",
        variant: "destructive",
      });
      return;
    }

    setFileName(file.name);
    setIsUploading(true);

    try {
      const data = await parseExcelFile(file);
      saveInvestorsData(data);
      toast({
        title: "Data loaded successfully",
        description: `Loaded ${data.length} investor records.`,
      });
      onDataLoaded();
    } catch (error) {
      console.error("Error uploading file:", error);
      toast({
        title: "Error uploading file",
        description: "There was an error processing your file. Please check the format and try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleButtonClick = () => {
    // Trigger the hidden file input when the button is clicked
    fileInputRef.current?.click();
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-sm border">
      <div className="flex flex-col items-center space-y-4">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-dashboard-teal bg-opacity-10">
          <Upload className="w-8 h-8 text-dashboard-teal" />
        </div>
        <h2 className="text-2xl font-bold text-dashboard-navy">Upload Investor Data</h2>
        <p className="text-dashboard-gray text-center max-w-md">
          Upload an Excel (.xlsx) file containing the top 100 investors data to begin analysis.
        </p>
        
        <div className="w-full max-w-sm mt-4">
          <Input
            id="file-upload"
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileUpload}
            className="hidden"
          />
          <div className="flex flex-col gap-2 items-center">
            <Button 
              type="button"
              onClick={handleButtonClick}
              className="w-full cursor-pointer bg-dashboard-teal hover:bg-dashboard-teal/80"
            >
              {isUploading ? "Processing..." : "Select Excel File"}
            </Button>
            {fileName && (
              <p className="text-sm text-dashboard-gray">
                Selected: {fileName}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
