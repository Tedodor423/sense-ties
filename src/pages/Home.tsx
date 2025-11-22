import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Layout } from '@/components/Layout';

export default function Home() {
  const { user } = useAuth();

  return (
    <Layout>
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-5xl font-heading font-bold mb-6 text-foreground">
            Welcome to SenseTies
          </h1>
          <p className="text-xl text-muted-foreground mb-12 leading-relaxed">
            SenseTies helps parents, teachers, and clinicians understand and track children's meltdown patterns 
            in a compassionate, data-driven way. By recording environmental triggers and meltdown intensity, 
            we can work together to create calmer, more supportive environments for children.
          </p>

          {user ? (
            <Link to="/dashboard">
              <Button size="lg" className="text-lg px-8 py-6 rounded-2xl shadow-lg hover:shadow-xl transition-all">
                Go to Dashboard
              </Button>
            </Link>
          ) : (
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/login">
                <Button size="lg" className="text-lg px-8 py-6 rounded-2xl shadow-lg hover:shadow-xl transition-all">
                  Login
                </Button>
              </Link>
              <Link to="/register">
                <Button size="lg" variant="outline" className="text-lg px-8 py-6 rounded-2xl border-2 hover:bg-muted transition-all">
                  Register
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
