import { Link, Outlet, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { 
  LayoutDashboard, 
  Package, 
  ShoppingBag, 
  Users, 
  BarChart3,
  LogOut 
} from "lucide-react";
import logo from "@/assets/logo-icon.jpg";

const Admin = () => {
  const location = useLocation();
  
  const isActive = (path: string) => location.pathname === path;

  const navItems = [
    { path: "/admin", label: "Dashboard", icon: LayoutDashboard },
    { path: "/admin/products", label: "Products", icon: Package },
    { path: "/admin/orders", label: "Orders", icon: ShoppingBag },
    { path: "/admin/staff", label: "Staff", icon: Users },
    { path: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  ];

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-card flex flex-col">
        <div className="p-6 border-b">
          <Link to="/" className="flex items-center space-x-2">
            <img src={logo} alt="KD Medical" className="h-10 w-auto" />
            <span className="font-semibold text-lg">Admin Portal</span>
          </Link>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Button
                key={item.path}
                variant={isActive(item.path) ? "default" : "ghost"}
                className="w-full justify-start"
                asChild
              >
                <Link to={item.path}>
                  <Icon className="mr-2 h-4 w-4" />
                  {item.label}
                </Link>
              </Button>
            );
          })}
        </nav>

        <div className="p-4 border-t">
          <Button variant="outline" className="w-full justify-start" asChild>
            <Link to="/">
              <LogOut className="mr-2 h-4 w-4" />
              Back to Store
            </Link>
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
};

export default Admin;
