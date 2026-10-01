import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { THEME_COLOR_PRESETS } from '../utils/themeConfig';
import { apiValidateCode } from '../services/apiSync';
import {
  Layers,
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  ShieldCheck,
  AlertCircle,
  Globe2,
  Building2,
  UserPlus,
  KeyRound,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  School,
  Mail,
  Phone,
  Coins,
  ChevronRight,
  Hash,
} from 'lucide-react';

interface LoginViewProps {
  onSuccess?: () => void;
}

type AuthMode = 'login' | 'register_institution' | 'connect_existing';

export const LoginView: React.FC<LoginViewProps> = ({ onSuccess }) => {
  const {
    login,
    registerInstitution,
    joinInstitution,
    institute,
    currentInstitution,
    themeConfig,
  } = useApp();

  const [authMode, setAuthMode] = useState<AuthMode>('login');

  // Sign In Form
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginSchoolCode, setLoginSchoolCode] = useState(() => {
    try {
      return localStorage.getItem('school_management_last_inst_code') || '';
    } catch {
      return '';
    }
  });
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // New Institution Form
  const [schoolName, setSchoolName] = useState('');
  const [codeRandomSuffix] = useState(() => Math.floor(100 + Math.random() * 900));

  const deriveInstitutionCode = (name: string, suffix: number): string => {
    const cleanWords = (name || '').trim().replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/).filter(Boolean);
    if (cleanWords.length === 0) return '';
    let prefix = '';
    if (cleanWords.length >= 3) {
      prefix = (cleanWords[0][0] + cleanWords[1][0] + cleanWords[2][0]).toUpperCase();
    } else if (cleanWords.length === 2) {
      prefix = (cleanWords[0].substring(0, 2) + cleanWords[1].substring(0, 2)).toUpperCase();
    } else if (cleanWords.length === 1) {
      prefix = cleanWords[0].substring(0, 4).toUpperCase();
    } else {
      prefix = 'SCH';
    }
    if (prefix.length < 3) {
      prefix = (prefix + 'SCH').substring(0, 3);
    }
    return `${prefix}-${suffix}`;
  };

  const [generatedSchoolCode, setGeneratedSchoolCode] = useState('');
  const [currency, setCurrency] = useState('PKR');
  const [regNo, setRegNo] = useState('');
  const [schoolEmail, setSchoolEmail] = useState('');
  const [schoolPhone, setSchoolPhone] = useState('');
  const [schoolAddress, setSchoolAddress] = useState('');
  const [adminFullName, setAdminFullName] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);

  // Connect to Existing Form
  const [connectionCode, setConnectionCode] = useState('');
  const [joinFullName, setJoinFullName] = useState('');
  const [joinUsername, setJoinUsername] = useState('');
  const [joinEmail, setJoinEmail] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [showJoinPassword, setShowJoinPassword] = useState(false);

  // Code Validation State
  const [isValidatingCode, setIsValidatingCode] = useState(false);
  const [validatedInfo, setValidatedInfo] = useState<{
    success: boolean;
    type?: 'institution' | 'invite';
    institutionName?: string;
    assignedRole?: string;
    error?: string;
  } | null>(null);

  // Status & Feedback
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [timeoutNotice, setTimeoutNotice] = useState<string | null>(() => {
    try {
      const notice = sessionStorage.getItem('school_timeout_notice');
      if (notice) {
        sessionStorage.removeItem('school_timeout_notice');
        return notice;
      }
    } catch {}
    return null;
  });
  const [deletedNotice, setDeletedNotice] = useState<string | null>(() => {
    try {
      const notice = sessionStorage.getItem('school_deleted_notice');
      if (notice) {
        sessionStorage.removeItem('school_deleted_notice');
        return notice;
      }
    } catch {}
    return null;
  });

  const preset = THEME_COLOR_PRESETS[themeConfig?.color || 'teal'] || THEME_COLOR_PRESETS.teal;

  const handleSchoolNameChange = (val: string) => {
    setSchoolName(val);
    setGeneratedSchoolCode(deriveInstitutionCode(val, codeRandomSuffix));
  };

  // Live validate connection code when typed
  useEffect(() => {
    const trimmed = connectionCode.trim();
    if (trimmed.length < 4) {
      setValidatedInfo(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsValidatingCode(true);
      const res = await apiValidateCode(trimmed);
      setIsValidatingCode(false);

      if (res.success) {
        setValidatedInfo({
          success: true,
          type: res.type,
          institutionName: res.institution?.name || 'Institution Workspace',
          assignedRole: res.invite?.assignedRole,
        });
        if (res.invite?.fullName && !joinFullName) {
          setJoinFullName(res.invite.fullName);
        }
      } else {
        setValidatedInfo({
          success: false,
          error: res.error || 'Code not recognized or expired.',
        });
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [connectionCode]);

  // Handle Standard Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanCode = loginSchoolCode.trim().toUpperCase();
    if (!cleanCode) {
      setErrorMsg('School / Institution Code is required. Please enter your School / Institution Code to sign in.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await login(
        loginIdentifier,
        loginPassword,
        cleanCode
      );
      setIsLoading(false);
      if (!res.success) {
        setErrorMsg(res.error || 'Authentication failed. Please verify your credentials.');
      } else {
        try {
          localStorage.setItem('school_management_last_inst_code', cleanCode);
        } catch {}
        if (onSuccess) onSuccess();
      }
    } catch {
      setIsLoading(false);
      setErrorMsg('Unexpected login error. Please check your credentials.');
    }
  };

  // Handle Register Institution
  const handleRegisterInstitution = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (adminPassword.length < 6) {
      setErrorMsg('Admin password must be at least 6 characters long.');
      return;
    }

    const codeToUse = (generatedSchoolCode || deriveInstitutionCode(schoolName, codeRandomSuffix)).trim();

    setIsLoading(true);
    try {
      const res = await registerInstitution({
        schoolName: schoolName.trim(),
        schoolCode: codeToUse || undefined,
        currency,
        address: schoolAddress.trim() || undefined,
        phone: schoolPhone.trim() || undefined,
        email: schoolEmail.trim() || undefined,
        regNo: regNo.trim() || undefined,
        adminName: adminFullName.trim(),
        adminUsername: adminUsername.trim(),
        adminEmail: adminEmail.trim() || undefined,
        adminPassword,
      });

      setIsLoading(false);
      if (!res.success) {
        setErrorMsg(res.error || 'Failed to create institution workspace.');
      } else {
        if (codeToUse) {
          try {
            localStorage.setItem('school_management_last_inst_code', codeToUse);
          } catch {}
          setLoginSchoolCode(codeToUse);
        }
        setSuccessMsg(`Institution "${schoolName}" created successfully! School / Institution Code: ${codeToUse || 'Assigned'}. Accessing workspace...`);
        setTimeout(() => {
          if (onSuccess) onSuccess();
        }, 800);
      }
    } catch {
      setIsLoading(false);
      setErrorMsg('An unexpected error occurred during institution registration.');
    }
  };

  // Handle Connect to Existing
  const handleJoinInstitution = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (joinPassword.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await joinInstitution({
        code: connectionCode.trim(),
        fullName: joinFullName.trim(),
        username: joinUsername.trim(),
        password: joinPassword,
        email: joinEmail.trim() || undefined,
      });

      setIsLoading(false);
      if (!res.success) {
        setErrorMsg(res.error || 'Failed to connect to institution workspace.');
      } else {
        setSuccessMsg('Successfully joined workspace! Connecting...');
        setTimeout(() => {
          if (onSuccess) onSuccess();
        }, 600);
      }
    } catch {
      setIsLoading(false);
      setErrorMsg('An unexpected error occurred while connecting to the institution.');
    }
  };

  const activeInstituteName = 'Fee Management Platform';

  return (
    <div
      className={`min-h-screen bg-slate-950 bg-gradient-to-br ${preset.headerGradient || 'from-slate-950 via-slate-900 to-[#042424]'} flex items-center justify-center p-4 sm:p-6 lg:p-8 font-sans antialiased text-slate-100 selection:bg-teal-500 selection:text-white`}
    >
      <div className="w-full max-w-xl space-y-6">
        {/* System Branding & Identity */}
        <div className="text-center space-y-2">
          <div
            style={{ borderColor: `${preset.hex}40` }}
            className="mx-auto w-16 h-16 rounded-2xl border p-1 flex items-center justify-center shadow-xl overflow-hidden bg-white"
          >
            <Layers style={{ color: preset.hex }} className="w-8 h-8" />
          </div>
          <div>
            <div
              style={{
                backgroundColor: `${preset.hex}25`,
                borderColor: `${preset.hex}60`,
                color: preset.lightHex || preset.hex,
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-bold tracking-wide uppercase shadow-xs backdrop-blur-xs"
            >
              <Globe2 className="w-3.5 h-3.5" style={{ color: preset.lightHex || preset.hex }} />
              <span>Multi-Tenant Fee & Accounting Portal</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-1.5">
              {authMode === 'register_institution'
                ? 'Create School Workspace'
                : authMode === 'connect_existing'
                ? 'Connect to School'
                : 'Fee Management Platform'}
            </h1>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              {authMode === 'register_institution'
                ? 'Register a new school with Administrator privileges and invite accountants and staff.'
                : authMode === 'connect_existing'
                ? 'Join an established institution using your staff invite code or school code.'
                : 'Secure cloud portal for institutional fee billing, collections, and audit governance.'}
            </p>
          </div>
        </div>

        {/* Primary Auth Container Card */}
        <div className="bg-slate-800/95 backdrop-blur-md border border-slate-700/90 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
          {/* Top Mode Switcher Tabs */}
          <div className="flex rounded-2xl bg-slate-900/90 p-1 mb-6 border border-slate-700/80 text-xs font-semibold">
            <button
              type="button"
              id="tab-auth-login"
              onClick={() => {
                setAuthMode('login');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className={`flex-1 py-2 px-3 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${
                authMode === 'login'
                  ? 'bg-slate-700/90 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
            <button
              type="button"
              id="tab-auth-register"
              onClick={() => {
                setAuthMode('register_institution');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className={`flex-1 py-2 px-3 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${
                authMode === 'register_institution'
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>New Institution</span>
            </button>
            <button
              type="button"
              id="tab-auth-connect"
              onClick={() => {
                setAuthMode('connect_existing');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className={`flex-1 py-2 px-3 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${
                authMode === 'connect_existing'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Connect</span>
            </button>
          </div>

          {/* Error, Timeout, Deletion & Success Feedback Banners */}
          {deletedNotice && !errorMsg && !successMsg && (
            <div
              id="auth-deleted-notice-banner"
              className="mb-5 p-3.5 bg-rose-500/15 border border-rose-500/40 rounded-xl text-xs text-rose-200 flex items-start gap-2.5 animate-fadeIn"
            >
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{deletedNotice}</div>
            </div>
          )}

          {timeoutNotice && !errorMsg && !successMsg && !deletedNotice && (
            <div
              id="auth-timeout-notice-banner"
              className="mb-5 p-3.5 bg-amber-500/15 border border-amber-500/40 rounded-xl text-xs text-amber-200 flex items-start gap-2.5 animate-fadeIn"
            >
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{timeoutNotice}</div>
            </div>
          )}

          {errorMsg && (
            <div
              id="auth-error-banner"
              className="mb-5 p-3.5 bg-rose-500/15 border border-rose-500/40 rounded-xl text-xs text-rose-200 flex items-start gap-2.5 animate-fadeIn"
            >
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{errorMsg}</div>
            </div>
          )}

          {successMsg && (
            <div
              id="auth-success-banner"
              className="mb-5 p-3.5 bg-emerald-500/15 border border-emerald-500/40 rounded-xl text-xs text-emerald-200 flex items-start gap-2.5 animate-fadeIn"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{successMsg}</div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 1: SIGN IN                                                            */}
          {/* ========================================================================= */}
          {authMode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Username or Registered Email
                </label>
                <div className="relative rounded-xl shadow-xs">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    id="login-identifier"
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    placeholder="e.g. admin or operator@school.edu"
                    required
                    autoFocus
                    className="w-full bg-slate-900/80 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-300">
                    Password
                  </label>
                </div>
                <div className="relative rounded-xl shadow-xs">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showLoginPassword ? 'text' : 'password'}
                    id="login-password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    className="w-full bg-slate-900/80 border border-slate-700 rounded-xl pl-10 pr-11 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition cursor-pointer"
                    title={showLoginPassword ? 'Hide password' : 'Show password'}
                  >
                    {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-teal-400" />
                  <span>School / Institution Code</span>
                  <span className="text-rose-400">*</span>
                </label>
                <div className="relative rounded-xl shadow-xs">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Hash className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    id="login-school-code"
                    value={loginSchoolCode}
                    onChange={(e) => setLoginSchoolCode(e.target.value.toUpperCase())}
                    placeholder="e.g. ABC-101 or XYZ-789"
                    required
                    className="w-full bg-slate-900/80 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition uppercase font-mono tracking-wider font-semibold"
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Required to identify your institution workspace.
                </p>
              </div>

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

              <button
                type="submit"
                id="login-submit-btn"
                disabled={isLoading}
                style={{ backgroundColor: preset.hex }}
                className="w-full mt-2 hover:opacity-90 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer text-sm"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Signing In...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Sign In to Workspace</span>
                  </>
                )}
              </button>

              <div className="pt-4 border-t border-slate-700/60 text-center space-y-2">
                <p className="text-xs text-slate-400">
                  Setting up a brand new school?{' '}
                  <button
                    type="button"
                    onClick={() => setAuthMode('register_institution')}
                    className="text-teal-400 hover:text-teal-300 font-semibold underline cursor-pointer"
                  >
                    Register New School
                  </button>
                </p>
                <p className="text-xs text-slate-400">
                  Received an invite from your administrator?{' '}
                  <button
                    type="button"
                    onClick={() => setAuthMode('connect_existing')}
                    className="text-indigo-400 hover:text-indigo-300 font-semibold underline cursor-pointer"
                  >
                    Connect with Code
                  </button>
                </p>
              </div>
            </form>
          )}

          {/* ========================================================================= */}
          {/* TAB 2: REGISTER NEW INSTITUTION                                           */}
          {/* ========================================================================= */}
          {authMode === 'register_institution' && (
            <form onSubmit={handleRegisterInstitution} className="space-y-4">
              <div className="bg-teal-950/40 border border-teal-800/60 rounded-2xl p-3.5 text-xs text-teal-200 flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white block">Provision School Workspace</strong>
                  You will be registered as the root <strong>Admin</strong>. From your workspace you can add accountants, viewers, or generate instant invite codes.
                </div>
              </div>

              {/* Institution Details Group */}
              <div className="space-y-3 pt-1">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <School className="w-3.5 h-3.5 text-teal-400" />
                  <span>1. Institution Information</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      School / Institution Name <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      id="reg-school-name"
                      value={schoolName}
                      onChange={(e) => handleSchoolNameChange(e.target.value)}
                      placeholder="e.g. Central Grammar School or Model Academy"
                      required
                      className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

                  {/* School / Institution Code (Non-editable with Highlight) */}
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Hash className="w-3.5 h-3.5 text-teal-400" />
                        <span>School / Institution Code</span>
                      </span>
                      <span className="text-[10px] font-medium text-slate-400 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-md flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" /> Auto-Generated
                      </span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        id="reg-school-code"
                        value={generatedSchoolCode}
                        placeholder="Generated automatically once school name is entered"
                        readOnly
                        tabIndex={-1}
                        className="w-full bg-slate-950/80 border border-teal-500/40 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-mono font-bold tracking-wider text-teal-300 select-all cursor-default focus:outline-none placeholder:text-slate-500 placeholder:font-sans placeholder:font-normal placeholder:tracking-normal"
                      />
                    </div>
                    {/* Compact highlight note that users will need this to login */}
                    <div className="mt-1.5 px-2.5 py-1.5 bg-amber-500/10 border border-amber-500/25 rounded-lg flex items-center gap-2 text-[11px] text-amber-300">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>Save the <strong>School / Institution Code</strong> — required for you and staff to log in.</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Billing Currency
                    </label>
                    <div className="relative">
                      <select
                        id="reg-school-currency"
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-teal-500 appearance-none cursor-pointer"
                      >
                        <option value="PKR">PKR - Pakistani Rupee (Rs.)</option>
                        <option value="USD">USD - US Dollar ($)</option>
                        <option value="GBP">GBP - British Pound (£)</option>
                        <option value="EUR">EUR - Euro (€)</option>
                        <option value="AED">AED - UAE Dirham (AED)</option>
                        <option value="SAR">SAR - Saudi Riyal (SAR)</option>
                        <option value="INR">INR - Indian Rupee (₹)</option>
                        <option value="CAD">CAD - Canadian Dollar ($)</option>
                        <option value="AUD">AUD - Australian Dollar ($)</option>
                      </select>
                      <Coins className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Affiliation / Reg No. <span className="text-[10px] text-slate-400">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      id="reg-school-regno"
                      value={regNo}
                      onChange={(e) => setRegNo(e.target.value)}
                      placeholder="e.g. REG-2026-99"
                      className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Official Phone <span className="text-[10px] text-slate-400">(Optional)</span>
                    </label>
                    <input
                      type="tel"
                      id="reg-school-phone"
                      value={schoolPhone}
                      onChange={(e) => setSchoolPhone(e.target.value)}
                      placeholder="+92 42 111-222-333"
                      className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>
              </div>

              {/* Administrator Account Details Group */}
              <div className="space-y-3 pt-2 border-t border-slate-700/60">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                  <span>2. Root Administrator Credentials</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Admin Full Name <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      id="reg-admin-name"
                      value={adminFullName}
                      onChange={(e) => setAdminFullName(e.target.value)}
                      placeholder="e.g. Principal / Director"
                      required
                      className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Admin Username <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      id="reg-admin-username"
                      value={adminUsername}
                      onChange={(e) => setAdminUsername(e.target.value)}
                      placeholder="e.g. admin or principal"
                      required
                      className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Admin Email <span className="text-[10px] text-slate-400">(Optional)</span>
                    </label>
                    <input
                      type="email"
                      id="reg-admin-email"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      placeholder="admin@school.edu"
                      className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Master Password <span className="text-rose-400">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showAdminPassword ? 'text' : 'password'}
                        id="reg-admin-password"
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        placeholder="Min 6 characters"
                        required
                        className="w-full bg-slate-900/80 border border-slate-700 rounded-xl pl-3.5 pr-9 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAdminPassword(!showAdminPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 transition cursor-pointer"
                      >
                        {showAdminPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                id="btn-register-school-submit"
                disabled={isLoading}
                className="w-full mt-3 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer text-sm"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Creating Workspace...</span>
                  </>
                ) : (
                  <>
                    <Building2 className="w-4 h-4" />
                    <span>Create School & Access Workspace</span>
                  </>
                )}
              </button>

              <div className="pt-3 text-center">
                <button
                  type="button"
                  onClick={() => setAuthMode('login')}
                  className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
                >
                  Already have an authorized account? Return to Sign In
                </button>
              </div>
            </form>
          )}

          {/* ========================================================================= */}
          {/* TAB 3: CONNECT TO EXISTING INSTITUTION                                    */}
          {/* ========================================================================= */}
          {authMode === 'connect_existing' && (
            <form onSubmit={handleJoinInstitution} className="space-y-4">
              <div className="bg-indigo-950/40 border border-indigo-800/60 rounded-2xl p-3.5 text-xs text-indigo-200 flex items-start gap-2.5">
                <UserPlus className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white block">Connect to an Existing School</strong>
                  Enter the <strong>Invite Code</strong> (e.g. <code>INV-7K4QF-M2XHD</code>) issued by your administrator, or your institution's School Code.
                </div>
              </div>

              {/* Code Verification Group */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>Invite Code or School Code</span>
                  {isValidatingCode && (
                    <span className="text-[11px] text-indigo-300 animate-pulse">
                      Checking code...
                    </span>
                  )}
                </label>
                <div className="relative rounded-xl shadow-xs">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Hash className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    id="connect-code-input"
                    value={connectionCode}
                    onChange={(e) => setConnectionCode(e.target.value.toUpperCase())}
                    placeholder="e.g. INV-7K4QF-M2XHD or SCH-101"
                    required
                    autoFocus
                    className="w-full bg-slate-900/80 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 uppercase font-mono tracking-wider"
                  />
                </div>

                {/* Live Code Validation Badge */}
                {validatedInfo && (
                  <div
                    className={`mt-2 p-2.5 rounded-xl border text-xs flex items-center gap-2 ${
                      validatedInfo.success
                        ? 'bg-emerald-950/50 border-emerald-800 text-emerald-300'
                        : 'bg-rose-950/50 border-rose-800 text-rose-300'
                    }`}
                  >
                    {validatedInfo.success ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <div>
                          <span>Verified: <strong>{validatedInfo.institutionName}</strong></span>
                          {validatedInfo.assignedRole && (
                            <span className="ml-2 px-2 py-0.5 rounded-full bg-emerald-900/80 text-[10px] font-bold uppercase text-emerald-200 border border-emerald-700">
                              Role: {validatedInfo.assignedRole}
                            </span>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                        <span>{validatedInfo.error}</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Operator Details Group */}
              <div className="space-y-3 pt-1 border-t border-slate-700/60">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <UserIcon className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Your Operator Account Details</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Full Name <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      id="connect-fullname"
                      value={joinFullName}
                      onChange={(e) => setJoinFullName(e.target.value)}
                      placeholder="e.g. Staff Full Name"
                      required
                      className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Choose Username <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      id="connect-username"
                      value={joinUsername}
                      onChange={(e) => setJoinUsername(e.target.value)}
                      placeholder="e.g. staff.accountant"
                      required
                      className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Email Address <span className="text-[10px] text-slate-400">(Optional)</span>
                    </label>
                    <input
                      type="email"
                      id="connect-email"
                      value={joinEmail}
                      onChange={(e) => setJoinEmail(e.target.value)}
                      placeholder="staff@school.edu"
                      className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Choose Password <span className="text-rose-400">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showJoinPassword ? 'text' : 'password'}
                        id="connect-password"
                        value={joinPassword}
                        onChange={(e) => setJoinPassword(e.target.value)}
                        placeholder="Min 6 characters"
                        required
                        className="w-full bg-slate-900/80 border border-slate-700 rounded-xl pl-3.5 pr-9 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowJoinPassword(!showJoinPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 transition cursor-pointer"
                      >
                        {showJoinPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                id="btn-connect-school-submit"
                disabled={isLoading || (validatedInfo !== null && !validatedInfo.success)}
                className="w-full mt-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer text-sm"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Connecting to School...</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    <span>Join Workspace & Access Portal</span>
                  </>
                )}
              </button>

              <div className="pt-3 text-center">
                <button
                  type="button"
                  onClick={() => setAuthMode('login')}
                  className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
                >
                  Return to Sign In
                </button>
              </div>
            </form>
          )}

          {/* Footer Security Notice */}
          {/*<div className="mt-6 pt-4 border-t border-slate-700/60 text-center">
            <p className="text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-400 inline" />
              <span>Multi-Tenant Cloud Engine &bull; Scoped Institutional Encryption</span>
            </p>
          </div>*/}
        </div>
      </div>
    </div>
  );
};
