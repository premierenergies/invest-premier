
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
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [investorData, setInvestorData] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    console.log("File selected:", file.name);

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
      console.log("Starting file parsing...");
      const data = await parseExcelFile(file);
      console.log("Parsed data:", data.length, "records");
      
      setFileName(file.name);
      setInvestorData(data);
      
      toast({
        title: "File uploaded successfully",
        description: `Loaded ${data.length} investor records. Click "Process Data" to analyze.`,
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

    console.log("Starting data processing...");
    setIsProcessing(true);
    
    try {
      saveInvestorsData(investorData);
      console.log("Data saved to localStorage");
      
      toast({
        title: "Analysis complete",
        description: `Successfully analyzed ${investorData.length} investors with position changes between the two dates.`,
      });
      
      // Clear the upload state and trigger dashboard refresh
      setFileName(null);
      setInvestorData([]);
      console.log("Calling onDataLoaded callback");
      onDataLoaded();
    } catch (error) {
      console.error("Error processing data:", error);
      toast({
        title: "Processing failed",
        description: "There was an error processing the data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
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
            disabled={isUploading || isProcessing}
          >
            {isUploading ? "Processing..." : "Select Excel File"}
          </Button>
          {fileName && (
            <p className="text-sm text-dashboard-gray text-center">
              ✓ {fileName} ({investorData.length} records loaded)
            </p>
          )}
        </div>

        {/* Process Button */}
        {investorData.length > 0 && (
          <Button 
            onClick={handleProcessData}
            disabled={isProcessing}
            className="bg-green-600 hover:bg-green-700 text-white px-8 py-2"
          >
            {isProcessing ? "Processing..." : "Process & Analyze Data"}
          </Button>
        )}
      </div>
    </div>
  );
}
