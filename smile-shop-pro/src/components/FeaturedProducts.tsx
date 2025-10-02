import ProductCard from "./ProductCard";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useProducts } from "@/hooks/use-products";
import { Skeleton } from "@/components/ui/skeleton";

const FeaturedProducts = () => {
  const { data: products, isLoading, error } = useProducts();

  // Show loading state
  if (isLoading) {
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
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="space-y-3">
                <Skeleton className="h-[200px] w-full rounded-lg" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  // Show error state
  if (error) {
    return (
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-destructive mb-2">
              Error Loading Products
            </h2>
            <p className="text-muted-foreground">
              Unable to load products at the moment. Please try again later.
            </p>
          </div>
        </div>
      </section>
    );
  }

  // Get featured products (first 4 or all if less than 4)
  const featuredProducts = products?.slice(0, 4) || [];

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
