import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShoppingCart } from "lucide-react";
import { Link } from "react-router-dom";

interface ProductCardProps {
  id: string;
  name: string;
  price: number;
  image: string;
  category: string;
}

const ProductCard = ({ id, name, price, image, category }: ProductCardProps) => {
  return (
    <Card className="group overflow-hidden transition-all duration-300 hover:shadow-dental animate-scale-in">
      <Link to={`/products/${id}`}>
        <div className="relative aspect-square overflow-hidden bg-dental-light">
          <img
            src={image}
            alt={name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
          />
          <div className="absolute top-2 right-2">
            <span className="inline-flex items-center rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
              {category}
            </span>
          </div>
        </div>
      </Link>

      <CardContent className="p-4">
        <Link to={`/products/${id}`}>
          <h3 className="font-semibold text-lg mb-2 line-clamp-2 hover:text-primary transition-colors">
            {name}
          </h3>
        </Link>
        <p className="text-2xl font-bold text-primary">
          ${price.toFixed(2)}
        </p>
      </CardContent>

      <CardFooter className="p-4 pt-0">
        <Button className="w-full group" size="sm">
          <ShoppingCart className="mr-2 h-4 w-4 transition-transform group-hover:scale-110" />
          Add to Cart
        </Button>
      </CardFooter>
    </Card>
  );
};

export default ProductCard;
