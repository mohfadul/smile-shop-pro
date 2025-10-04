import { Link } from "react-router-dom";
import { ShoppingCart, User, Search, LogOut, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import logo from "@/assets/logo-full.jpg";
import { useAuth } from "@/hooks/use-auth";

const Navbar = () => {
  const { user, isAuthenticated, signOut, isLoading } = useAuth();

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Sign out failed:', error);
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center space-x-2">
          <img src={logo} alt="Khalid Dqash Medical" className="h-10 w-auto" />
        </Link>

        <nav className="hidden md:flex items-center space-x-6 text-sm font-medium">
          <Link to="/products" className="transition-colors hover:text-dental-primary">
            Products
          </Link>
          <Link to="/categories" className="transition-colors hover:text-dental-primary">
            Categories
          </Link>
          <Link to="/about" className="transition-colors hover:text-dental-primary">
            About Us
          </Link>
          <Link to="/contact" className="transition-colors hover:text-dental-primary">
            Contact
          </Link>
        </nav>

        <div className="flex items-center space-x-4">
          <div className="hidden lg:flex items-center space-x-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input 
              type="search" 
              placeholder="Search products..." 
              className="w-64"
            />
          </div>
          
          {/* Shopping Cart */}
          <Button variant="ghost" size="icon" asChild>
            <Link to="/">
              <ShoppingCart className="h-5 w-5" />
              <Badge variant="secondary" className="absolute -top-1 -right-1 h-5 w-5 p-0 text-xs">
                0
              </Badge>
              <span className="sr-only">Shopping Cart</span>
            </Link>
          </Button>

          {isAuthenticated ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                  <User className="h-5 w-5" />
                  <span className="sr-only">User menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">{user?.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {user?.user_metadata?.full_name || 'User'}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/admin" className="flex items-center">
                    <Settings className="mr-2 h-4 w-4" />
                    Admin
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleSignOut}
                  disabled={isLoading}
                  className="flex items-center text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  {isLoading ? 'Signing out...' : 'Sign out'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button variant="ghost" size="icon" asChild>
              <Link to="/auth">
                <User className="h-5 w-5" />
                <span className="sr-only">Account</span>
              </Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
};

export default Navbar;
