import { Link } from "react-router-dom";
import { ShoppingCart, User, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import logo from "@/assets/logo-full.jpg";

const Navbar = () => {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center space-x-2">
          <img src={logo} alt="Khalid Dqash Medical" className="h-10 w-auto" />
        </Link>

        <nav className="hidden md:flex items-center space-x-6 text-sm font-medium">
          <Link to="/products" className="transition-colors hover:text-primary">
            Products
          </Link>
          <Link to="/categories" className="transition-colors hover:text-primary">
            Categories
          </Link>
          <Link to="/about" className="transition-colors hover:text-primary">
            About Us
          </Link>
          <Link to="/contact" className="transition-colors hover:text-primary">
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
          
          <Button variant="ghost" size="icon" asChild>
            <Link to="/cart">
              <ShoppingCart className="h-5 w-5" />
              <span className="sr-only">Shopping Cart</span>
            </Link>
          </Button>

          <Button variant="ghost" size="icon" asChild>
            <Link to="/auth">
              <User className="h-5 w-5" />
              <span className="sr-only">Account</span>
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
