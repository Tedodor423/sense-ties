import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Menu, ExternalLink } from 'lucide-react';
import logo from '@/assets/logo.svg';

import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user } = useAuth();
  const location = useLocation();

  const navLinks = [
    { to: '/dashboard', label: 'Dashboard', roles: ['Parent', 'Teacher', 'Clinician'] },
    { to: '/log-meltdown', label: 'Log an Event', roles: ['Parent', 'Teacher', 'Clinician'] },
    { to: '/insights', label: 'Insights', roles: ['Parent', 'Teacher', 'Clinician'] },
    { to: '/data', label: 'Data', roles: ['Clinician'] },
    { to: '/settings', label: 'Settings', roles: ['Parent', 'Teacher', 'Clinician'] },
  ];

  const visibleLinks = navLinks.filter(link => 
    !user || link.roles.includes(user.role)
  );

  const NavLinks = () => (
    <>
      {visibleLinks.map(link => (
        <Link key={link.to} to={link.to}>
          <Button
            variant={location.pathname === link.to ? 'default' : 'ghost'}
            className="w-full justify-start"
          >
            {link.label}
          </Button>
        </Link>
      ))}
    </>
  );

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-card shadow-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-3">
              <img src={logo} alt="SenseTies Logo" className="h-8 w-8" />
              <h1 className="text-2xl font-heading font-bold text-primary">SenseTies</h1>
            </Link>
            <Button variant="outline" size="sm" asChild className="hidden sm:flex">
              <a href="https://senseties.com" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                Public Page
              </a>
            </Button>
          </div>

          {user && (
            <>
              {/* Desktop Navigation */}
              <nav className="hidden md:flex items-center gap-2">
                <NavLinks />
              </nav>

              {/* Mobile Navigation */}
              <Sheet>
                <SheetTrigger asChild className="md:hidden">
                  <Button variant="ghost" size="icon">
                    <Menu className="h-6 w-6" />
                  </Button>
                </SheetTrigger>
                <SheetContent>
                  <nav className="flex flex-col gap-2 mt-8">
                    <NavLinks />
                  </nav>
                </SheetContent>
              </Sheet>
            </>
          )}
        </div>
      </header>

      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}
