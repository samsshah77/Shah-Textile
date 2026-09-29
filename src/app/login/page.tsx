"use client";

import Image from "next/image";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

function safeRedirect(value: string | null, role: string) {
  if (value?.startsWith("/") && !value.startsWith("//")) return value;
  return role.toLowerCase() === "admin" ? "/admin/approvals" : "/dashboard";
}

export default function LoginPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "The request could not be completed");
        return;
      }
      const user = await refresh();
      if (!user) {
        setError("Your session could not be verified. Please try again.");
        return;
      }
      const target = safeRedirect(new URLSearchParams(window.location.search).get("redirect"), user.role);
      window.location.assign(target);
    } catch {
      setError("Unable to reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sara-login-page">
    <main className="login-box">
      <div className="card card-outline card-primary">
        <div className="card-header">
          <a href="/" className="link-dark text-center d-flex flex-column align-items-center text-decoration-none">
            <Image
              src="/saratextile.png"
              width={72}
              height={72}
              alt="Sara Textile"
              priority
              className="mb-2 d-block mx-auto rounded-3"
            />
            <h1 className="mb-0 fs-3">
              <b>Sara</b> Textile
            </h1>
          </a>
        </div>
        <div className="card-body login-card-body">
          <p className="login-box-msg">Sign in to start your session</p>
          <form onSubmit={submit}>
            <label className="visually-hidden" htmlFor="loginEmail">
              Email
            </label>
            <div className="input-group mb-3">
              <input
                id="loginEmail"
                name="email"
                type="email"
                className="form-control"
                placeholder="Email"
                autoComplete="email"
                maxLength={254}
                required
              />
              <div className="input-group-text">
                <span className="bi bi-envelope" />
              </div>
            </div>
            <label className="visually-hidden" htmlFor="loginPassword">
              Password
            </label>
            <div className="input-group mb-3">
              <input
                id="loginPassword"
                name="password"
                type="password"
                className="form-control"
                placeholder="Password"
                autoComplete="current-password"
                maxLength={256}
                required
              />
              <div className="input-group-text">
                <span className="bi bi-lock-fill" />
              </div>
            </div>
            {error ? (
              <div className="alert alert-danger py-2" role="alert">
                {error}
              </div>
            ) : null}
            <div className="d-grid">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? "Please wait…" : "Sign In"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
    </div>
  );
}
