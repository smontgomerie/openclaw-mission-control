"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { SignedIn, SignedOut } from "@/auth/session";

import { UserMenu } from "@/components/organisms/UserMenu";

export function LandingShell({ children }: { children: ReactNode }) {
  return (
    <div className="landing-enterprise">
      <nav className="landing-nav" aria-label="Primary navigation">
        <div className="nav-container">
          <Link href="/" className="logo-section" aria-label="OpenClaw home">
            <div className="logo-icon" aria-hidden="true">
              OC
            </div>
            <div className="logo-text">
              <div className="logo-name">OpenClaw</div>
              <div className="logo-tagline">Mission Control</div>
            </div>
          </Link>

          <div className="nav-links">
            <Link href="#capabilities">Capabilities</Link>
            <Link href="/boards">Boards</Link>
            <Link href="/activity">Activity</Link>
            <Link href="/gateways">Gateways</Link>
          </div>

          <div className="nav-cta">
            <SignedOut>
              <>
                <Link href="/boards" className="btn-secondary">
                  Boards
                </Link>
                <Link href="/onboarding" className="btn-primary">
                  Get started
                </Link>
              </>
            </SignedOut>

            <SignedIn>
              <Link href="/boards/new" className="btn-secondary">
                Create Board
              </Link>
              <Link href="/boards" className="btn-primary">
                Open Boards
              </Link>
              <UserMenu />
            </SignedIn>
          </div>
        </div>
      </nav>

      <main>{children}</main>

      <footer className="landing-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <h3>OpenClaw</h3>
            <p>A calm command center for boards, agents, and approvals.</p>
            <div className="footer-tagline">Realtime Execution Visibility</div>
          </div>

          <div className="footer-column">
            <h4>Product</h4>
            <div className="footer-links">
              <Link href="#capabilities">Capabilities</Link>
              <Link href="/boards">Boards</Link>
              <Link href="/activity">Activity</Link>
              <Link href="/dashboard">Dashboard</Link>
            </div>
          </div>

          <div className="footer-column">
            <h4>Platform</h4>
            <div className="footer-links">
              <Link href="/gateways">Gateways</Link>
              <Link href="/agents">Agents</Link>
              <Link href="/dashboard">Dashboard</Link>
            </div>
          </div>

          <div className="footer-column">
            <h4>Access</h4>
            <div className="footer-links">
              <SignedOut>
                <Link href="/boards">Boards</Link>
                <Link href="/onboarding">Onboarding</Link>
              </SignedOut>
              <SignedIn>
                <Link href="/boards">Open Boards</Link>
                <Link href="/boards/new">Create Board</Link>
                <Link href="/dashboard">Dashboard</Link>
              </SignedIn>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <div className="footer-copyright">
            © {new Date().getFullYear()} OpenClaw. All rights reserved.
          </div>
          <div className="footer-bottom-links">
            <Link href="#capabilities">Capabilities</Link>
            <Link href="/boards">Boards</Link>
            <Link href="/activity">Activity</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
