# Smile Shop Pro - Dental Equipment E-commerce

A modern React/TypeScript e-commerce application for dental and medical equipment with Supabase integration.

## 🚀 Features

- **Product Catalog**: Browse dental equipment and supplies with search and filtering
- **User Authentication**: Complete auth system with registration and login
- **Admin Dashboard**: Manage products, orders, and categories
- **Order Management**: Place and track orders
- **Responsive Design**: Works perfectly on all devices
- **Real-time Data**: Live updates with Supabase integration

## 🛠️ Technology Stack

- **Frontend**: React 18 + TypeScript + Vite
- **UI Framework**: shadcn/ui + Tailwind CSS
- **Backend**: Supabase (Database + Authentication)
- **State Management**: TanStack React Query
- **Forms**: React Hook Form + Zod validation

## 📋 Prerequisites

- Node.js 18+ and npm
- A Supabase project and account

## 🏗️ Setup Instructions

### 1. Clone and Install Dependencies

```bash
git clone <YOUR_GIT_URL>
cd smile-shop-pro
npm install
```

### 2. Set Up Supabase

1. **Create a Supabase Project**:
   - Go to [supabase.com](https://supabase.com) and create a new project
   - Wait for the project to be set up completely

2. **Get Your API Keys**:
   - Go to your project dashboard
   - Navigate to Settings > API
   - Copy your project URL and anon public key

3. **Configure Environment Variables**:
   ```bash
   # Your .env file should look like this:
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key-here
   ```

### 3. Set Up Database Schema

1. **Run the Database Migration**:
   - Go to your Supabase project dashboard
   - Navigate to the SQL Editor
   - Copy and paste the contents of `supabase/migrations/001_initial_schema.sql`
   - Run the SQL script

2. **Verify Tables Created**:
   The script creates these tables:
   - `categories` - Product categories
   - `products` - Product catalog
   - `profiles` - User profiles (extends auth.users)
   - `orders` - Purchase orders
   - `order_items` - Order line items

### 4. Start Development Server

```bash
npm run dev
```

Your application will be available at `http://localhost:8080`

## 📁 Project Structure

```
smile-shop-pro/
├── src/
│   ├── components/          # Reusable UI components
│   ├── hooks/              # Custom React hooks
│   │   ├── use-auth.ts     # Authentication hook
│   │   ├── use-products.ts # Product data hooks
│   │   └── use-orders.ts   # Order management hooks
│   ├── integrations/
│   │   └── supabase/       # Supabase configuration
│   │       ├── client.ts   # Supabase client setup
│   │       └── types.ts    # TypeScript database types
│   ├── pages/              # Route components
│   └── lib/                # Utility functions
├── supabase/
│   ├── migrations/         # Database schema files
│   └── config.toml         # Supabase project config
└── public/                 # Static assets
```

## 🔧 Supabase Integration

### Database Schema

The application uses these main tables:

- **Products**: Equipment, pricing, categories, stock
- **Categories**: Product categorization
- **Orders**: Purchase orders with status tracking
- **Order Items**: Individual items in orders
- **Profiles**: Extended user information

### Authentication

- Uses Supabase Auth for user management
- Automatic profile creation on user registration
- Row Level Security (RLS) policies for data protection

### Real-time Features

- Live product updates
- Real-time order status changes
- Automatic UI updates when data changes

## 🚀 Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## 🔒 Security Features

- Row Level Security on all tables
- User-based data access policies
- Secure API key storage in environment variables
- Authentication required for sensitive operations

## 📚 API Integration

The application uses these main hooks for data management:

- `useProducts()` - Fetch and manage products
- `useCategories()` - Get product categories
- `useAuth()` - Handle user authentication
- `useOrders()` - Manage order operations

## 🎨 Customization

### Adding New Products

Products are stored in Supabase and automatically appear in the UI. Add products through:
- Supabase dashboard (Table Editor)
- Admin panel (when implemented)
- Direct database insertion

### Styling

The app uses Tailwind CSS with shadcn/ui components. Customize:
- Colors: Modify `tailwind.config.ts`
- Components: Edit component files in `src/components/`
- Layout: Update page components in `src/pages/`

## 🚀 Deployment

### Deploy to Production

1. **Build the application**:
   ```bash
   npm run build
   ```

2. **Deploy to your hosting platform**:
   - The `dist/` folder contains the production build
   - Set up your environment variables on the hosting platform
   - Ensure Supabase credentials are properly configured

### Environment Variables for Production

Make sure these are set in your production environment:
```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-production-anon-key
```

## 🆘 Troubleshooting

### Common Issues

1. **"Products not loading"**:
   - Check if Supabase tables are created
   - Verify API keys are correct
   - Check browser console for errors

2. **"Authentication not working"**:
   - Ensure RLS policies are set up correctly
   - Check if user profiles table exists
   - Verify Supabase Auth configuration

3. **"Build errors"**:
   - Run `npm install` to ensure dependencies are up to date
   - Check for TypeScript errors in the console

### Getting Help

- Check the browser console for detailed error messages
- Verify your Supabase project is active and accessible
- Ensure all environment variables are correctly set

## 📄 License

This project is built with modern web technologies and follows best practices for security and performance.
