import ProductCard from "./ProductCard";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

// Mock data - will be replaced with real data from Supabase
const featuredProducts = [
  {
    id: "1",
    name: "Professional Dental Chair",
    price: 2499.99,
    image: "https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=500",
    category: "Equipment"
  },
  {
    id: "2",
    name: "Digital X-Ray System",
    price: 4999.99,
    image: "https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=500",
    category: "Imaging"
  },
  {
    id: "3",
    name: "Dental Instruments Set",
    price: 299.99,
    image: "https://images.unsplash.com/photo-1606811841689-23dfddce3e95?w=500",
    category: "Instruments"
  },
  {
    id: "4",
    name: "Autoclave Sterilizer",
    price: 1899.99,
    image: "https://images.unsplash.com/photo-1584820927498-cfe5211fd8bf?w=500",
    category: "Sterilization"
  },
];

const FeaturedProducts = () => {
  return (
    <section className="py-16 md:py-24">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between mb-12">
          <div>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-2">
              Featured Products
            </h2>
            <p className="text-muted-foreground text-lg">
              Premium quality equipment for your dental practice
            </p>
          </div>
          
          <Button variant="outline" className="hidden md:flex group" asChild>
            <Link to="/products">
              View All
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {featuredProducts.map((product) => (
            <ProductCard key={product.id} {...product} />
          ))}
        </div>

        <div className="mt-8 text-center md:hidden">
          <Button variant="outline" className="group" asChild>
            <Link to="/products">
              View All Products
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
};

export default FeaturedProducts;
