import React, { useEffect, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Lock, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import ErrorState from '@/components/ErrorState';
import { Name } from '@/components/UserText';
import { errorMessage } from '@/lib/format';
import {
  DEFAULT_AFTER_SIGN_IN, pendingReturnTo, rememberReturnTo, consumeReturnTo, withReturnTo, inviteFromPath,
} from '@/lib/authReturnTo';

export default function Login() {
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Where the visitor was headed when they were asked to sign in (an invite link, a link
  // to a session…): ?from_url= on this page, or the address remembered for this tab.
  // Always a path on this site — see authReturnTo.js.
  const returnTo = pendingReturnTo(location.search);
  const invite = inviteFromPath(returnTo);

  // Keep it for this tab too: "Forgot password?" leaves through an e-mail and comes back
  // to a bare /login.
  useEffect(() => { if (returnTo) rememberReturnTo(returnTo); }, [returnTo]);

  // Already signed in (a Back press after logging in, an old bookmark): nothing to do here.
  if (isAuthenticated) return <Navigate to={returnTo || DEFAULT_AFTER_SIGN_IN} replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await base44.auth.loginViaEmailPassword(email, password);
      // A full page load, so the app starts again with the new sign-in.
      window.location.assign(consumeReturnTo(location.search));
    } catch (err) {
      setError(errorMessage(err, "Invalid email or password"));
    } finally {
      setLoading(false);
    }
  };

  // Google sends the browser back to the address it is given, already signed in.
  const handleGoogle = () => {
    base44.auth.loginWithProvider("google", consumeReturnTo(location.search));
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle={invite
        ? <>Log in to join {invite.name ? <Name className="font-semibold text-foreground">{invite.name}</Name> : 'the group'}</>
        : "Log in to your account"}
      notice={location.state?.notice}
      footer={
        <>
          Don't have an account?{" "}
          <Link to={withReturnTo("/register", returnTo)} className="inline-flex min-h-11 items-center text-primary font-medium hover:underline">
            Create one
          </Link>
        </>
      }
    >
      <Button
        variant="outline"
        className="w-full mb-6"
        onClick={handleGoogle}
      >
        <GoogleIcon className="w-5 h-5 mr-2" />
        Continue with Google
      </Button>

      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-3 text-muted-foreground">or</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/forgot-password" className="-my-3 inline-flex min-h-11 items-center text-xs text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10"
              required
            />
          </div>
        </div>
        {/* Beside the button that was pressed, where the eye already is */}
        <ErrorState inline message={error} />
        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Logging in...
            </>
          ) : (
            "Log in"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
