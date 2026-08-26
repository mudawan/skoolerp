import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { THEME_COLOR_PRESETS } from '../utils/themeConfig';
import {
  Layers,
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  ShieldCheck,
  AlertCircle,
  Globe2,
} from 'lucide-react';

interface LoginViewProps {
  onSuccess?: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onSuccess }) => {
  const { login, institute, themeConfig } = useApp();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const preset = THEME_COLOR_PRESETS[themeConfig?.color || 'teal'] || THEME_COLOR_PRESETS.teal;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsLoading(true);

    setTimeout(async () => {
      const res = await login(identifier, password);
      setIsLoading(false);
      if (!res.success) {
        setErrorMsg(res.error || 'Authentication failed. Please verify your credentials.');
      } else {
        if (onSuccess) onSuccess();
      }
    }, 200);
  };

  return (
    <div className={`min-h-screen bg-gradient-to-br ${preset.headerGradient} flex items-center justify-center p-4 sm:p-6 lg:p-8 font-sans antialiased text-slate-100 selection:bg-teal-500 selection:text-white`}>
      <div className="w-full max-w-md space-y-6">
        
        {/* System & Platform Header */}
        <div className="text-center space-y-3">
          <div
            style={{ borderColor: preset.lightBorder }}
            className="mx-auto w-20 h-20 rounded-2xl border p-1 flex items-center justify-center shadow-xl overflow-hidden bg-white"
          >
            {institute?.logoUrl ? (
              <img
                src={institute.logoUrl}
                alt={institute.name}
                className="w-full h-full object-contain rounded-xl"
              />
            ) : (
              <Layers style={{ color: preset.primaryColor }} className="w-10 h-10" />
            )}
          </div>
          <div>
            <div
              style={{
                backgroundColor: preset.primaryColor + '20',
                borderColor: preset.primaryColor + '50',
                color: preset.lightBorder,
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-bold tracking-wide uppercase"
            >
              <Globe2 className="w-3.5 h-3.5" />
              {institute?.regNo ? `Reg: ${institute.regNo}` : 'School Fee Portal'}
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-2">
              {institute?.name || 'Fee Management Platform'}
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Centralized Billing, Fee Invoicing & Institutional Ledger
            </p>
          </div>
        </div>

        {/* Login Card */}
        <div className="bg-slate-800/95 backdrop-blur-md border border-slate-700/90 rounded-3xl p-6 sm:p-8 shadow-2xl relative">
          <div className="mb-6 text-center">
            <h2 className="text-xl font-bold text-white tracking-tight">
              Sign In to Your Workspace
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Enter your authorized operator username or email to access your institute's fee portal.
            </p>
          </div>

          {errorMsg && (
            <div
              id="login-error-banner"
              className="mb-5 p-3.5 bg-rose-500/15 border border-rose-500/40 rounded-xl text-xs text-rose-200 flex items-start gap-2.5 animate-fadeIn"
            >
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{errorMsg}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username or Email */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Username or Email Address
              </label>
              <div className="relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <UserIcon className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  id="login-identifier"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="Enter your username or email"
                  required
                  autoFocus
                  className="w-full bg-slate-900/80 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Password
                </label>
              </div>
              <div className="relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="login-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="w-full bg-slate-900/80 border border-slate-700 rounded-xl pl-10 pr-11 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition cursor-pointer"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Remember Me */}
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-teal-500 focus:ring-teal-500 w-4 h-4 cursor-pointer"
                />
                <span>Keep session active</span>
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              id="login-submit-btn"
              disabled={isLoading}
              style={{ backgroundColor: preset.primaryColor }}
              className="w-full mt-3 hover:opacity-90 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Sign In to Workspace</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-700/70 text-center">
            <p className="text-[11px] text-slate-400">
              Multi-Tenant Cloud Platform &bull; End-to-End Encrypted Session
            </p>
          </div>
        </div>

      </div>
    </div>
  );
};
