import { Layout } from '@/components/Layout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Card, CardContent } from '@/components/ui/card';

export default function Insights() {
  return (
    <ProtectedRoute>
      <Layout>
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-3xl font-heading font-bold mb-8">Insights</h1>
          
          <Card className="rounded-2xl">
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                Insights functionality will be added soon. This page will display patterns and trends in meltdown data.
              </p>
            </CardContent>
          </Card>
        </div>
      </Layout>
    </ProtectedRoute>
  );
}
