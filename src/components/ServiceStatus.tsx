/**
 * Service Status Component
 * Shows the status of backend microservices
 */

import { useServiceStatus } from "@/hooks/useApi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CheckCircle, XCircle, AlertCircle, Loader2, ChevronDown, RefreshCw } from "lucide-react";
import { useState } from "react";

const ServiceStatus = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { healthData, isLoading, allServicesHealthy, getServiceStatus } = useServiceStatus();

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'unhealthy':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'healthy':
        return <Badge variant="default" className="bg-green-500">Healthy</Badge>;
      case 'unhealthy':
        return <Badge variant="destructive">Unhealthy</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  return (
    <Card className="w-full">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : allServicesHealthy ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
                <CardTitle className="text-sm">Backend Services</CardTitle>
                {!isLoading && (
                  <Badge variant={allServicesHealthy ? "default" : "destructive"} className={allServicesHealthy ? "bg-green-500" : ""}>
                    {allServicesHealthy ? "All Online" : "Issues Detected"}
                  </Badge>
                )}
              </div>
              <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </div>
            <CardDescription>
              {isLoading 
                ? "Checking service status..." 
                : `${healthData?.filter(s => s.status === 'healthy').length || 0} of ${healthData?.length || 0} services online`
              }
            </CardDescription>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="ml-2">Checking services...</span>
              </div>
            ) : (
              <div className="space-y-3">
                {healthData?.map((service: any) => (
                  <div key={service.name} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center space-x-3">
                      {getStatusIcon(service.status)}
                      <div>
                        <p className="font-medium text-sm">{service.name}</p>
                        {service.error && (
                          <p className="text-xs text-muted-foreground">{service.error}</p>
                        )}
                      </div>
                    </div>
                    {getStatusBadge(service.status)}
                  </div>
                ))}
                
                <div className="flex justify-between items-center pt-2 border-t">
                  <p className="text-xs text-muted-foreground">
                    Last checked: {new Date().toLocaleTimeString()}
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => window.location.reload()}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Refresh
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

export default ServiceStatus;
