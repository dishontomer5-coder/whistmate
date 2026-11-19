import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Loader2 } from "lucide-react";
import AuthLayout, { PASSWORD_MIN_LENGTH, PASSWORD_HINT } from "@/components/AuthLayout";
import ErrorState from '@/components/ErrorState';
import { errorMessage } from '@/lib/format';

const linkClass = "inline-flex min-h-11 items-center text-primary font-medium hover:underline";

// The two ways out of a reset link that cannot be used (again).
const waysOut = (
  <>
    <Link to="/forgot-password" className={linkClass}>Request a new link</Link>
    <span aria-hidden="true" className="mx-2">·</span>
    <Link to="/login" className={linkClass}>Back to log in</Link>
  </>
);

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const resetToken = searchParams.get("token");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  // The server refused the link itself: it was used already, or it is too old.
  const [linkDead, setLinkDead] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setPasswordError("");
    setConfirmError("");
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      setPasswordError(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setConfirmError("The two passwords are not the same.");
      return;
    }
    setLoading(true);
    try {
      await base44.auth.resetPassword({ resetToken, newPassword });
      setDone(true);
    } catch (err) {
      const message = errorMessage(err, "Failed to reset password");
      // The password itself has been checked above, so a refusal that talks about the
      // link or its token means this link is spent — offer a fresh one instead of
      // leaving the same two fields on screen.
      if (/link|token|expired/i.test(message) && !/password must/i.test(message)) setLinkDead(true);
      else setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (!resetToken) {
    return (
      <AuthLayout
        title="Invalid reset link"
        subtitle="This password reset link is incomplete"
        footer={waysOut}
      >
        <p className="text-sm text-foreground text-center">
          Part of the link is missing — it may have been cut when it was copied. Request a new password reset email.
        </p>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout title="Password changed" subtitle="Your new password is ready to use">
        <div role="status" className="space-y-4 text-center">
          <p className="text-sm text-foreground">
            Log in with your new password. The old one no longer works.
          </p>
          <Button asChild size="lg" className="w-full">
            <Link to="/login" state={{ notice: "Password changed. Log in with your new password." }}>Log in</Link>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  if (linkDead) {
    return (
      <AuthLayout
        title="This link can't be used"
        subtitle="It was used already, or it has expired"
        footer={<Link to="/login" className={linkClass}>Back to log in</Link>}
      >
        <div role="alert" className="space-y-4 text-center">
          <p className="text-sm text-foreground">
            A reset link works once. Your password was not changed just now — ask for a fresh link and we'll email it to you.
          </p>
          <Button asChild size="lg" className="w-full">
            <Link to="/forgot-password">Request a new link</Link>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="New password"
      subtitle="Enter your new password below"
      footer={waysOut}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              autoFocus
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => { setNewPassword(e.target.value); setPasswordError(""); }}
              className="pl-10"
              aria-describedby="password-rule"
              aria-invalid={passwordError ? true : undefined}
              required
            />
          </div>
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
              Resetting...
            </>
          ) : (
            "Reset password"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
