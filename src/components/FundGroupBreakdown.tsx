
import { useState } from 'react';
import { Investor } from '@/types';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Eye } from 'lucide-react';

interface FundGroupBreakdownProps {
  fundGroup: Investor;
}

export default function FundGroupBreakdown({ fundGroup }: FundGroupBreakdownProps) {
  const [open, setOpen] = useState(false);

  if (!fundGroup.individualInvestors || fundGroup.individualInvestors.length <= 1) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
          <Eye className="h-3 w-3" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{fundGroup.name} - Individual Investors</DialogTitle>
          <DialogDescription>
            Breakdown of {fundGroup.individualInvestors.length} individual investors in this fund group
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Investor Name</TableHead>
                <TableHead className="text-right">Bought</TableHead>
                <TableHead className="text-right">Sold</TableHead>
                <TableHead className="text-right">Net Change</TableHead>
                <TableHead className="text-right">% to Equity</TableHead>
                <TableHead>Category</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fundGroup.individualInvestors.map((investor, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">{investor.name}</TableCell>
                  <TableCell className="text-right">{investor.boughtOn18.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{investor.soldOn25.toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <span className={
                      (investor.netChange || 0) > 0 
                        ? "text-green-600" 
                        : (investor.netChange || 0) < 0 
                          ? "text-red-600" 
                          : ""
                    }>
                      {(investor.netChange || 0).toLocaleString()}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">{investor.percentToEquity.toFixed(2)}%</TableCell>
                  <TableCell>
                    <span className="px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
                      {investor.category}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
