import Logo from "@/components/Logo";

export default function LoadingSpinner({ className = "", showLogo = false }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-4 py-20 ${className}`} role="status" aria-label="Loading">
      {showLogo && <Logo size="lg" />}
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}