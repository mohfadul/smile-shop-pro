import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

const Hero = () => {
  return (
    <section className="relative overflow-hidden bg-gradient-hero py-20 md:py-32">
      <div className="absolute inset-0 bg-grid-white/10 bg-[size:20px_20px]" />
      
      <div className="container relative z-10 mx-auto px-4">
        <div className="mx-auto max-w-3xl text-center text-primary-foreground animate-fade-in">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl mb-6">
            Premium Dental Supplies
            <span className="block mt-2">For Your Practice</span>
          </h1>
          
          <p className="mx-auto mt-6 max-w-2xl text-lg sm:text-xl text-primary-foreground/90">
            Quality medical and dental equipment from Khalid Dqash Medical Company. 
            Trusted by professionals across the region.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="lg" 
              variant="secondary"
              className="group"
              asChild
            >
              <Link to="/products">
                Shop Now
                <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
            
            <Button 
              size="lg" 
              variant="outline"
              className="bg-white/10 border-white/20 hover:bg-white/20 text-white"
              asChild
            >
              <Link to="/about">
                Learn More
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
    </section>
  );
};

export default Hero;
