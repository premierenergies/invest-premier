
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
  const [investorData, setInvestorData] = useState<any[]>([]);
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

    setIsUploading(true);

    try {
      const data = await parseExcelFile(file);
      
      setFileName(file.name);
      setInvestorData(data);
      
      toast({
        title: "Investor data loaded",
        description: `Loaded ${data.length} investor records with position data for both dates.`,
      });
      
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

  const handleProcessData = () => {
    if (investorData.length === 0) {
      toast({
        title: "Missing data",
        description: "Please upload an Excel file before processing.",
        variant: "destructive",
      });
      return;
    }

    saveInvestorsData(investorData);
    toast({
      title: "Data processed successfully",
      description: "Investor data has been processed and is ready for analysis.",
    });
    onDataLoaded();
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-sm border">
      <div className="flex flex-col items-center space-y-6">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-dashboard-teal bg-opacity-10">
          <Upload className="w-8 h-8 text-dashboard-teal" />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-dashboard-navy">Upload Investor Data</h2>
          <p className="text-dashboard-gray max-w-md mt-2">
            Upload an Excel file containing investor data with position information for both dates to analyze behavior trends.
          </p>
        </div>
        
        <div className="w-full max-w-md space-y-4">
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
            className="w-full bg-dashboard-teal hover:bg-dashboard-teal/80"
            disabled={isUploading}
          >
            {isUploading ? "Processing..." : "Select Excel File"}
          </Button>
          {fileName && (
            <p className="text-sm text-dashboard-gray text-center">
              ✓ {fileName} ({investorData.length} records)
            </p>
          )}
        </div>

        {/* Process Button */}
        {investorData.length > 0 && (
          <Button 
            onClick={handleProcessData}
            className="bg-green-600 hover:bg-green-700 text-white px-8 py-2"
          >
            Process Investor Data
          </Button>
        )}
      </div>
    </div>
  );
}
