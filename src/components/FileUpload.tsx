
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
  const [month1File, setMonth1File] = useState<string | null>(null);
  const [month2File, setMonth2File] = useState<string | null>(null);
  const [month1Data, setMonth1Data] = useState<any[]>([]);
  const [month2Data, setMonth2Data] = useState<any[]>([]);
  const month1InputRef = useRef<HTMLInputElement>(null);
  const month2InputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, monthType: 'month1' | 'month2') => {
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
      
      if (monthType === 'month1') {
        setMonth1File(file.name);
        setMonth1Data(data);
      } else {
        setMonth2File(file.name);
        setMonth2Data(data);
      }
      
      toast({
        title: `${monthType === 'month1' ? 'First' : 'Second'} month data loaded`,
        description: `Loaded ${data.length} investor records.`,
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
    if (month1Data.length === 0 || month2Data.length === 0) {
      toast({
        title: "Missing data",
        description: "Please upload both month files before processing.",
        variant: "destructive",
      });
      return;
    }

    saveInvestorsData(month1Data, month2Data);
    toast({
      title: "Data processed successfully",
      description: "Both months of data have been processed and are ready for analysis.",
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
          <h2 className="text-2xl font-bold text-dashboard-navy">Upload Monthly Investor Data</h2>
          <p className="text-dashboard-gray max-w-md mt-2">
            Upload two Excel files containing investor data from consecutive months to analyze behavior trends.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
          {/* Month 1 Upload */}
          <div className="space-y-3">
            <h3 className="font-semibold text-dashboard-navy">First Month Data</h3>
            <Input
              ref={month1InputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => handleFileUpload(e, 'month1')}
              className="hidden"
            />
            <Button 
              type="button"
              onClick={() => month1InputRef.current?.click()}
              className="w-full bg-dashboard-teal hover:bg-dashboard-teal/80"
              disabled={isUploading}
            >
              {isUploading ? "Processing..." : "Select First Month File"}
            </Button>
            {month1File && (
              <p className="text-sm text-dashboard-gray text-center">
                ✓ {month1File} ({month1Data.length} records)
              </p>
            )}
          </div>

          {/* Month 2 Upload */}
          <div className="space-y-3">
            <h3 className="font-semibold text-dashboard-navy">Second Month Data</h3>
            <Input
              ref={month2InputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => handleFileUpload(e, 'month2')}
              className="hidden"
            />
            <Button 
              type="button"
              onClick={() => month2InputRef.current?.click()}
              className="w-full bg-dashboard-teal hover:bg-dashboard-teal/80"
              disabled={isUploading}
            >
              {isUploading ? "Processing..." : "Select Second Month File"}
            </Button>
            {month2File && (
              <p className="text-sm text-dashboard-gray text-center">
                ✓ {month2File} ({month2Data.length} records)
              </p>
            )}
          </div>
        </div>

        {/* Process Button */}
        {month1Data.length > 0 && month2Data.length > 0 && (
          <Button 
            onClick={handleProcessData}
            className="bg-green-600 hover:bg-green-700 text-white px-8 py-2"
          >
            Process Monthly Comparison
          </Button>
        )}
      </div>
    </div>
  );
}
