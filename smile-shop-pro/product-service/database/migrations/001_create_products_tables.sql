-- Migration: Create products tables and related structures
-- Version: 1.0.0
-- Description: Initial product catalog schema

-- Create custom types
CREATE TYPE product_status AS ENUM ('active', 'inactive', 'discontinued', 'out_of_stock');
CREATE TYPE product_category AS ENUM ('equipment', 'instruments', 'consumables', 'medication', 'supplies');

-- Categories table
CREATE TABLE categories (
    category_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    parent_category_id UUID REFERENCES categories(category_id),
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Products table
CREATE TABLE products (
    product_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    short_description VARCHAR(500),
    sku VARCHAR(100) UNIQUE NOT NULL,
    barcode VARCHAR(100),
    price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
    cost_price DECIMAL(10,2) CHECK (cost_price >= 0),
    compare_at_price DECIMAL(10,2) CHECK (compare_at_price >= 0),
    category_id UUID REFERENCES categories(category_id),
    brand VARCHAR(100),
    manufacturer VARCHAR(100),
    model VARCHAR(100),
    weight DECIMAL(8,3),
    dimensions VARCHAR(100),
    status product_status DEFAULT 'active',
    is_featured BOOLEAN DEFAULT false,
    is_digital BOOLEAN DEFAULT false,
    stock_quantity INTEGER DEFAULT 0 CHECK (stock_quantity >= 0),
    low_stock_threshold INTEGER DEFAULT 5 CHECK (low_stock_threshold >= 0),
    track_inventory BOOLEAN DEFAULT true,
    allow_backorders BOOLEAN DEFAULT false,
    seo_title VARCHAR(255),
    seo_description TEXT,
    seo_keywords TEXT[],
    images JSONB DEFAULT '[]',
    specifications JSONB DEFAULT '{}',
    tags TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT products_sku_format CHECK (sku ~ '^[A-Za-z0-9_-]+$'),
    CONSTRAINT products_price_positive CHECK (price >= 0),
    CONSTRAINT products_stock_positive CHECK (stock_quantity >= 0)
);

-- Product variants (for products with different sizes, colors, etc.)
CREATE TABLE product_variants (
    variant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    sku VARCHAR(100) NOT NULL,
    price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
    cost_price DECIMAL(10,2) CHECK (cost_price >= 0),
    stock_quantity INTEGER DEFAULT 0 CHECK (stock_quantity >= 0),
    attributes JSONB DEFAULT '{}', -- e.g., {"size": "Large", "color": "Blue"}
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT product_variants_unique_sku UNIQUE (product_id, sku)
);

-- Product images
CREATE TABLE product_images (
    image_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    alt_text VARCHAR(255),
    sort_order INTEGER DEFAULT 0,
    is_primary BOOLEAN DEFAULT false,
    width INTEGER,
    height INTEGER,
    file_size INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Product reviews
CREATE TABLE product_reviews (
    review_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    user_id UUID NOT NULL, -- References auth-service users table
    order_id UUID, -- References order-service orders table
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title VARCHAR(255),
    comment TEXT,
    is_verified_purchase BOOLEAN DEFAULT false,
    is_approved BOOLEAN DEFAULT true,
    helpful_votes INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Product inventory log (for audit trail)
CREATE TABLE inventory_log (
    log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(product_id) ON DELETE CASCADE,
    variant_id UUID REFERENCES product_variants(variant_id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL, -- 'stock_in', 'stock_out', 'adjustment', 'sale', 'return'
    quantity_change INTEGER NOT NULL,
    previous_quantity INTEGER,
    new_quantity INTEGER,
    reference_id UUID, -- Order ID, purchase order ID, etc.
    reference_type VARCHAR(50), -- 'order', 'purchase_order', 'manual_adjustment'
    notes TEXT,
    performed_by UUID, -- User who made the change
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Product search index (for full-text search)
CREATE TABLE product_search_index (
    product_id UUID PRIMARY KEY REFERENCES products(product_id) ON DELETE CASCADE,
    search_vector TSVECTOR,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_categories_parent ON categories(parent_category_id);
CREATE INDEX idx_categories_active ON categories(is_active);

CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_featured ON products(is_featured);
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_price ON products(price);
CREATE INDEX idx_products_stock ON products(stock_quantity);
CREATE INDEX idx_products_created ON products(created_at);
CREATE INDEX idx_products_search ON products(name, description);

CREATE INDEX idx_product_variants_product ON product_variants(product_id);
CREATE INDEX idx_product_variants_sku ON product_variants(sku);
CREATE INDEX idx_product_variants_active ON product_variants(is_active);

CREATE INDEX idx_product_images_product ON product_images(product_id);
CREATE INDEX idx_product_images_primary ON product_images(is_primary);

CREATE INDEX idx_product_reviews_product ON product_reviews(product_id);
CREATE INDEX idx_product_reviews_rating ON product_reviews(rating);
CREATE INDEX idx_product_reviews_approved ON product_reviews(is_approved);

CREATE INDEX idx_inventory_log_product ON inventory_log(product_id);
CREATE INDEX idx_inventory_log_action ON inventory_log(action);
CREATE INDEX idx_inventory_log_created ON inventory_log(created_at);

-- Full-text search index
CREATE INDEX idx_product_search_vector ON product_search_index USING GIN(search_vector);

-- Create updated_at trigger function (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_product_variants_updated_at BEFORE UPDATE ON product_variants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_product_reviews_updated_at BEFORE UPDATE ON product_reviews FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger to update search index when products change
CREATE OR REPLACE FUNCTION update_product_search_index()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO product_search_index (product_id, search_vector)
    VALUES (
        COALESCE(NEW.product_id, OLD.product_id),
        to_tsvector('english',
            COALESCE(NEW.name, OLD.name) || ' ' ||
            COALESCE(NEW.description, OLD.description) || ' ' ||
            COALESCE(NEW.short_description, '') || ' ' ||
            COALESCE(array_to_string(NEW.tags, ' '), '') || ' ' ||
            COALESCE(NEW.brand, '') || ' ' ||
            COALESCE(NEW.manufacturer, '') || ' ' ||
            COALESCE(NEW.seo_keywords::text, '')
        )
    )
    ON CONFLICT (product_id)
    DO UPDATE SET
        search_vector = EXCLUDED.search_vector,
        updated_at = NOW();

    RETURN COALESCE(NEW, OLD);
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_update_product_search
    AFTER INSERT OR UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_product_search_index();

-- Trigger for inventory logging
CREATE OR REPLACE FUNCTION log_inventory_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Only log if quantity actually changed
    IF (TG_OP = 'UPDATE' AND OLD.stock_quantity IS DISTINCT FROM NEW.stock_quantity) THEN
        INSERT INTO inventory_log (
            product_id,
            action,
            quantity_change,
            previous_quantity,
            new_quantity,
            performed_by
        ) VALUES (
            NEW.product_id,
            'adjustment',
            NEW.stock_quantity - OLD.stock_quantity,
            OLD.stock_quantity,
            NEW.stock_quantity,
            NULL -- Will be set by application
        );
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_log_inventory_changes
    AFTER UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION log_inventory_change();

-- Row Level Security (RLS) - Enable for production
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_reviews ENABLE ROW LEVEL SECURITY;

-- RLS Policies (basic - can be enhanced based on business requirements)
CREATE POLICY "Categories are viewable by everyone" ON categories FOR SELECT USING (is_active = true);
CREATE POLICY "Products are viewable by everyone" ON products FOR SELECT USING (status = 'active');
CREATE POLICY "Product reviews are viewable by everyone" ON product_reviews FOR SELECT USING (is_approved = true);

-- Insert sample categories
INSERT INTO categories (name, description, sort_order) VALUES
    ('Dental Equipment', 'Professional dental chairs, units, and major equipment', 1),
    ('Dental Instruments', 'Hand instruments, tools, and accessories', 2),
    ('Imaging Equipment', 'X-ray systems, scanners, and imaging devices', 3),
    ('Sterilization', 'Autoclaves, sterilizers, and disinfection equipment', 4),
    ('Consumables', 'Disposable items and consumable supplies', 5),
    ('Medications', 'Pharmaceutical products and medications', 6),
    ('Supplies', 'General medical and office supplies', 7);

-- Insert sample products
INSERT INTO products (name, description, sku, price, category_id, brand, stock_quantity, status, is_featured) VALUES
    (
        'Professional Dental Chair Deluxe',
        'High-quality dental treatment chair with LED lighting, adjustable positioning, and ergonomic design for maximum patient comfort.',
        'DC-DELUXE-001',
        3499.99,
        (SELECT category_id FROM categories WHERE name = 'Dental Equipment'),
        'MediChair',
        5,
        'active',
        true
    ),
    (
        'Digital Dental X-Ray System Pro',
        'Advanced digital dental X-ray system with high-resolution imaging, instant results, and minimal radiation exposure.',
        'DX-PRO-002',
        8999.99,
        (SELECT category_id FROM categories WHERE name = 'Imaging Equipment'),
        'RadTech',
        2,
        'active',
        true
    ),
    (
        'Professional Dental Instrument Set',
        'Complete set of surgical-grade stainless steel dental instruments including forceps, elevators, and probes.',
        'DI-PROSET-003',
        299.99,
        (SELECT category_id FROM categories WHERE name = 'Dental Instruments'),
        'SteelDent',
        25,
        'active',
        false
    ),
    (
        'Medical Grade Autoclave',
        'Class B autoclave for sterilization of dental instruments with 18L capacity and multiple sterilization cycles.',
        'AUTO-MED-004',
        1899.99,
        (SELECT category_id FROM categories WHERE name = 'Sterilization'),
        'SterilMax',
        8,
        'active',
        false
    );

-- Insert sample product images
INSERT INTO product_images (product_id, url, alt_text, sort_order, is_primary)
SELECT
    p.product_id,
    'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=800',
    p.name,
    0,
    true
FROM products p;

-- Insert additional product images
INSERT INTO product_images (product_id, url, alt_text, sort_order, is_primary)
SELECT
    p.product_id,
    'https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=800',
    p.name || ' - Side View',
    1,
    false
FROM products p;
