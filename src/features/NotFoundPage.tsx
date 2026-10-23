import { Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import Globe from '@/components/ui/globe';

export interface NotFoundPageProps {
  title?: string;
  description?: string;
  onGoHome?: () => void;
}

export function NotFoundPage({
  title = '404 - Page Not Found',
  description = 'The page you are looking for does not exist or was moved.',
  onGoHome,
}: NotFoundPageProps) {
  const navigate = useNavigate();

  const handleGoHome = () => {
    if (onGoHome) {
      onGoHome();
      return;
    }

    try {
      navigate('/');
    } catch {
      window.location.href = '/';
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 sm:p-6 text-foreground transition-colors">
      <div className="w-full max-w-4xl rounded-[2rem] border border-card-border bg-card-bg p-6 sm:p-8 shadow-[0_20px_45px_-28px_rgba(0,0,0,0.18)] transition-colors dark:border-white/10 dark:bg-black/90 md:p-10">
        <div className="grid gap-6 sm:gap-8 md:grid-cols-[1.2fr_1fr] md:items-center">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-foreground/50">Error</p>
            <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">
              {title}
            </h1>
            <p className="mt-3 text-sm text-foreground/60 md:text-base leading-relaxed">
              {description}
            </p>
            <Button className="mt-6 sm:mt-7 w-full sm:w-auto" onClick={handleGoHome}>
              <Home className="mr-2 h-4 w-4 shrink-0" />
              Back to Home
            </Button>
          </div>
          <div className="flex justify-center overflow-hidden">
            <Globe className="mx-auto w-full max-w-[240px] xs:max-w-[280px] md:max-w-[320px] aspect-square" />
          </div>
        </div>
      </div>
    </div>
  );
}
