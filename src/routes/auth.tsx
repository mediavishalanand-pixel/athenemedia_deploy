// ============= Full file contents =============

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/athene-logo.png";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Staff Sign In — Athene Advertising" },
      { name: "description", content: "Secure staff access to the Athene Advertising production desk." },
      { property: "og:title", content: "Staff Sign In — Athene Advertising" },
      { property: "og:description", content: "Secure staff access to the Athene Advertising production desk." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate({ from: "/auth" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) void navigate({ to: "/dashboard", replace: true });
      else setChecking(false);
    });
    return () => { active = false; };
  }, [navigate]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      // Plain usernames (no "@") are mapped to the internal staff account domain,
      // so staff can sign in with a short code instead of a full email address.
      const typed = email.trim();
      const loginEmail = typed.includes("@") ? typed : `${typed.toLowerCase()}@athene.local`;
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password,
      });
      if (signInError) {
        const code = String(signInError.code ?? "");
        const wrong = code === "invalid_credentials" || /invalid login credentials/i.test(signInError.message);
        const tooMany = code === "over_request_rate_limit" || signInError.status === 429;
        setError(
          wrong
            ? "Incorrect username or password."
            : tooMany
              ? "Too many attempts. Please wait a minute and try again."
              : "Sign-in failed. Please try again.",
        );
        setSubmitting(false);
        return;
      }
      if (!data.session) {
        setError("Signed in but no session was returned. Please try again.");
        setSubmitting(false);
        return;
      }
      await navigate({ to: "/dashboard", replace: true });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? `Could not reach the sign-in service: ${caught.message}`
          : "Could not reach the sign-in service.",
      );
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page auth-mkt">
      <header className="auth-topbar">
        <img src={logo} alt="Athene Advertising" className="auth-topbar-logo" />
      </header>
      <div className="auth-mkt-grid">
        <section className="auth-hero">
          <h1>
            One platform to run your advertising <span>business.</span>
          </h1>
          <p className="auth-hero-copy">
            Plans, release orders, proformas and invoices — TV, radio, print, digital, events and
            outdoor media, all in one desk.
          </p>
        </section>
        <section className="auth-entry">
          <div className="auth-form-wrap">
            <h2>Welcome to Athene!</h2>
            <p className="auth-intro">Enter your details to access your account.</p>
            {checking ? (
              <div className="auth-checking"><LoaderCircle size={20} className="auth-spin" /> Checking access…</div>
            ) : (
              <form className="auth-form" onSubmit={handleSubmit}>
                <label>
                  <span>Username or email <em className="auth-req">*</em></span>
                  <Input type="text" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Enter username or email" required />
                </label>
                <label>
                  <span>Password <em className="auth-req">*</em></span>
                  <div className="auth-input-wrap">
                    <Input type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter password" required />
                    <Button type="button" variant="ghost" size="icon" className="auth-password-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"} title={showPassword ? "Hide password" : "Show password"}>
                      {showPassword ? <EyeOff /> : <Eye />}
                    </Button>
                  </div>
                </label>
                {error && <p className="auth-error" role="alert">{error}</p>}
                <Button type="submit" className="auth-submit" disabled={submitting}>
                  {submitting && <LoaderCircle className="auth-spin" />}
                  {submitting ? "Signing in…" : "Login"}
                </Button>
              </form>
            )}
            <p className="auth-help">Access is issued by your administrator.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
