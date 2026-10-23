"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { t } from "@/lib/i18n/id";
import { supabaseBrowser, warmSupabaseBrowser } from "@/lib/supabase/client";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Props =
  | { mode: "login"; next: string | null; onDone: () => void }
  | {
      mode: "register";
      next: string | null;
      onDone: (needsConfirm: boolean, email: string) => void;
    };

/** Form email dan kata sandi untuk masuk atau mendaftar. Akun baru otomatis mendapat trial. */
export function PasswordForm(props: Props) {
  // Unduh kode Supabase selagi pengguna mengetik, bukan saat tombol ditekan.
  useEffect(() => warmSupabaseBrowser(), []);
  const register = props.mode === "register";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const f = t.login.form;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!EMAIL_RE.test(email.trim())) next.email = f.emailInvalid;
    if (password.length < (register ? 8 : 1))
      next.password = register ? f.passwordShort : f.passwordRequired;
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setLoading(true);
    const supabase = await supabaseBrowser();
    if (props.mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      setLoading(false);
      if (error) {
        setErrors({
          form: error.message.toLowerCase().includes("confirm")
            ? f.notConfirmed
            : f.wrongCredentials,
        });
        return;
      }
      props.onDone();
      return;
    }
    const redirect = new URL("/auth/callback", window.location.origin);
    if (props.next && props.next.startsWith("/") && !props.next.startsWith("//"))
      redirect.searchParams.set("next", props.next);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: redirect.toString() },
    });
    setLoading(false);
    if (error) {
      setErrors({ form: f.signUpFailed });
      return;
    }
    if (data.user && data.user.identities?.length === 0) {
      setErrors({ form: f.alreadyRegistered });
      return;
    }
    props.onDone(!data.session, email.trim());
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {errors.form && <Alert tone="error">{errors.form}</Alert>}
      <Field label={f.email} htmlFor="auth-email" error={errors.email}>
        <Input
          id="auth-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={f.emailPlaceholder}
          invalid={Boolean(errors.email)}
        />
      </Field>
      <Field
        label={f.password}
        htmlFor="auth-password"
        error={errors.password}
        hint={register ? f.passwordHint : undefined}
      >
        <div className="relative">
          <Input
            id="auth-password"
            type={show ? "text" : "password"}
            autoComplete={register ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            invalid={Boolean(errors.password)}
            className="pr-12"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-pressed={show}
            aria-label={show ? f.hidePassword : f.showPassword}
            className="absolute right-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full text-ink-500 hover:bg-primary-50"
          >
            <Icon name={show ? "eyeOff" : "eye"} />
          </button>
        </div>
      </Field>
      <Button type="submit" variant="cta" loading={loading} className="w-full">
        {register ? f.signUp : f.signIn}
      </Button>
    </form>
  );
}
