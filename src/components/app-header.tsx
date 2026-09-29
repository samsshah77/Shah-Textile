"use client";

import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

export function AppHeader() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role.toLowerCase() === "admin";

  return (
    <header className="app-header">
      <Link href="/floor/production" className="app-brand">
        <Image src="/saratextile.png" width={40} height={40} alt="Sara Textile" />
        <span>Sara Textiles</span>
      </Link>
      <div className="account-menu">
        {isAdmin && (
          <nav className="header-nav" aria-label="Administration">
            <Link className="btn btn-on-dark" href="/admin/approvals">
              Approvals
            </Link>
            <Link className="btn btn-on-dark" href="/admin/roles">
              Roles
            </Link>
            <Link className="btn btn-on-dark" href="/admin/permissions">
              Permissions
            </Link>
          </nav>
        )}
        {user && (
          <span className="account-label">
            {user.name} · {user.role.replaceAll("_", " ")}
          </span>
        )}
        <button className="btn btn-on-dark" type="button" onClick={() => void logout()}>
          Sign out
        </button>
      </div>
    </header>
  );
}
