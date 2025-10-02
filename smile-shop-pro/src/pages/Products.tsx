import { useState, useMemo } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ProductCard from "@/components/ProductCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, SlidersHorizontal } from "lucide-react";
import { useProducts, useCategories } from "@/hooks/use-products";
import { Skeleton } from "@/components/ui/skeleton";

const Products = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const { data: products, isLoading: productsLoading, error: productsError } = useProducts();
  const { data: categories, isLoading: categoriesLoading } = useCategories();

  // Filter products based on search and category
  const filteredProducts = useMemo(() => {
    if (!products) return [];

    let filtered = products;

    // Filter by search query
    if (searchQuery.trim()) {
      filtered = filtered.filter(product =>
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Filter by category
    if (selectedCategory !== "all") {
      filtered = filtered.filter(product =>
        product.categories?.name.toLowerCase() === selectedCategory.toLowerCase()
      );
    }

    return filtered;
  }, [products, searchQuery, selectedCategory]);

  // Show loading state
  if (productsLoading || categoriesLoading) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navbar />

        <main className="flex-1">
          <div className="bg-gradient-to-b from-dental-light to-background py-12">
            <div className="container mx-auto px-4">
              <Skeleton className="h-12 w-64 mb-4" />
              <Skeleton className="h-6 w-96" />
            </div>
          </div>

          <div className="container mx-auto px-4 py-8">
            <div className="flex flex-col md:flex-row gap-4 mb-8">
              <Skeleton className="flex-1 h-10" />
              <Skeleton className="w-full md:w-[200px] h-10" />
              <Skeleton className="w-full md:w-[120px] h-10" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="space-y-3">
                  <Skeleton className="h-[200px] w-full rounded-lg" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ))}
            </div>
          </div>
        </main>

        <Footer />
      </div>
    );
  }

  // Show error state
  if (productsError) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navbar />

        <main className="flex-1">
          <div className="container mx-auto px-4 py-16 text-center">
            <h2 className="text-2xl font-bold text-destructive mb-2">
              Error Loading Products
            </h2>
            <p className="text-muted-foreground">
              Unable to load products at the moment. Please try again later.
            </p>
          </div>
        </main>

        <Footer />
      </div>
    );
  }

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
          <div className="flex flex-col md:flex-row gap-4 mb-8">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search products..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SlidersHorizontal className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories?.map((category) => (
                  <SelectItem key={category.category_id} value={category.name.toLowerCase()}>
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

          {filteredProducts.length === 0 ? (
            <div className="text-center py-16">
              <h3 className="text-lg font-semibold mb-2">No products found</h3>
              <p className="text-muted-foreground">
                Try adjusting your search or filter criteria.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product.product_id}
                  id={product.product_id}
                  name={product.name}
                  price={product.price}
                  image={product.images?.[0]?.url || "https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=500"}
                  category={product.categories?.name || "Equipment"}
                  stock_quantity={product.stock_quantity}
                  is_featured={product.is_featured}
                  status={product.status}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Products;
