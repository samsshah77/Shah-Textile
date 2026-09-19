import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <main className="form-panel">
      <div className="auth-card">
        <p className="eyebrow">Access restricted</p>
        <h1 className="form-heading h1">You do not have permission to view this module.</h1>
        <p className="muted">Ask an administrator to grant the required role permission.</p>
        <Link className="primary-button forbidden-link" href="/">Return home</Link>
      </div>
    </main>
  );
}
