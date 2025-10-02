-- =============================================================================
-- PRODUCT SERVICE DATABASE MIGRATION
-- Dental Store Sudan - Product Catalog & Inventory Management
-- Migration: 002_product_service_schema.sql
-- =============================================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For text search
CREATE EXTENSION IF NOT EXISTS "btree_gin"; -- For composite indexes

-- Create custom types for product management
DO $$ BEGIN
    CREATE TYPE product_status AS ENUM ('active', 'inactive', 'discontinued', 'out_of_stock', 'coming_soon');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE product_type AS ENUM ('equipment', 'consumable', 'instrument', 'material', 'software', 'service');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE stock_status AS ENUM ('in_stock', 'low_stock', 'out_of_stock', 'backordered', 'discontinued');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =============================================================================
-- CATEGORIES TABLE - Product categorization
-- =============================================================================
CREATE TABLE IF NOT EXISTS categories (
    category_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    parent_category_id UUID REFERENCES categories(category_id) ON DELETE SET NULL,
    image_url TEXT,
    icon VARCHAR(50), -- Font icon class
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    seo_title VARCHAR(200),
    seo_description TEXT,
    seo_keywords TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT categories_slug_format CHECK (slug ~ '^[a-z0-9-]+$'),
    CONSTRAINT categories_sort_order_positive CHECK (sort_order >= 0)
);

-- =============================================================================
-- BRANDS TABLE - Product brands/manufacturers
-- =============================================================================
CREATE TABLE IF NOT EXISTS brands (
    brand_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    logo_url TEXT,
    website_url TEXT,
    country VARCHAR(2), -- ISO country code
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT brands_slug_format CHECK (slug ~ '^[a-z0-9-]+$'),
    CONSTRAINT brands_country_format CHECK (country IS NULL OR country ~ '^[A-Z]{2}$')
);

-- =============================================================================
-- PRODUCTS TABLE - Main product catalog
-- =============================================================================
CREATE TABLE IF NOT EXISTS products (
    product_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(200) UNIQUE NOT NULL,
    short_description TEXT,
    description TEXT,
    category_id UUID NOT NULL REFERENCES categories(category_id) ON DELETE RESTRICT,
    brand_id UUID REFERENCES brands(brand_id) ON DELETE SET NULL,
    sku VARCHAR(100) UNIQUE NOT NULL,
    barcode VARCHAR(100),
    product_type product_type DEFAULT 'equipment',
    status product_status DEFAULT 'active',
    
    -- Pricing
    price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
    compare_at_price DECIMAL(10,2) CHECK (compare_at_price IS NULL OR compare_at_price >= price),
    cost_price DECIMAL(10,2) CHECK (cost_price IS NULL OR cost_price >= 0),
    currency VARCHAR(3) DEFAULT 'USD',
    
    -- Inventory
    stock_quantity INTEGER DEFAULT 0 CHECK (stock_quantity >= 0),
    reserved_quantity INTEGER DEFAULT 0 CHECK (reserved_quantity >= 0),
    low_stock_threshold INTEGER DEFAULT 10 CHECK (low_stock_threshold >= 0),
    track_inventory BOOLEAN DEFAULT true,
    allow_backorder BOOLEAN DEFAULT false,
    stock_status stock_status DEFAULT 'in_stock',
    
    -- Physical properties
    weight DECIMAL(8,3), -- in kg
    dimensions JSONB, -- {length, width, height} in cm
    
    -- SEO and metadata
    seo_title VARCHAR(200),
    seo_description TEXT,
    seo_keywords TEXT,
    featured BOOLEAN DEFAULT false,
    is_digital BOOLEAN DEFAULT false,
    requires_prescription BOOLEAN DEFAULT false,
    age_restriction INTEGER, -- minimum age
    
    -- Additional attributes
    attributes JSONB DEFAULT '{}', -- Custom attributes
    specifications JSONB DEFAULT '{}', -- Technical specifications
    tags TEXT[], -- Array of tags
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    published_at TIMESTAMP WITH TIME ZONE,
    discontinued_at TIMESTAMP WITH TIME ZONE,

    -- Constraints
    CONSTRAINT products_slug_format CHECK (slug ~ '^[a-z0-9-]+$'),
    CONSTRAINT products_currency_format CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT products_age_restriction_valid CHECK (age_restriction IS NULL OR age_restriction BETWEEN 0 AND 100)
);

-- =============================================================================
-- PRODUCT IMAGES TABLE - Product image management
-- =============================================================================
CREATE TABLE IF NOT EXISTS product_images (
    image_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    alt_text VARCHAR(200),
    title VARCHAR(200),
    sort_order INTEGER DEFAULT 0,
    is_primary BOOLEAN DEFAULT false,
    width INTEGER,
    height INTEGER,
    file_size INTEGER, -- in bytes
    file_format VARCHAR(10), -- jpg, png, webp, etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT product_images_sort_order_positive CHECK (sort_order >= 0),
    CONSTRAINT product_images_dimensions_positive CHECK (
        (width IS NULL OR width > 0) AND (height IS NULL OR height > 0)
    )
);

-- =============================================================================
-- PRODUCT VARIANTS TABLE - Product variations (size, color, etc.)
-- =============================================================================
CREATE TABLE IF NOT EXISTS product_variants (
    variant_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    sku VARCHAR(100) UNIQUE NOT NULL,
    barcode VARCHAR(100),
    
    -- Pricing (can override product pricing)
    price DECIMAL(10,2) CHECK (price IS NULL OR price >= 0),
    compare_at_price DECIMAL(10,2) CHECK (compare_at_price IS NULL OR compare_at_price >= price),
    cost_price DECIMAL(10,2) CHECK (cost_price IS NULL OR cost_price >= 0),
    
    -- Inventory
    stock_quantity INTEGER DEFAULT 0 CHECK (stock_quantity >= 0),
    reserved_quantity INTEGER DEFAULT 0 CHECK (reserved_quantity >= 0),
    low_stock_threshold INTEGER DEFAULT 10 CHECK (low_stock_threshold >= 0),
    
    -- Physical properties
    weight DECIMAL(8,3),
    dimensions JSONB,
    
    -- Variant options (color, size, etc.)
    options JSONB NOT NULL DEFAULT '{}', -- {color: 'red', size: 'large'}
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT product_variants_sort_order_positive CHECK (sort_order >= 0)
);

-- =============================================================================
-- PRODUCT REVIEWS TABLE - Customer reviews and ratings
-- =============================================================================
CREATE TABLE IF NOT EXISTS product_reviews (
    review_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    user_id UUID NOT NULL, -- References users table from auth service
    variant_id UUID REFERENCES product_variants(variant_id) ON DELETE SET NULL,
    
    -- Review content
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    title VARCHAR(200),
    content TEXT,
    
    -- Review metadata
    is_verified_purchase BOOLEAN DEFAULT false,
    is_approved BOOLEAN DEFAULT false,
    helpful_count INTEGER DEFAULT 0 CHECK (helpful_count >= 0),
    reported_count INTEGER DEFAULT 0 CHECK (reported_count >= 0),
    
    -- Response from store
    store_response TEXT,
    store_response_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- PRODUCT INVENTORY MOVEMENTS TABLE - Stock tracking
-- =============================================================================
CREATE TABLE IF NOT EXISTS inventory_movements (
    movement_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    variant_id UUID REFERENCES product_variants(variant_id) ON DELETE SET NULL,
    
    -- Movement details
    movement_type VARCHAR(20) NOT NULL, -- 'in', 'out', 'adjustment', 'reserved', 'unreserved'
    quantity INTEGER NOT NULL,
    previous_quantity INTEGER NOT NULL,
    new_quantity INTEGER NOT NULL,
    
    -- Reference information
    reference_type VARCHAR(50), -- 'order', 'purchase', 'adjustment', 'return'
    reference_id UUID, -- ID of the related record
    
    -- Additional details
    reason TEXT,
    cost_per_unit DECIMAL(10,2),
    notes TEXT,
    
    -- User who made the change
    created_by UUID, -- References users table
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT inventory_movements_type_valid CHECK (
        movement_type IN ('in', 'out', 'adjustment', 'reserved', 'unreserved', 'damaged', 'expired')
    ),
    CONSTRAINT inventory_movements_reference_type_valid CHECK (
        reference_type IS NULL OR reference_type IN ('order', 'purchase', 'adjustment', 'return', 'transfer', 'damage', 'expiry')
    )
);

-- =============================================================================
-- PRODUCT COLLECTIONS TABLE - Curated product collections
-- =============================================================================
CREATE TABLE IF NOT EXISTS product_collections (
    collection_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    image_url TEXT,
    is_active BOOLEAN DEFAULT true,
    is_featured BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    
    -- SEO
    seo_title VARCHAR(200),
    seo_description TEXT,
    
    -- Conditions for automatic inclusion
    conditions JSONB, -- Rules for automatic product inclusion
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT product_collections_slug_format CHECK (slug ~ '^[a-z0-9-]+$')
);

-- =============================================================================
-- COLLECTION PRODUCTS TABLE - Many-to-many relationship
-- =============================================================================
CREATE TABLE IF NOT EXISTS collection_products (
    collection_id UUID NOT NULL REFERENCES product_collections(collection_id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    sort_order INTEGER DEFAULT 0,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    PRIMARY KEY (collection_id, product_id)
);

-- =============================================================================
-- PRODUCT ATTRIBUTES TABLE - Dynamic product attributes
-- =============================================================================
CREATE TABLE IF NOT EXISTS product_attributes (
    attribute_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(100) UNIQUE NOT NULL,
    type VARCHAR(20) NOT NULL DEFAULT 'text', -- 'text', 'number', 'boolean', 'select', 'multiselect'
    options JSONB, -- For select/multiselect types
    is_required BOOLEAN DEFAULT false,
    is_filterable BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT product_attributes_type_valid CHECK (
        type IN ('text', 'number', 'boolean', 'select', 'multiselect', 'date', 'url')
    )
);

-- =============================================================================
-- PRODUCT ATTRIBUTE VALUES TABLE - Attribute values for products
-- =============================================================================
CREATE TABLE IF NOT EXISTS product_attribute_values (
    product_id UUID NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    attribute_id UUID NOT NULL REFERENCES product_attributes(attribute_id) ON DELETE CASCADE,
    value JSONB NOT NULL, -- Flexible value storage
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    PRIMARY KEY (product_id, attribute_id)
);

-- =============================================================================
-- INDEXES for performance optimization
-- =============================================================================

-- Categories indexes
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_category_id);
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_is_active ON categories(is_active);
CREATE INDEX IF NOT EXISTS idx_categories_sort_order ON categories(sort_order);

-- Brands indexes
CREATE INDEX IF NOT EXISTS idx_brands_slug ON brands(slug);
CREATE INDEX IF NOT EXISTS idx_brands_is_active ON brands(is_active);

-- Products indexes
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_brand_id ON products(brand_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_featured ON products(featured);
CREATE INDEX IF NOT EXISTS idx_products_price ON products(price);
CREATE INDEX IF NOT EXISTS idx_products_stock_status ON products(stock_status);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at);
CREATE INDEX IF NOT EXISTS idx_products_published_at ON products(published_at);

-- Full-text search index for products
CREATE INDEX IF NOT EXISTS idx_products_search ON products USING gin(
    to_tsvector('english', name || ' ' || COALESCE(description, '') || ' ' || COALESCE(seo_keywords, ''))
);

-- Tags search index
CREATE INDEX IF NOT EXISTS idx_products_tags ON products USING gin(tags);

-- Product images indexes
CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_product_images_is_primary ON product_images(is_primary);
CREATE INDEX IF NOT EXISTS idx_product_images_sort_order ON product_images(sort_order);

-- Product variants indexes
CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_sku ON product_variants(sku);
CREATE INDEX IF NOT EXISTS idx_product_variants_is_active ON product_variants(is_active);

-- Product reviews indexes
CREATE INDEX IF NOT EXISTS idx_product_reviews_product_id ON product_reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_product_reviews_user_id ON product_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_product_reviews_rating ON product_reviews(rating);
CREATE INDEX IF NOT EXISTS idx_product_reviews_is_approved ON product_reviews(is_approved);
CREATE INDEX IF NOT EXISTS idx_product_reviews_created_at ON product_reviews(created_at);

-- Inventory movements indexes
CREATE INDEX IF NOT EXISTS idx_inventory_movements_product_id ON inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_variant_id ON inventory_movements(variant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_type ON inventory_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_reference ON inventory_movements(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_created_at ON inventory_movements(created_at);

-- Collections indexes
CREATE INDEX IF NOT EXISTS idx_product_collections_slug ON product_collections(slug);
CREATE INDEX IF NOT EXISTS idx_product_collections_is_active ON product_collections(is_active);
CREATE INDEX IF NOT EXISTS idx_product_collections_is_featured ON product_collections(is_featured);

-- Collection products indexes
CREATE INDEX IF NOT EXISTS idx_collection_products_collection_id ON collection_products(collection_id);
CREATE INDEX IF NOT EXISTS idx_collection_products_product_id ON collection_products(product_id);

-- Product attributes indexes
CREATE INDEX IF NOT EXISTS idx_product_attributes_slug ON product_attributes(slug);
CREATE INDEX IF NOT EXISTS idx_product_attributes_type ON product_attributes(type);
CREATE INDEX IF NOT EXISTS idx_product_attributes_is_filterable ON product_attributes(is_filterable);

-- Product attribute values indexes
CREATE INDEX IF NOT EXISTS idx_product_attribute_values_product_id ON product_attribute_values(product_id);
CREATE INDEX IF NOT EXISTS idx_product_attribute_values_attribute_id ON product_attribute_values(attribute_id);
CREATE INDEX IF NOT EXISTS idx_product_attribute_values_value ON product_attribute_values USING gin(value);

-- =============================================================================
-- TRIGGERS for automatic updates
-- =============================================================================

-- Update stock status based on quantity
CREATE OR REPLACE FUNCTION update_stock_status()
RETURNS TRIGGER AS $$
BEGIN
    -- Update stock status based on quantity
    IF NEW.stock_quantity <= 0 THEN
        NEW.stock_status = 'out_of_stock';
    ELSIF NEW.stock_quantity <= NEW.low_stock_threshold THEN
        NEW.stock_status = 'low_stock';
    ELSE
        NEW.stock_status = 'in_stock';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_stock_status
    BEFORE INSERT OR UPDATE OF stock_quantity, low_stock_threshold ON products
    FOR EACH ROW EXECUTE FUNCTION update_stock_status();

-- Update product updated_at timestamp
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_brands_updated_at BEFORE UPDATE ON brands
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_product_variants_updated_at BEFORE UPDATE ON product_variants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_product_reviews_updated_at BEFORE UPDATE ON product_reviews
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_product_collections_updated_at BEFORE UPDATE ON product_collections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- FUNCTIONS for common operations
-- =============================================================================

-- Function to get product with all related data
CREATE OR REPLACE FUNCTION get_product_details(p_product_id UUID)
RETURNS TABLE (
    product_id UUID,
    name VARCHAR(200),
    slug VARCHAR(200),
    description TEXT,
    category_name VARCHAR(100),
    brand_name VARCHAR(100),
    sku VARCHAR(100),
    price DECIMAL(10,2),
    stock_quantity INTEGER,
    stock_status stock_status,
    images JSONB,
    variants JSONB,
    attributes JSONB,
    avg_rating DECIMAL(3,2),
    review_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.product_id,
        p.name,
        p.slug,
        p.description,
        c.name as category_name,
        b.name as brand_name,
        p.sku,
        p.price,
        p.stock_quantity,
        p.stock_status,
        COALESCE(
            (SELECT json_agg(json_build_object(
                'image_id', pi.image_id,
                'url', pi.url,
                'alt_text', pi.alt_text,
                'is_primary', pi.is_primary
            ) ORDER BY pi.sort_order)
            FROM product_images pi WHERE pi.product_id = p.product_id),
            '[]'::json
        ) as images,
        COALESCE(
            (SELECT json_agg(json_build_object(
                'variant_id', pv.variant_id,
                'name', pv.name,
                'sku', pv.sku,
                'price', pv.price,
                'stock_quantity', pv.stock_quantity,
                'options', pv.options
            ) ORDER BY pv.sort_order)
            FROM product_variants pv WHERE pv.product_id = p.product_id AND pv.is_active = true),
            '[]'::json
        ) as variants,
        COALESCE(
            (SELECT json_object_agg(pa.name, pav.value)
            FROM product_attribute_values pav
            JOIN product_attributes pa ON pav.attribute_id = pa.attribute_id
            WHERE pav.product_id = p.product_id),
            '{}'::json
        ) as attributes,
        COALESCE(
            (SELECT ROUND(AVG(rating::numeric), 2)
            FROM product_reviews pr WHERE pr.product_id = p.product_id AND pr.is_approved = true),
            0
        ) as avg_rating,
        COALESCE(
            (SELECT COUNT(*)::integer
            FROM product_reviews pr WHERE pr.product_id = p.product_id AND pr.is_approved = true),
            0
        ) as review_count
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.category_id
    LEFT JOIN brands b ON p.brand_id = b.brand_id
    WHERE p.product_id = p_product_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update inventory
CREATE OR REPLACE FUNCTION update_inventory(
    p_product_id UUID,
    p_variant_id UUID DEFAULT NULL,
    p_movement_type VARCHAR(20),
    p_quantity INTEGER,
    p_reference_type VARCHAR(50) DEFAULT NULL,
    p_reference_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    current_stock INTEGER;
    new_stock INTEGER;
BEGIN
    -- Get current stock
    IF p_variant_id IS NOT NULL THEN
        SELECT stock_quantity INTO current_stock
        FROM product_variants
        WHERE variant_id = p_variant_id;
    ELSE
        SELECT stock_quantity INTO current_stock
        FROM products
        WHERE product_id = p_product_id;
    END IF;
    
    -- Calculate new stock
    CASE p_movement_type
        WHEN 'in' THEN new_stock := current_stock + p_quantity;
        WHEN 'out' THEN new_stock := current_stock - p_quantity;
        WHEN 'adjustment' THEN new_stock := p_quantity;
        ELSE new_stock := current_stock;
    END CASE;
    
    -- Ensure stock doesn't go negative
    IF new_stock < 0 THEN
        new_stock := 0;
    END IF;
    
    -- Update stock
    IF p_variant_id IS NOT NULL THEN
        UPDATE product_variants
        SET stock_quantity = new_stock
        WHERE variant_id = p_variant_id;
    ELSE
        UPDATE products
        SET stock_quantity = new_stock
        WHERE product_id = p_product_id;
    END IF;
    
    -- Log movement
    INSERT INTO inventory_movements (
        product_id, variant_id, movement_type, quantity,
        previous_quantity, new_quantity, reference_type,
        reference_id, reason, created_by
    ) VALUES (
        p_product_id, p_variant_id, p_movement_type, p_quantity,
        current_stock, new_stock, p_reference_type,
        p_reference_id, p_reason, p_created_by
    );
    
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- VIEWS for common queries
-- =============================================================================

-- View for product catalog with essential information
CREATE OR REPLACE VIEW product_catalog AS
SELECT 
    p.product_id,
    p.name,
    p.slug,
    p.short_description,
    p.sku,
    p.price,
    p.compare_at_price,
    p.stock_quantity,
    p.stock_status,
    p.featured,
    p.status,
    c.name as category_name,
    c.slug as category_slug,
    b.name as brand_name,
    b.slug as brand_slug,
    (SELECT url FROM product_images pi WHERE pi.product_id = p.product_id AND pi.is_primary = true LIMIT 1) as primary_image,
    COALESCE(
        (SELECT ROUND(AVG(rating::numeric), 1)
        FROM product_reviews pr WHERE pr.product_id = p.product_id AND pr.is_approved = true),
        0
    ) as avg_rating,
    COALESCE(
        (SELECT COUNT(*)::integer
        FROM product_reviews pr WHERE pr.product_id = p.product_id AND pr.is_approved = true),
        0
    ) as review_count,
    p.created_at,
    p.updated_at
FROM products p
LEFT JOIN categories c ON p.category_id = c.category_id
LEFT JOIN brands b ON p.brand_id = b.brand_id
WHERE p.status = 'active';

-- =============================================================================
-- INITIAL DATA SEEDING
-- =============================================================================

-- Create default categories
INSERT INTO categories (name, slug, description, sort_order) VALUES
('Dental Equipment', 'dental-equipment', 'Professional dental equipment and machinery', 1),
('Dental Instruments', 'dental-instruments', 'Hand instruments and tools', 2),
('Consumables', 'consumables', 'Disposable dental supplies', 3),
('Dental Materials', 'dental-materials', 'Restorative and impression materials', 4),
('Orthodontics', 'orthodontics', 'Orthodontic supplies and equipment', 5),
('Oral Surgery', 'oral-surgery', 'Surgical instruments and supplies', 6),
('Endodontics', 'endodontics', 'Root canal treatment supplies', 7),
('Periodontics', 'periodontics', 'Periodontal treatment supplies', 8),
('Prosthodontics', 'prosthodontics', 'Prosthetic dental supplies', 9),
('Dental Software', 'dental-software', 'Practice management and imaging software', 10)
ON CONFLICT (slug) DO NOTHING;

-- Create default brands
INSERT INTO brands (name, slug, description, country) VALUES
('3M ESPE', '3m-espe', 'Leading dental materials manufacturer', 'US'),
('Dentsply Sirona', 'dentsply-sirona', 'Global dental equipment and supplies', 'US'),
('Ivoclar Vivadent', 'ivoclar-vivadent', 'Innovative dental materials', 'LI'),
('Kerr Dental', 'kerr-dental', 'Dental restorative materials', 'US'),
('GC Corporation', 'gc-corporation', 'Japanese dental materials company', 'JP'),
('Ultradent', 'ultradent', 'Dental products and materials', 'US'),
('Shofu', 'shofu', 'Dental materials and equipment', 'JP'),
('Hu-Friedy', 'hu-friedy', 'Dental instruments manufacturer', 'US')
ON CONFLICT (slug) DO NOTHING;

-- Create default product attributes
INSERT INTO product_attributes (name, slug, type, is_filterable, sort_order) VALUES
('Material', 'material', 'select', true, 1),
('Size', 'size', 'select', true, 2),
('Color', 'color', 'select', true, 3),
('Sterilization Method', 'sterilization-method', 'multiselect', true, 4),
('Warranty Period', 'warranty-period', 'text', false, 5),
('Country of Origin', 'country-of-origin', 'select', true, 6),
('Certification', 'certification', 'multiselect', true, 7),
('Power Requirements', 'power-requirements', 'text', false, 8)
ON CONFLICT (slug) DO NOTHING;

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Product Service Database Migration Completed Successfully';
    RAISE NOTICE 'Created tables: categories, brands, products, product_images, product_variants, product_reviews, inventory_movements, product_collections, collection_products, product_attributes, product_attribute_values';
    RAISE NOTICE 'Created indexes, triggers, functions, and views';
    RAISE NOTICE 'Seeded initial categories, brands, and attributes';
    RAISE NOTICE 'Migration: 002_product_service_schema.sql - COMPLETED';
END $$;
