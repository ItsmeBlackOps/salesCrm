
import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye, EyeOff, Mail, Lock } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { LoadingOverlay } from '@/components/ui/loading-overlay';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';

export default function SignIn() {
  const { login, user } = useAuth();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });

  // Client-side throttling & soft CAPTCHA (no backend changes)
  const ATTEMPTS_KEY = 'login_attempts';
  const FAILURES_KEY = 'login_failures';
  const CAPTCHA_FLAG_KEY = 'login_captcha_required';
  const WINDOW_MS = 60_000; // 1 minute
  const MAX_ATTEMPTS_PER_WINDOW = 30; // acceptance criteria
  const FAILURE_THRESHOLD = 5; // soft captcha after 5 rapid failures

  const [captchaRequired, setCaptchaRequired] = useState<boolean>(() => {
    try { return localStorage.getItem(CAPTCHA_FLAG_KEY) === '1'; } catch { return false; }
  });
  const [captchaChecked, setCaptchaChecked] = useState(false);

  function loadTimes(key: string): number[] {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
  }
  function saveTimes(key: string, times: number[]) {
    try { localStorage.setItem(key, JSON.stringify(times)); } catch {}
  }
  function prune(times: number[], now = Date.now()) {
    const since = now - WINDOW_MS;
    return times.filter(t => (typeof t === 'number') && t >= since && t <= now);
  }
  function recordAttempt() {
    const now = Date.now();
    const arr = prune(loadTimes(ATTEMPTS_KEY), now);
    arr.push(now);
    saveTimes(ATTEMPTS_KEY, arr);
  }
  function recordFailure() {
    const now = Date.now();
    const arr = prune(loadTimes(FAILURES_KEY), now);
    arr.push(now);
    saveTimes(FAILURES_KEY, arr);
    if (arr.length >= FAILURE_THRESHOLD) {
      setCaptchaRequired(true);
      try { localStorage.setItem(CAPTCHA_FLAG_KEY, '1'); } catch {}
    }
  }
  function clearFailures() {
    try { localStorage.removeItem(FAILURES_KEY); } catch {}
    try { localStorage.removeItem(CAPTCHA_FLAG_KEY); } catch {}
    setCaptchaRequired(false);
    setCaptchaChecked(false);
  }
  function rateLimitStatus() {
    const now = Date.now();
    const arr = prune(loadTimes(ATTEMPTS_KEY), now);
    if (arr.length >= MAX_ATTEMPTS_PER_WINDOW) {
      const earliest = Math.min(...arr);
      const resetInMs = Math.max(0, WINDOW_MS - (now - earliest));
      return { blocked: true, resetInMs };
    }
    return { blocked: false, resetInMs: 0 };
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    // Client-side rate limiting
    const rl = rateLimitStatus();
    if (rl.blocked) {
      const secs = Math.ceil(rl.resetInMs / 1000);
      toast({ title: 'Too many attempts', description: `Try again in ${secs}s.`, variant: 'destructive' });
      return; // do not send request
    }

    if (captchaRequired && !captchaChecked) {
      toast({ title: 'Please verify', description: 'Confirm you are not a robot to continue.' });
      return; // do not send request until solved
    }

    try {
      setLoading(true);
      recordAttempt();
      await login(formData.email, formData.password);
      clearFailures();
    } catch (err) {
      // Always generic copy; no user enumeration
      setError('Invalid email or password');
      recordFailure();
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.name === 'email' ? e.target.value.toLowerCase() : e.target.value
    });
  };

  if (user) return <Navigate to="/" />;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative">
      {loading && <LoadingOverlay />}
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <div className="bg-primary rounded h-10 w-10 flex items-center justify-center text-white font-bold text-xl">
              P
            </div>
          </div>
          <CardTitle className="text-2xl text-center">Welcome back</CardTitle>
          <CardDescription className="text-center">
            Enter your credentials to access your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="Enter your email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={handleInputChange}
                  className="pl-10 pr-10"
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>

            {captchaRequired && (
              <div className="flex items-center space-x-2">
                <Checkbox id="human" checked={captchaChecked} onCheckedChange={(v) => setCaptchaChecked(Boolean(v))} />
                <Label htmlFor="human" className="text-sm">I am not a robot</Label>
              </div>
            )}

            {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing In...' : 'Sign In'}
            </Button>

          </form>
        </CardContent>
      </Card>
    </div>
  );
}
