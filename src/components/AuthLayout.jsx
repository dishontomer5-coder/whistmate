import React from "react";
import Logo from "@/components/Logo";

// The password rule, said once so sign-up and password reset show the same words
// before the form is sent (the server has the last word and its message is shown as is).
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_HINT = `At least ${PASSWORD_MIN_LENGTH} characters.`;

// The frame of the sign-in pages: the WhistMate mark, a title, the form on a card, a footer.
//
// The block is centred when the screen has room. When it is taller than the screen
// (a 320x568 phone, sign-up with three fields) it starts 24px below the top edge and ends
// 24px above the bottom one instead of touching them: the page is a flex column with
// padding, and `m-auto` on the block only centres what fits. On a short screen the mark is
// the small one, so the first field stays near the top.
//
// `notice` is a line of good news above the card ("Password changed") — see ResetPassword.
export default function AuthLayout({ title, subtitle, footer, notice, children }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background px-4 py-6 [@media(min-height:700px)]:py-8">
      <div className="m-auto w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center [@media(min-height:700px)]:mb-8">
          <div className="hidden [@media(min-height:700px)]:block"><Logo size="lg" showText /></div>
          <div className="[@media(min-height:700px)]:hidden"><Logo size="md" showText /></div>
          <h1 className="page-title mt-4 [@media(min-height:700px)]:mt-6">{title}</h1>
          {subtitle && <p className="mt-2 text-muted-foreground">{subtitle}</p>}
        </div>
        {notice && (
          <p role="status" className="mb-4 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-center text-sm text-foreground">
            {notice}
          </p>
        )}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-8">
          {children}
        </div>
        {footer && (
          <p className="mt-6 text-center text-sm text-muted-foreground">{footer}</p>
        )}
      </div>
    </div>
  );
}
