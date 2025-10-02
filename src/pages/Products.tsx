import { useState, useMemo } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ProductCard from "@/components/ProductCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, SlidersHorizontal, Loader2, AlertCircle } from "lucide-react";
import { useProducts, useCategories } from "@/hooks/useApi";
import { Alert, AlertDescription } from "@/components/ui/alert";

// Fallback data for development
const fallbackProducts = [
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
  {
    id: "5",
    name: "LED Curing Light",
    price: 399.99,
    image: "https://images.unsplash.com/photo-1606811841689-23dfddce3e95?w=500",
    category: "Equipment"
  },
  {
    id: "6",
    name: "Dental Loupes",
    price: 899.99,
    image: "https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=500",
    category: "Instruments"
  },
];

const Products = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  // Fetch products and categories from backend
  const { data: productsData, isLoading: productsLoading, error: productsError } = useProducts({
    search: searchQuery,
    category: selectedCategory !== "all" ? selectedCategory : undefined,
  });

  const { data: categoriesData, isLoading: categoriesLoading } = useCategories();

  // Use backend data or fallback to static data
  const products = productsData?.products || fallbackProducts;
  const categories = categoriesData?.categories || [
    { id: "equipment", name: "Equipment" },
    { id: "imaging", name: "Imaging" },
    { id: "instruments", name: "Instruments" },
    { id: "sterilization", name: "Sterilization" },
  ];

  // Filter products locally if backend filtering isn't available
  const filteredProducts = useMemo(() => {
    return products.filter((product: any) => {
      const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === "all" || 
        product.category.toLowerCase() === selectedCategory.toLowerCase();
      return matchesSearch && matchesCategory;
    });
  }, [products, searchQuery, selectedCategory]);

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      
      <main className="flex-1">
        <div className="bg-gradient-to-b from-dental-light to-background py-12">
          <div className="container mx-auto px-4">
            <h1 className="text-4xl md:text-5xl font-bold mb-4 animate-fade-in">
              Our Products
            </h1>
            <p className="text-muted-foreground text-lg animate-fade-in">
              Browse our complete catalog of dental and medical supplies
            </p>
          </div>
        </div>

        <div className="container mx-auto px-4 py-8">
          {/* Backend Connection Status */}
          {productsError && (
            <Alert className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Backend services unavailable. Showing demo data. 
                Error: {(productsError as Error).message}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col md:flex-row gap-4 mb-8">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search products..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                disabled={productsLoading}
              />
            </div>

            <Select value={selectedCategory} onValueChange={setSelectedCategory} disabled={categoriesLoading}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SlidersHorizontal className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((category: any) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button variant="outline">
              <SlidersHorizontal className="mr-2 h-4 w-4" />
              Filters
            </Button>
          </div>

          {/* Loading State */}
          {productsLoading && (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="ml-2">Loading products...</span>
            </div>
          )}

          {/* Products Grid */}
          {!productsLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredProducts.map((product: any) => (
                <ProductCard key={product.id} {...product} />
              ))}
            </div>
          )}

          {/* No Products Found */}
          {!productsLoading && filteredProducts.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No products found matching your criteria.</p>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Products;
