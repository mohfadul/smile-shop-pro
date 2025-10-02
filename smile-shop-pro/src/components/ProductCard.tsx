import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShoppingCart } from "lucide-react";
import { Link } from "react-router-dom";

interface ProductCardProps {
  id: string;
  name: string;
  price: number;
  image?: string;
  category?: string;
  stock_quantity?: number;
  is_featured?: boolean;
  status?: string;
}

const ProductCard = ({ id, name, price, image, category, stock_quantity = 0, is_featured = false, status = 'active' }: ProductCardProps) => {
  // Get primary image or fallback
  const displayImage = image || "https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=500";

  // Determine if product is available
  const isAvailable = status === 'active' && stock_quantity > 0;
  const isLowStock = stock_quantity > 0 && stock_quantity <= 5;

  return (
    <Card className="group overflow-hidden transition-all duration-300 hover:shadow-dental animate-scale-in">
      <Link to={`/products/${id}`}>
        <div className="relative aspect-square overflow-hidden bg-dental-light">
          <img
            src={displayImage}
            alt={name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
          />

          {/* Featured badge */}
          {is_featured && (
            <div className="absolute top-2 left-2">
              <span className="inline-flex items-center rounded-full bg-yellow-500 px-3 py-1 text-xs font-medium text-white">
                Featured
              </span>
            </div>
          )}

          {/* Stock status badge */}
          <div className="absolute top-2 right-2">
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
              isAvailable
                ? 'bg-green-500 text-white'
                : stock_quantity === 0
                  ? 'bg-red-500 text-white'
                  : 'bg-yellow-500 text-white'
            }`}>
              {stock_quantity === 0 ? 'Out of Stock' : isLowStock ? 'Low Stock' : 'In Stock'}
            </span>
          </div>

          {/* Category badge */}
          {category && (
            <div className="absolute bottom-2 left-2">
              <span className="inline-flex items-center rounded-full bg-primary/90 backdrop-blur-sm px-2 py-1 text-xs font-medium text-primary-foreground">
                {category}
              </span>
            </div>
          )}
        </div>
      </Link>

      <CardContent className="p-4">
        <Link to={`/products/${id}`}>
          <h3 className="font-semibold text-lg mb-2 line-clamp-2 hover:text-primary transition-colors">
            {name}
          </h3>
        </Link>

        <div className="flex items-center justify-between mb-2">
          <p className="text-2xl font-bold text-primary">
            ${price.toFixed(2)}
          </p>

          {/* Stock indicator */}
          <div className="text-xs text-muted-foreground">
            {stock_quantity > 0 ? `${stock_quantity} in stock` : 'Out of stock'}
          </div>
        </div>
      </CardContent>

      <CardFooter className="p-4 pt-0">
        <Button
          className="w-full group"
          size="sm"
          disabled={!isAvailable}
        >
          <ShoppingCart className="mr-2 h-4 w-4 transition-transform group-hover:scale-110" />
          {isAvailable ? 'Add to Cart' : stock_quantity === 0 ? 'Out of Stock' : 'Low Stock'}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default ProductCard;
