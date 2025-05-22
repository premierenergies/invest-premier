
import Dashboard from "@/components/Dashboard";
import { useToast } from "@/components/ui/use-toast";
import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";

const Index = () => {
  const { toast } = useToast();

  // Show a welcome toast when the page loads
  useEffect(() => {
    toast({
      title: "Welcome to the Investor Analytics Dashboard",
      description: "Upload your Excel file to start analyzing investor behavior.",
    });
  }, [toast]);

  return (
    <div className="flex min-h-screen bg-muted/30">
      <Toaster position="top-right" />
      
      <div className="flex-1 space-y-4 p-4 md:p-8">
        <Dashboard />
        
        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>© 2025 Investor Analytics Dashboard. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
};

export default Index;
