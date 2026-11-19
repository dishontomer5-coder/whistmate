import React, { useEffect, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Lock, Loader2 } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import AuthLayout, { PASSWORD_MIN_LENGTH, PASSWORD_HINT } from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import ErrorState from '@/components/ErrorState';
import { Name } from '@/components/UserText';
import { errorMessage } from '@/lib/format';
import {
  DEFAULT_AFTER_SIGN_IN, pendingReturnTo, rememberReturnTo, consumeReturnTo, withReturnTo, inviteFromPath,
} from '@/lib/authReturnTo';

export default function Register() {
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // Each message sits under the field it is about; `error` is for what the server says.
  const [passwordError, setPasswordError] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showOtp, setShowOtp] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [resent, setResent] = useState(false);

  // Where the visitor was headed when they were asked to sign up (an invite link…):
  // ?from_url= on this page — it stays in the address through the e-mail code step — or
  // the address remembered for this tab. Always a path on this site (authReturnTo.js).
  const returnTo = pendingReturnTo(location.search);
  const invite = inviteFromPath(returnTo);

  useEffect(() => { if (returnTo) rememberReturnTo(returnTo); }, [returnTo]);

  if (isAuthenticated) return <Navigate to={returnTo || DEFAULT_AFTER_SIGN_IN} replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setPasswordError("");
    setConfirmError("");
    if (password.length < PASSWORD_MIN_LENGTH) {
      setPasswordError(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setConfirmError("The two passwords are not the same.");
      return;
    }
    setLoading(true);
    try {
      await base44.auth.register({ email, password });
      setShowOtp(true);
    } catch (err) {
      setError(errorMessage(err, "Registration failed"));
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await base44.auth.verifyOtp({ email, otpCode });
      if (result?.access_token) {
        base44.auth.setToken(result.access_token);
      }
      // A full page load, so the app starts again signed in — at the invitation or page
      // the visitor came for, or the groups list.
      window.location.assign(consumeReturnTo(location.search));
    } catch (err) {
      setError(errorMessage(err, "Invalid verification code"));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError("");
    setResent(false);
    try {
      await base44.auth.resendOtp(email);
      setResent(true);
    } catch (err) {
      setError(errorMessage(err, "Failed to resend code"));
    }
  };

  // Google sends the browser back to the address it is given, already signed in.
  const handleGoogle = () => {
    base44.auth.loginWithProvider("google", consumeReturnTo(location.search));
  };

  const joining = invite
    ? <> to join {invite.name ? <Name className="font-semibold text-foreground">{invite.name}</Name> : 'the group'}</>
    : null;

  if (showOtp) {
    return (
      <AuthLayout
        title="Verify your email"
        subtitle={<>We sent a 6-digit code to <span className="break-all text-foreground">{email}</span>{joining && <>. One more step{joining}.</>}</>}
        footer={
          <button
            type="button"
            onClick={() => { setShowOtp(false); setOtpCode(""); setError(""); setResent(false); }}
            className="inline-flex min-h-11 items-center text-primary font-medium hover:underline"
          >
            Use a different email
          </button>
        }
      >
        <div className="flex justify-center mb-4">
          <InputOTP
            maxLength={6}
            value={otpCode}
            onChange={setOtpCode}
            autoFocus
            autoComplete="one-time-code"
            aria-label="Verification code"
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
        </div>
        <ErrorState inline message={error} className="mb-4" />
        <Button
          size="lg" className="w-full"
          onClick={handleVerify}
          disabled={loading || otpCode.length < 6}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Verifying...
            </>
          ) : (
            "Verify"
          )}
        </Button>
        <p className="text-center text-sm text-muted-foreground mt-2">
          Didn't receive the code?{" "}
          <button type="button" onClick={handleResend} className="inline-flex min-h-11 items-center text-primary font-medium hover:underline">
            Resend
          </button>
        </p>
        {resent && (
          <p role="status" className="text-center text-sm text-foreground">Code sent again. Check your email.</p>
        )}
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle={invite ? <>Sign up{joining}</> : "Sign up to get started"}
      footer={
        <>
          Already have an account?{" "}
          <Link to={withReturnTo("/login", returnTo)} className="inline-flex min-h-11 items-center text-primary font-medium hover:underline">
            Log in
          </Link>
          <br />
          <Link to="/about" className="inline-flex min-h-11 items-center hover:text-foreground hover:underline">
            About WhistMate &amp; privacy
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
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setPasswordError(""); }}
              className="pl-10"
              aria-describedby="password-rule"
              aria-invalid={passwordError ? true : undefined}
              required
            />
          </div>
          {/* The rule is on screen before anything is sent */}
          <p id="password-rule" className="text-xs text-muted-foreground">{PASSWORD_HINT}</p>
          <ErrorState inline message={passwordError} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setConfirmError(""); }}
              className="pl-10"
              aria-invalid={confirmError ? true : undefined}
              required
            />
          </div>
          <ErrorState inline message={confirmError} />
        </div>
        <ErrorState inline message={error} />
        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Creating account...
            </>
          ) : (
            "Create account"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
