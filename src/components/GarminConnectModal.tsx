"use client";

import { useState } from "react";

interface Props {
  onConnected: () => void;
  onClose: () => void;
}

type Step = "credentials" | "mfa" | "cloud";

export default function GarminConnectModal({ onConnected, onClose }: Props) {
  const [step, setStep] = useState<Step>("credentials");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPwd, setShowPwd] = useState(false);

  async function connect() {
    if (!username.trim() || !password.trim()) return;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/garmin/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    setLoading(false);
    if (data.ok) {
      onConnected();
    } else if (data.cloudHosted) {
      setStep("cloud");
    } else if (data.needsMFA) {
      setStep("mfa");
    } else {
      setError(data.error ?? "Login failed. Check your credentials.");
    }
  }

  async function submitMFA() {
    if (!mfaCode.trim()) return;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/garmin/mfa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: mfaCode }),
    });
    const data = await res.json();
    setLoading(false);
    if (data.ok) {
      onConnected();
    } else {
      setError(data.error ?? "Invalid MFA code. Please try again.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-sky-500/20 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h2 className="text-white font-bold">
              {step === "mfa" ? "Two-Step Verification" : "Connect Garmin"}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          {step === "cloud" ? (
            <>
              <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
                <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <p className="text-amber-300 text-sm leading-relaxed">
                  Garmin&apos;s login is blocked from cloud IPs. You need to authenticate once from your local machine — tokens are saved to Azure Blob and work here automatically.
                </p>
              </div>

              <div className="space-y-2">
                {[
                  { n: "1", text: "Add to your local .env.local file:", code: "AZURE_STORAGE_CONNECTION_STRING=<your connection string>\nAZURE_STORAGE_CONTAINER=henadzittracker" },
                  { n: "2", text: "Run the app locally:", code: "npm run dev" },
                  { n: "3", text: "Open localhost:3000, connect Garmin — done. Tokens are written to blob storage and this site will pick them up automatically.", code: null },
                ].map(({ n, text, code }) => (
                  <div key={n} className="flex gap-3">
                    <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{n}</span>
                    <div className="space-y-1.5">
                      <p className="text-sm text-gray-300">{text}</p>
                      {code && (
                        <pre className="text-xs bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-gray-300 font-mono whitespace-pre-wrap">{code}</pre>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl bg-gray-700 hover:bg-gray-600 text-gray-300 font-semibold text-sm transition-colors"
              >
                Got it
              </button>
            </>
          ) : step === "credentials" ? (
            <>
              <p className="text-gray-400 text-sm">
                Enter your <span className="text-white font-medium">Garmin Connect</span> credentials. They&apos;re sent only to your local server and stored as session tokens — never in plaintext.
              </p>

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Email / Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="username"
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1">Password</label>
                  <div className="relative">
                    <input
                      type={showPwd ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && connect()}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2.5 pr-10 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-sky-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                    >
                      {showPwd ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <button
                onClick={connect}
                disabled={loading || !username.trim() || !password.trim()}
                className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Connecting…
                  </>
                ) : "Connect Garmin"}
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 bg-sky-500/10 border border-sky-500/20 rounded-xl px-4 py-3">
                <svg className="w-5 h-5 text-sky-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <p className="text-sky-300 text-sm">
                  Garmin has sent a verification code to your authenticator app or email.
                </p>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              <div>
                <label className="block text-xs text-gray-400 mb-1">Verification Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  onKeyDown={(e) => e.key === "Enter" && submitMFA()}
                  placeholder="123456"
                  autoFocus
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-sky-500 tracking-[0.3em] text-center text-lg font-mono"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => { setStep("credentials"); setError(null); setMfaCode(""); }}
                  className="flex-1 py-2.5 rounded-xl bg-gray-700 hover:bg-gray-600 text-gray-300 font-semibold text-sm transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={submitMFA}
                  disabled={loading || mfaCode.length < 4}
                  className="flex-2 px-6 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Verifying…
                    </>
                  ) : "Verify"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
