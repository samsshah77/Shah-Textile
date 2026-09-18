'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'

export default function HomePage() {
  const { isAuthenticated } = useAuth()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const isLoggedIn = mounted && isAuthenticated

  useEffect(() => {
    const cards = document.querySelectorAll('.machine')
    if (!cards.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      cards.forEach((el) => el.classList.add('is-in'))
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in')
            io.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.3, rootMargin: '0px 0px -6% 0px' }
    )
    cards.forEach((el, i) => {
      ;(el as HTMLElement).style.transitionDelay = `${i * 80}ms`
      io.observe(el)
    })
    return () => io.disconnect()
  }, [])

  return (
    <div className="sara-home">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap');

        .sara-home {
          --ink: #0e1218;
          --ink-soft: #4a5563;
          --panel: #f2f4f6;
          --panel-2: #e6eaee;
          --steel: #6b7785;
          --machine: #1c2430;
          --accent: #0d9488;
          --accent-hover: #14b8a6;
          --accent-2: #f59e0b;
          --greige: #d6d0c4;
          --max: 74rem;
          --ease: cubic-bezier(0.22, 1, 0.36, 1);
          color: var(--ink);
          background: var(--panel);
          font-family: "IBM Plex Sans", sans-serif;
          font-size: 1.05rem;
          line-height: 1.55;
          -webkit-font-smoothing: antialiased;
          min-height: 100vh;
          overflow-x: hidden;
        }

        .sara-home *, .sara-home *::before, .sara-home *::after {
          box-sizing: border-box;
        }

        .sara-home img {
          display: block;
          max-width: 100%;
          height: auto;
        }

        .sara-home a {
          color: inherit;
          text-decoration: none;
        }

        /* Precision grid like modern machine HMI / loom shed */
        .tech-grid {
          background-color: var(--panel);
          background-image:
            linear-gradient(rgba(14, 18, 24, 0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(14, 18, 24, 0.04) 1px, transparent 1px);
          background-size: 48px 48px;
        }

        /* —— Navigation Bar —— */
        .top-nav {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          z-index: 50;
          padding: 1.25rem 0;
          background: linear-gradient(180deg, rgba(8, 12, 18, 0.85) 0%, rgba(8, 12, 18, 0) 100%);
        }
        .top-nav__inner {
          width: min(100% - 2.25rem, var(--max));
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1.5rem;
        }
        .nav-brand {
          font-family: "Space Grotesk", sans-serif;
          font-weight: 700;
          font-size: 1.25rem;
          color: #eef2f6;
          display: flex;
          align-items: center;
          gap: 0.6rem;
          letter-spacing: -0.02em;
        }
        .nav-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 10px #10b981;
          display: inline-block;
        }
        .nav-links {
          display: none;
          align-items: center;
          gap: 2rem;
          list-style: none;
          margin: 0;
          padding: 0;
        }
        @media (min-width: 920px) {
          .nav-links { display: flex; }
        }
        .nav-links a {
          font-size: 0.92rem;
          font-weight: 500;
          color: rgba(238, 242, 246, 0.8);
          transition: color 0.2s var(--ease);
        }
        .nav-links a:hover {
          color: #ffffff;
        }
        .nav-portal-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.55rem 1.15rem;
          background: rgba(13, 148, 136, 0.2);
          border: 1px solid rgba(13, 148, 136, 0.6);
          color: #2dd4bf;
          border-radius: 4px;
          font-size: 0.88rem;
          font-weight: 600;
          letter-spacing: 0.02em;
          transition: all 0.25s var(--ease);
          backdrop-filter: blur(8px);
          white-space: nowrap;
          flex-shrink: 0;
        }
        .nav-portal-btn:hover {
          background: var(--accent);
          border-color: var(--accent);
          color: #041416;
          transform: translateY(-1px);
        }

        @media (max-width: 640px) {
          .top-nav {
            padding: 0.85rem 0;
          }
          .top-nav__inner {
            width: min(100% - 1.25rem, var(--max));
            gap: 0.75rem;
          }
          .nav-brand {
            font-size: 1.05rem;
            white-space: nowrap;
          }
          .nav-portal-btn {
            padding: 0.42rem 0.8rem;
            font-size: 0.82rem;
            gap: 0.35rem;
          }
        }

        /* —— Hero —— */
        .hero {
          position: relative;
          min-height: 100svh;
          display: grid;
          align-items: end;
          overflow: hidden;
          color: #eef2f6;
          isolation: isolate;
          padding-top: 5rem;
        }
        .hero__media {
          position: absolute;
          inset: 0;
          z-index: -2;
        }
        .hero__media img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: 42% center;
          filter: saturate(0.78) contrast(1.08) brightness(0.92);
          transform: scale(1.05);
          animation: heroPan 32s var(--ease) infinite alternate;
        }
        .hero__scan {
          position: absolute;
          inset: 0;
          z-index: -1;
          pointer-events: none;
          background:
            linear-gradient(180deg, rgba(8, 12, 18, 0.45) 0%, rgba(8, 12, 18, 0.2) 35%, rgba(8, 12, 18, 0.88) 100%),
            linear-gradient(90deg, rgba(8, 12, 18, 0.55) 0%, transparent 50%),
            repeating-linear-gradient(
              0deg,
              transparent,
              transparent 3px,
              rgba(13, 148, 136, 0.03) 3px,
              rgba(13, 148, 136, 0.03) 4px
            );
        }
        .hero__inner {
          width: min(100% - 2.25rem, var(--max));
          margin: 0 auto;
          padding: 5rem 0 3.5rem;
        }
        .brand {
          font-family: "Space Grotesk", sans-serif;
          font-weight: 700;
          font-size: clamp(2.2rem, 6.5vw, 4.85rem);
          line-height: 0.94;
          letter-spacing: -0.04em;
          margin: 0 0 1.1rem;
          max-width: 12ch;
          animation: rise 0.9s var(--ease) both;
        }
        .hero__headline {
          font-family: "Space Grotesk", sans-serif;
          font-weight: 600;
          font-size: clamp(1.15rem, 2.4vw, 1.7rem);
          line-height: 1.25;
          letter-spacing: -0.02em;
          margin: 0 0 0.8rem;
          max-width: 24ch;
          animation: rise 0.9s var(--ease) 0.1s both;
        }
        .hero__lede {
          margin: 0 0 1.6rem;
          max-width: 36ch;
          color: rgba(238, 242, 246, 0.84);
          animation: rise 0.9s var(--ease) 0.18s both;
        }
        .cta-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.75rem;
          animation: rise 0.9s var(--ease) 0.24s both;
        }
        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          min-height: 3rem;
          padding: 0.65rem 1.25rem;
          border: 1px solid transparent;
          font: 600 0.92rem/1 "IBM Plex Sans", sans-serif;
          text-decoration: none;
          border-radius: 3px;
          transition: background 0.25s var(--ease), border-color 0.25s var(--ease), transform 0.25s var(--ease), color 0.25s var(--ease);
        }
        .btn:hover { transform: translateY(-1px); }
        .btn--solid {
          background: var(--accent);
          color: #041416;
        }
        .btn--solid:hover { background: #14b8a6; }
        .btn--ghost {
          background: transparent;
          color: #eef2f6;
          border-color: rgba(238, 242, 246, 0.4);
        }
        .btn--ghost:hover {
          border-color: #eef2f6;
          background: rgba(238, 242, 246, 0.08);
        }
        .btn--portal {
          background: #1e293b;
          color: #38bdf8;
          border: 1px solid rgba(56, 189, 248, 0.45);
        }
        .btn--portal:hover {
          background: #0284c7;
          color: #ffffff;
          border-color: #0284c7;
        }
        .btn--ink {
          background: var(--machine);
          color: #eef2f6;
        }
        .btn--ink:hover { background: #2a3444; }
        .btn--line {
          background: transparent;
          color: var(--ink);
          border-color: rgba(14, 18, 24, 0.28);
        }
        .btn--line:hover {
          border-color: var(--ink);
          background: rgba(14, 18, 24, 0.05);
        }

        /* —— Live strip —— */
        .telemetry {
          background: var(--machine);
          color: #9aa6b5;
          overflow: hidden;
          border-block: 1px solid rgba(13, 148, 136, 0.35);
        }
        .telemetry__track {
          display: flex;
          width: max-content;
          gap: 2.25rem;
          padding: 0.85rem 0;
          font-size: 0.74rem;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          animation: scrollX 26s linear infinite;
          white-space: nowrap;
        }
        .telemetry__track strong {
          color: var(--accent);
          font-weight: 600;
        }
        .telemetry__track span::after {
          content: "";
          display: inline-block;
          width: 0.35rem;
          height: 0.35rem;
          margin-left: 2.25rem;
          border-radius: 1px;
          background: rgba(245, 158, 11, 0.7);
          vertical-align: middle;
        }

        /* —— Process —— */
        .process {
          padding: clamp(3.25rem, 7vw, 5.75rem) 0;
        }
        .process__inner {
          width: min(100% - 2.25rem, var(--max));
          margin: 0 auto;
        }
        .eyebrow {
          margin: 0 0 0.7rem;
          font-size: 0.75rem;
          font-weight: 600;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--accent);
        }
        .section-title {
          font-family: "Space Grotesk", sans-serif;
          font-weight: 700;
          font-size: clamp(1.65rem, 3.8vw, 2.55rem);
          letter-spacing: -0.03em;
          line-height: 1.08;
          margin: 0 0 0.7rem;
          max-width: 18ch;
        }
        .section-lede {
          margin: 0 0 2.5rem;
          max-width: 40ch;
          color: var(--ink-soft);
        }
        .machines {
          display: grid;
          gap: 1px;
          background: rgba(14, 18, 24, 0.1);
          border: 1px solid rgba(14, 18, 24, 0.1);
        }
        @media (min-width: 860px) {
          .machines { grid-template-columns: repeat(3, 1fr); }
        }
        .machine {
          background: #fff;
          padding: 1.6rem 1.35rem 1.7rem;
          opacity: 0;
          transform: translateY(1rem);
          transition: opacity 0.65s var(--ease), transform 0.65s var(--ease);
        }
        .machine.is-in {
          opacity: 1;
          transform: none;
        }
        .machine__code {
          font-family: "Space Grotesk", sans-serif;
          font-size: 0.8rem;
          font-weight: 600;
          letter-spacing: 0.08em;
          color: var(--accent);
          margin: 0 0 1rem;
        }
        .machine h3 {
          font-family: "Space Grotesk", sans-serif;
          font-size: 1.2rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          margin: 0 0 0.45rem;
        }
        .machine p {
          margin: 0;
          color: var(--ink-soft);
          font-size: 0.98rem;
        }

        /* —— Floor —— */
        .floor {
          position: relative;
          min-height: min(72svh, 40rem);
          display: grid;
          align-items: end;
          overflow: hidden;
          color: #eef2f6;
        }
        .floor__media {
          position: absolute;
          inset: 0;
          z-index: -2;
        }
        .floor__media img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center 40%;
          filter: saturate(0.82) contrast(1.05);
        }
        .floor__shade {
          position: absolute;
          inset: 0;
          z-index: -1;
          background:
            linear-gradient(180deg, rgba(8, 12, 18, 0.15), rgba(8, 12, 18, 0.78)),
            linear-gradient(90deg, rgba(8, 12, 18, 0.4), transparent 55%);
        }
        .floor__copy {
          width: min(100% - 2.25rem, var(--max));
          margin: 0 auto;
          padding: 3.25rem 0;
        }
        .floor__copy h2 {
          font-family: "Space Grotesk", sans-serif;
          font-weight: 700;
          font-size: clamp(1.6rem, 3.5vw, 2.4rem);
          letter-spacing: -0.03em;
          line-height: 1.1;
          margin: 0 0 0.65rem;
          max-width: 16ch;
        }
        .floor__copy p {
          margin: 0;
          max-width: 38ch;
          color: rgba(238, 242, 246, 0.86);
        }

        /* —— Specs band —— */
        .specs {
          padding: clamp(2.75rem, 6vw, 4.5rem) 0;
          background: var(--machine);
          color: #c5ced8;
        }
        .specs__inner {
          width: min(100% - 2.25rem, var(--max));
          margin: 0 auto;
          display: grid;
          gap: 1.75rem;
        }
        @media (min-width: 800px) {
          .specs__inner { grid-template-columns: 1fr 1.2fr; align-items: center; gap: 3rem; }
        }
        .specs h2 {
          font-family: "Space Grotesk", sans-serif;
          font-weight: 700;
          font-size: clamp(1.5rem, 3.2vw, 2.2rem);
          color: #eef2f6;
          letter-spacing: -0.03em;
          line-height: 1.12;
          margin: 0 0 0.6rem;
        }
        .specs > .specs__inner > div:first-child p {
          margin: 0;
          max-width: 34ch;
          color: #9aa6b5;
        }
        .spec-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          gap: 0.75rem;
        }
        .spec-list li {
          display: grid;
          grid-template-columns: 7.5rem 1fr;
          gap: 1rem;
          padding: 0.85rem 0;
          border-bottom: 1px solid rgba(154, 166, 181, 0.2);
          font-size: 0.95rem;
        }
        .spec-list span {
          font-size: 0.72rem;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--accent);
        }

        /* —— Electronics —— */
        .electronics {
          padding: clamp(3.25rem, 7vw, 5.5rem) 0;
          background:
            linear-gradient(135deg, rgba(13, 148, 136, 0.06), transparent 42%),
            radial-gradient(ellipse at 100% 0%, rgba(245, 158, 11, 0.08), transparent 45%),
            var(--panel);
          border-block: 1px solid rgba(14, 18, 24, 0.08);
        }
        .electronics__inner {
          width: min(100% - 2.25rem, var(--max));
          margin: 0 auto;
          display: grid;
          gap: 2rem;
        }
        @media (min-width: 860px) {
          .electronics__inner {
            grid-template-columns: 1.1fr 1fr;
            align-items: end;
            gap: 3.5rem;
          }
        }
        .electronics .section-title { max-width: 16ch; }
        .electronics .section-lede { margin-bottom: 0; }
        .board-rail {
          display: grid;
          gap: 0;
          border-left: 2px solid var(--accent);
          padding-left: 1.25rem;
          margin: 0;
        }
        .board-rail li {
          list-style: none;
          padding: 0.95rem 0;
          border-bottom: 1px solid rgba(14, 18, 24, 0.1);
        }
        .board-rail li:last-child { border-bottom: 0; }
        .board-rail strong {
          display: block;
          font-family: "Space Grotesk", sans-serif;
          font-size: 1.02rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          margin: 0 0 0.25rem;
        }
        .board-rail span {
          color: var(--ink-soft);
          font-size: 0.95rem;
        }

        /* —— Parts & used machines —— */
        .parts {
          padding: clamp(3.25rem, 7vw, 5.5rem) 0;
          background: var(--machine);
          color: #c5ced8;
        }
        .parts__inner {
          width: min(100% - 2.25rem, var(--max));
          margin: 0 auto;
        }
        .parts .eyebrow { color: var(--accent-2); }
        .parts .section-title {
          color: #eef2f6;
          max-width: 18ch;
        }
        .parts .section-lede {
          color: #9aa6b5;
          margin-bottom: 2.25rem;
          max-width: 48ch;
        }
        .parts-grid {
          display: grid;
          gap: 1.75rem 2.5rem;
        }
        @media (min-width: 800px) {
          .parts-grid { grid-template-columns: repeat(3, 1fr); }
        }
        .parts-item {
          padding-top: 1rem;
          border-top: 1px solid rgba(154, 166, 181, 0.28);
        }
        .parts-item__code {
          font-family: "Space Grotesk", sans-serif;
          font-size: 0.78rem;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--accent);
          margin: 0 0 0.65rem;
        }
        .parts-item h3 {
          font-family: "Space Grotesk", sans-serif;
          font-size: 1.15rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: #eef2f6;
          margin: 0 0 0.45rem;
        }
        .parts-item p {
          margin: 0;
          font-size: 0.95rem;
          color: #9aa6b5;
        }
        .parts-note {
          margin: 2rem 0 0;
          padding: 1rem 0 0;
          border-top: 1px solid rgba(13, 148, 136, 0.35);
          font-size: 0.95rem;
          color: #eef2f6;
          max-width: 52ch;
        }
        .parts-note strong { color: var(--accent-2); font-weight: 600; }

        /* —— Contact —— */
        .contact {
          padding: clamp(3.25rem, 7vw, 5.5rem) 0;
          background: var(--panel-2);
        }
        .contact__inner {
          width: min(100% - 2.25rem, var(--max));
          margin: 0 auto;
          display: grid;
          gap: 1.4rem;
        }
        @media (min-width: 800px) {
          .contact__inner {
            grid-template-columns: 1.35fr auto;
            align-items: end;
          }
        }
        .contact h2 {
          font-family: "Space Grotesk", sans-serif;
          font-weight: 700;
          font-size: clamp(1.55rem, 3.4vw, 2.35rem);
          letter-spacing: -0.03em;
          line-height: 1.1;
          margin: 0 0 0.55rem;
          max-width: 18ch;
        }
        .contact p {
          margin: 0;
          color: var(--ink-soft);
          max-width: 42ch;
        }
        .contact__actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.7rem;
          justify-content: flex-start;
        }
        @media (min-width: 800px) {
          .contact__actions { justify-content: flex-end; }
        }

        footer {
          padding: 1.25rem 0 1.6rem;
          background: var(--ink);
          color: rgba(238, 242, 246, 0.55);
          font-size: 0.86rem;
        }
        footer .wrap {
          width: min(100% - 2.25rem, var(--max));
          margin: 0 auto;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.5rem 1.5rem;
          justify-content: space-between;
        }
        footer strong { color: #eef2f6; font-weight: 600; }
        .footer-portal-link {
          color: var(--accent);
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          text-decoration: none;
          transition: color 0.2s ease;
        }
        .footer-portal-link:hover { color: #5eead4; }

        @keyframes heroPan {
          from { transform: scale(1.05) translate3d(0, 0, 0); }
          to { transform: scale(1.1) translate3d(-1.4%, 0.5%, 0); }
        }
        @keyframes rise {
          from { opacity: 0; transform: translateY(1.1rem); }
          to { opacity: 1; transform: none; }
        }
        @keyframes scrollX {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }

        @media (prefers-reduced-motion: reduce) {
          .hero__media img,
          .telemetry__track,
          .brand, .hero__headline, .hero__lede, .cta-row { animation: none; }
          .machine { opacity: 1; transform: none; transition: none; }
        }
      `}</style>

      {/* Header Navigation */}
      <nav className="top-nav">
        <div className="top-nav__inner">
          <Link href="/" className="nav-brand">
            <span className="nav-dot"></span>
            Sara Textiles Weaving
          </Link>
          <ul className="nav-links">
            <li><a href="#line">Process</a></li>
            <li><a href="#machinery">Machinery</a></li>
            <li><a href="#electronics">Electronics</a></li>
            <li><a href="#parts">Spares &amp; Looms</a></li>
            <li><a href="#contact">Contact</a></li>
          </ul>
          <Link
            href={isLoggedIn ? '/floor/production' : '/login'}
            className="nav-portal-btn"
          >
            {isLoggedIn ? (
              <>
                <span className="nav-dot" style={{ width: 6, height: 6, margin: 0 }} />
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/>
                </svg>
                Staff ERP
              </>
            ) : (
              <>
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013 3v1"/>
                </svg>
                Login
              </>
            )}
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="hero">
        <div className="hero__media" aria-hidden="true">
          <img
            src="/media/modern-loom.jpg"
            alt="Modern textile weaving looms on the mill floor"
            width="2200"
            height="1467"
          />
        </div>
        <div className="hero__scan" aria-hidden="true"></div>
        <div className="hero__inner">
          <p className="brand">Sara Textiles Weaving</p>
          <h1 className="hero__headline">Modern weaving machinery. Greige fabric out.</h1>
          <p className="hero__lede">High-speed looms convert yarn into clean, dye-ready cloth—controlled, inspected, and released for the dye house.</p>
          <div className="cta-row">
            <a className="btn btn--solid" href="#line">View the line</a>
            <a className="btn btn--ghost" href="#contact">Request capacity</a>
            <Link
              className="btn btn--portal"
              href={isLoggedIn ? '/floor/production' : '/login'}
            >
              {isLoggedIn ? (
                <>
                  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/>
                  </svg>
                  Staff ERP &rarr;
                </>
              ) : (
                <>
                  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013 3v1"/>
                  </svg>
                  Login &rarr;
                </>
              )}
            </Link>
          </div>
        </div>
      </header>

      {/* Live Strip */}
      <div className="telemetry" aria-hidden="true">
        <div className="telemetry__track">
          <span><strong>Warp</strong> beam set</span>
          <span><strong>Weft</strong> insertion</span>
          <span><strong>Pick</strong> density lock</span>
          <span><strong>Selvedge</strong> check</span>
          <span><strong>Greige</strong> release</span>
          <span><strong>Board</strong> diagnostics</span>
          <span><strong>Card</strong> repair</span>
          <span><strong>Spares</strong> stock</span>
          <span><strong>Used</strong> looms</span>
          <span><strong>Dye-ready</strong> handoff</span>
          <span><strong>Warp</strong> beam set</span>
          <span><strong>Weft</strong> insertion</span>
          <span><strong>Pick</strong> density lock</span>
          <span><strong>Selvedge</strong> check</span>
          <span><strong>Greige</strong> release</span>
          <span><strong>Board</strong> diagnostics</span>
          <span><strong>Card</strong> repair</span>
          <span><strong>Spares</strong> stock</span>
          <span><strong>Used</strong> looms</span>
          <span><strong>Dye-ready</strong> handoff</span>
        </div>
      </div>

      {/* Process Section */}
      <section className="process tech-grid" id="line">
        <div className="process__inner">
          <p className="eyebrow">Production sequence</p>
          <h2 className="section-title">Machinery built for weave, not for dye</h2>
          <p className="section-lede">Color happens downstream. On our floor, modern weaving systems turn yarn into stable greige fabric.</p>

          <div className="machines">
            <article className="machine">
              <p className="machine__code">STG-01</p>
              <h3>Yarn preparation</h3>
              <p>Packages are staged for warping—count, tension, and creel layout matched to the fabric construction.</p>
            </article>
            <article className="machine">
              <p className="machine__code">STG-02</p>
              <h3>Warp &amp; loom run</h3>
              <p>Beams feed contemporary weaving machines. Pick rate, width, and structure stay locked to the order profile.</p>
            </article>
            <article className="machine">
              <p className="machine__code">STG-03</p>
              <h3>Greige for dyeing</h3>
              <p>Cloth is inspected and released undyed—ready for bleaching, dyeing, or finishing partners.</p>
            </article>
          </div>
        </div>
      </section>

      {/* Floor Section */}
      <section className="floor" aria-label="Fabric output">
        <div className="floor__media" aria-hidden="true">
          <img
            src="/media/loom-warp.jpg"
            alt="Warp threads on a modern industrial weaving loom"
            width="1800"
            height="1200"
            loading="lazy"
          />
        </div>
        <div className="floor__shade" aria-hidden="true"></div>
        <div className="floor__copy">
          <h2>On the loom: greige takes form</h2>
          <p>Warp and weft lock into structured cloth—released undyed so dye houses get clean, consistent greige fabric.</p>
        </div>
      </section>

      {/* Specs Section */}
      <section className="specs" id="machinery">
        <div className="specs__inner">
          <div>
            <p className="eyebrow" style={{ color: 'var(--accent-2)' }}>Machine profile</p>
            <h2>What the mill is set up to do</h2>
            <p>A weaving-first plant: controlled insertion, consistent fabric architecture, and clean handoff to dye houses.</p>
          </div>
          <ul className="spec-list">
            <li><span>Input</span> Yarn packages prepared for warping and weaving</li>
            <li><span>Core</span> Modern loom shed with monitored weave parameters</li>
            <li><span>Output</span> Greige fabric inspected and staged for dyeing</li>
            <li><span>Electronics</span> In-house repair of weaving machinery electronic cards</li>
            <li><span>Spares</span> Loom spare parts and used / pre-owned weaving machines</li>
          </ul>
        </div>
      </section>

      {/* Electronics Section */}
      <section className="electronics" id="electronics">
        <div className="electronics__inner">
          <div>
            <p className="eyebrow">Electronics department</p>
            <h2 className="section-title">Loom electronic cards, repaired to run</h2>
            <p className="section-lede">Sara Textiles runs a strong electronics bench that can be commissioned for weaving-machinery board and card repair—diagnosis, component work, and return-to-service for loom control electronics.</p>
          </div>
          <ul className="board-rail">
            <li>
              <strong>Control &amp; driver cards</strong>
              <span>Fault finding and repair on loom electronic boards that keep insertion and take-up in sync.</span>
            </li>
            <li>
              <strong>Commissioned repair</strong>
              <span>Send failed cards for bench work, or schedule electronics support against your machine downtime.</span>
            </li>
            <li>
              <strong>Mill-proven context</strong>
              <span>Same team that keeps our weaving floor running—practical knowledge of loom electronics, not generic PCB service.</span>
            </li>
          </ul>
        </div>
      </section>

      {/* Parts & Used Machines */}
      <section className="parts" id="parts">
        <div className="parts__inner">
          <p className="eyebrow">Parts &amp; machines</p>
          <h2 className="section-title">Loom spares and pre-owned weaving machines</h2>
          <p className="section-lede">We sell textile weaving loom spare parts and used or pre-owned machines—sourced from real mill operations, ready for mills that need capacity or replacements without waiting on long OEM lead times.</p>
          <div className="parts-grid">
            <article className="parts-item">
              <p className="parts-item__code">INV-01</p>
              <h3>Spare parts</h3>
              <p>Mechanical and loom-line spares for textile weaving machines—ask for part numbers, assemblies, or equivalents in stock.</p>
            </article>
            <article className="parts-item">
              <p className="parts-item__code">INV-02</p>
              <h3>Used &amp; pre-owned looms</h3>
              <p>Pre-owned weaving machines available for purchase when you need floor capacity or a proven second-hand platform.</p>
            </article>
            <article className="parts-item">
              <p className="parts-item__code">INV-03</p>
              <h3>Commissioned part work</h3>
              <p>When a part needs bench or fitting work before it ships or goes back on the loom, commissioned labour is available at labour cost.</p>
            </article>
          </div>
          <p className="parts-note"><strong>Labour-cost commissioning:</strong> if the part is available and needs work, we can take it on at labour cost—parts priced separately where applicable.</p>
        </div>
      </section>

      {/* Contact Section */}
      <section className="contact" id="contact">
        <div className="contact__inner">
          <div>
            <p className="eyebrow">Capacity &amp; supply</p>
            <h2>Weave, repair, or source parts</h2>
            <p>Ask about greige capacity, electronic card repair, loom spare parts, used machines, or commissioned part work at labour cost.</p>
          </div>
          <div className="contact__actions">
            <a className="btn btn--ink" href="mailto:info@saratextilesweaving.com">Email production</a>
            <a className="btn btn--solid" href="#contact">Inquire parts &amp; machines</a>
            <a className="btn btn--line" href="#electronics">Commission electronics</a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer>
        <div className="wrap">
          <span><strong>Sara Textiles Weaving</strong> — greige, electronics, spares &amp; used looms</span>
          <Link
            className="footer-portal-link"
            href={isLoggedIn ? '/floor/production' : '/login'}
          >
            {isLoggedIn ? (
              <>
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/>
                </svg>
                Staff ERP &rarr;
              </>
            ) : (
              <>
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013 3v1"/>
                </svg>
                Login &rarr;
              </>
            )}
          </Link>
          <span>saratextilesweaving.com</span>
        </div>
      </footer>
    </div>
  )
}
