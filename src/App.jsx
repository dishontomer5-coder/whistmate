import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import ScrollToTop from './components/ScrollToTop';
import Logo from './components/Logo';
// Pages
import Home from './pages/Home';
import NewSession from './pages/NewSession';
import SessionView from './pages/SessionView';
import NewRound from './pages/NewRound';
import RoundView from './pages/RoundView';
import History from './pages/History';
import PlayerProfile from './pages/PlayerProfile';
import Admin from './pages/Admin';
import AppAdminDashboard from './pages/AppAdminDashboard';
import Login from './pages/Login';
import Register from './pages/Register';
import Join from './pages/Join';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import SelectPlayer from './pages/SelectPlayer';
import Profile from './pages/Profile';
import GlobalProfile from './pages/GlobalProfile';
import HomeGlobal from './pages/HomeGlobal';
import Account from './pages/Account';
import Activity from './pages/Activity';
import RulesChat from './pages/RulesChat';
import About from './pages/About';
import Layout from './components/Layout';
import { ActiveGroupProvider } from '@/lib/ActiveGroupContext';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-6 bg-background">
        <Logo size="lg" />
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <ActiveGroupProvider>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/join" element={<Join />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      {/* Full-screen chat: renders its own header + composer (safe-area insets), so it
          sits outside the Layout shell rather than nesting a second header inside it. */}
      <Route path="/rules" element={<RulesChat />} />
      <Route element={<Layout />}>
        <Route path="/home" element={<HomeGlobal />} />
        <Route path="/account" element={<Account />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/about" element={<About />} />
        <Route path="/" element={<Home />} />
        <Route path="/session/new" element={<NewSession />} />
        <Route path="/session/:id" element={<SessionView />} />
        <Route path="/session/:sessionId/round/new" element={<NewRound />} />
        <Route path="/round/:id" element={<RoundView />} />
        <Route path="/history" element={<History />} />
        <Route path="/player/:id" element={<PlayerProfile />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/app-admin" element={<AppAdminDashboard />} />
        <Route path="/select-player" element={<SelectPlayer />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/profile/global" element={<GlobalProfile />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
    </ActiveGroupProvider>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App