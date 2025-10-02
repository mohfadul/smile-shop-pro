import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Package, ShoppingBag, Users } from "lucide-react";

const Dashboard = () => {
  const stats = [
    {
      title: "Total Revenue",
      value: "$45,231.89",
      change: "+20.1% from last month",
      icon: DollarSign,
      color: "text-primary"
    },
    {
      title: "Orders",
      value: "+2,350",
      change: "+180.1% from last month",
      icon: ShoppingBag,
      color: "text-primary"
    },
    {
      title: "Products",
      value: "+234",
      change: "+19% from last month",
      icon: Package,
      color: "text-primary"
    },
    {
      title: "Active Customers",
      value: "+573",
      change: "+201 since last month",
      icon: Users,
      color: "text-primary"
    },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back! Here's what's happening today.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title} className="hover:shadow-card-hover transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <Icon className={`h-4 w-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stat.change}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center justify-between border-b pb-4 last:border-0">
                  <div>
                    <p className="font-medium">Order #{1000 + i}</p>
                    <p className="text-sm text-muted-foreground">2 items</p>
                  </div>
                  <span className="text-sm font-medium">$299.99</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Low Stock Alert</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { name: "Dental Mirror", stock: 5 },
                { name: "Disposable Gloves", stock: 12 },
                { name: "Surgical Mask", stock: 8 },
              ].map((item) => (
                <div key={item.name} className="flex items-center justify-between border-b pb-4 last:border-0">
                  <p className="font-medium">{item.name}</p>
                  <span className="text-sm text-destructive font-medium">
                    {item.stock} left
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
