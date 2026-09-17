import Link from 'next/link'
import Image from 'next/image'

export const metadata = {
  title: 'Sara Textiles Weaving — Mill Weaving & Loom Electronics',
  description: 'Sara Textiles Weaving: dye-ready greige, loom electronic card repair, spare parts, and used weaving machines—commissioned part work at labour cost.',
}

export default function HomePage() {
  return (
    <div className="landing-page">
      <style>{`
        .landing-page {
          --ink: #0e1218;
          --ink-soft: #4a5563;
          --panel: #f2f4f6;
          --panel-2: #e6eaee;
          --steel: #6b7785;
          --machine: #1c2430;
          --accent: #0d9488;
          --accent-hover: #14b8a6;
          --accent-2: #f59e0b;
          --max: 74rem;
          --ease: cubic-bezier(0.22, 1, 0.36, 1);
          color: var(--ink);
          background: var(--panel);
          font-family: var(--font-inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
          font-size: 1.05rem;
          line-height: 1.55;
          min-height: 100vh;
        }

        /* —— Navigation Bar —— */
        .landing-nav {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          z-index: 50;
          padding: 1.25rem 0;
          background: linear-gradient(180deg, rgba(8, 12, 18, 0.9) 0%, rgba(8, 12, 18, 0) 100%);
        }
        .landing-nav__inner {
          width: min(100% - 2.25rem, var(--max));
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1.5rem;
        }
        .landing-brand {
          font-weight: 700;
          font-size: 1.2rem;
          color: #eef2f6;
          display: flex;
          align-items: center;
          gap: 0.6rem;
          text-decoration: none;
          letter-spacing: -0.02em;
        }
        .landing-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 10px #10b981;
          display: inline-block;
        }
        .landing-links {
          display: none;
          align-items: center;
          gap: 2rem;
          list-style: none;
          margin: 0;
          padding: 0;
        }
        @media (min-width: 900px) {
          .landing-links { display: flex; }
        }
        .landing-links a {
          font-size: 0.9rem;
          font-weight: 500;
          color: rgba(238, 242, 246, 0.75);
          text-decoration: none;
          transition: color 0.2s var(--ease);
        }
        .landing-links a:hover {
          color: #fff;
        }
        .btn-portal-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.55rem 1.15rem;
          background: rgba(13, 148, 136, 0.15);
          border: 1px solid rgba(13, 148, 136, 0.55);
          color: #2dd4bf;
          border-radius: 6px;
          font-size: 0.86rem;
          font-weight: 600;
          letter-spacing: 0.02em;
          text-decoration: none;
          transition: all 0.25s var(--ease);
          backdrop-filter: blur(8px);
        }
        .btn-portal-pill:hover {
          background: var(--accent);
          border-color: var(--accent);
          color: #041416;
          transform: translateY(-1px);
        }

        /* —— Hero —— */
        .landing-hero {
          position: relative;
          min-height: 100svh;
          display: grid;
          align-items: end;
          overflow: hidden;
          color: #eef2f6;
          isolation: isolate;
          padding-top: 6rem;
          background: #0d131d;
        }
        .landing-hero__scan {
          position: absolute;
          inset: 0;
          z-index: -1;
          pointer-events: none;
          background:
            radial-gradient(ellipse at 80% 20%, rgba(13, 148, 136, 0.18), transparent 50%),
            radial-gradient(ellipse at 20% 80%, rgba(245, 158, 11, 0.12), transparent 45%),
            linear-gradient(180deg, rgba(8, 12, 18, 0.5) 0%, rgba(8, 12, 18, 0.3) 40%, rgba(8, 12, 18, 0.95) 100%),
            repeating-linear-gradient(
              0deg,
              transparent,
              transparent 3px,
              rgba(13, 148, 136, 0.03) 3px,
              rgba(13, 148, 136, 0.03) 4px
            );
        }
        .landing-hero__inner {
          width: min(100% - 2.25rem, var(--max));
          margin: 0 auto;
          padding: 5rem 0 3.5rem;
        }
        .landing-brand-title {
          font-weight: 700;
          font-size: clamp(2.2rem, 6.5vw, 4.85rem);
          line-height: 0.95;
          letter-spacing: -0.04em;
          margin: 0 0 1.1rem;
          max-width: 12ch;
          color: #ffffff;
        }
        .landing-headline {
          font-weight: 600;
          font-size: clamp(1.2rem, 2.4vw, 1.75rem);
          line-height: 1.25;
          letter-spacing: -0.02em;
          margin: 0 0 0.8rem;
          max-width: 26ch;
          color: #e2e8f0;
        }
        .landing-lede {
          margin: 0 0 1.8rem;
          max-width: 38ch;
          color: rgba(238, 242, 246, 0.85);
          font-size: 1.05rem;
        }
        .landing-cta-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.8rem;
        }
        .landing-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          min-height: 3rem;
          padding: 0.65rem 1.35rem;
          border: 1px solid transparent;
          font-weight: 600;
          font-size: 0.92rem;
          text-decoration: none;
          border-radius: 4px;
          transition: all 0.25s var(--ease);
        }
        .landing-btn:hover { transform: translateY(-1px); }
        .landing-btn--solid {
          background: var(--accent);
          color: #041416;
        }
        .landing-btn--solid:hover { background: var(--accent-hover); }
        .landing-btn--ghost {
          background: transparent;
          color: #eef2f6;
          border-color: rgba(238, 242, 246, 0.4);
        }
        .landing-btn--ghost:hover {
          border-color: #eef2f6;
          background: rgba(238, 242, 246, 0.08);
        }
        .landing-btn--portal {
          background: #1e293b;
          color: #38bdf8;
          border: 1px solid rgba(56, 189, 248, 0.4);
        }
        .landing-btn--portal:hover {
          background: #0284c7;
          color: #ffffff;
          border-color: #0284c7;
        }

        /* —— Live Ticker —— */
        .landing-ticker {
          background: var(--machine);
          color: #9aa6b5;
          overflow: hidden;
          border-block: 1px solid rgba(13, 148, 136, 0.35);
        }
        .landing-ticker__track {
          display: flex;
          width: max-content;
          gap: 2.25rem;
          padding: 0.85rem 0;
          font-size: 0.76rem;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          animation: tickerScroll 26s linear infinite;
          white-space: nowrap;
        }
        .landing-ticker__track strong {
          color: var(--accent);
          font-weight: 600;
        }
        .landing-ticker__track span::after {
          content: "";
          display: inline-block;
          width: 0.35rem;
          height: 0.35rem;
          margin-left: 2.25rem;
          border-radius: 1px;
          background: rgba(245, 158, 11, 0.7);
          vertical-align: middle;
        }

        @keyframes tickerScroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }

        /* —— Process Section —— */
        .landing-process {
          padding: clamp(3.5rem, 7vw, 6rem) 0;
          background-color: var(--panel);
          background-image:
            linear-gradient(rgba(14, 18, 24, 0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(14, 18, 24, 0.04) 1px, transparent 1px);
          background-size: 48px 48px;
        }
        .landing-process__inner {
          width: min(100% - 2.25rem, var(--max));
          margin: 0 auto;
        }
        .landing-eyebrow {
          margin: 0 0 0.7rem;
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--accent);
        }
        .landing-section-title {
          font-weight: 700;
          font-size: clamp(1.7rem, 3.8vw, 2.6rem);
          letter-spacing: -0.03em;
          line-height: 1.1;
          margin: 0 0 0.7rem;
          max-width: 20ch;
          color: var(--ink);
        }
        .landing-section-lede {
          margin: 0 0 2.5rem;
          max-width: 44ch;
          color: var(--ink-soft);
        }
        .landing-machines {
          display: grid;
          gap: 1.25rem;
          grid-template-columns: 1fr;
        }
        @media (min-width: 860px) {
          .landing-machines { grid-template-columns: repeat(3, 1fr); }
        }
        .landing-machine-card {
          background: #ffffff;
          padding: 2rem 1.5rem;
          border-radius: 6px;
          border: 1px solid rgba(14, 18, 24, 0.08);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
          transition: transform 0.25s var(--ease), box-shadow 0.25s var(--ease);
        }
        .landing-machine-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
        }
        .landing-machine-code {
          font-size: 0.8rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          color: var(--accent);
          margin: 0 0 1rem;
        }
        .landing-machine-card h3 {
          font-size: 1.25rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          margin: 0 0 0.5rem;
          color: var(--ink);
        }
        .landing-machine-card p {
          margin: 0;
          color: var(--ink-soft);
          font-size: 0.98rem;
          line-height: 1.6;
        }

        /* —— Specs band —— */
        .landing-specs {
          padding: clamp(3rem, 6vw, 5rem) 0;
          background: var(--machine);
          color: #c5ced8;
        }
        .landing-specs__inner {
          width: min(100% - 2.25rem, var(--max));
          margin: 0 auto;
          display: grid;
          gap: 2.5rem;
        }
        @media (min-width: 860px) {
          .landing-specs__inner {
            grid-template-columns: 1fr 1.2fr;
            align-items: center;
            gap: 4rem;
          }
        }
        .landing-specs h2 {
          font-weight: 700;
          font-size: clamp(1.6rem, 3.2vw, 2.3rem);
          color: #eef2f6;
          letter-spacing: -0.03em;
          line-height: 1.15;
          margin: 0 0 0.75rem;
        }
        .landing-specs p {
          margin: 0;
          color: #9aa6b5;
          line-height: 1.6;
        }
        .spec-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          gap: 0.85rem;
        }
        .spec-list li {
          display: grid;
          grid-template-columns: 7.5rem 1fr;
          gap: 1rem;
          padding: 0.95rem 0;
          border-bottom: 1px solid rgba(154, 166, 181, 0.18);
          font-size: 0.95rem;
        }
        .spec-list span {
          font-size: 0.74rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--accent);
        }

        /* —— Electronics Department —— */
        .landing-electronics {
          padding: clamp(3.5rem, 7vw, 6rem) 0;
          background:
            linear-gradient(135deg, rgba(13, 148, 136, 0.06), transparent 42%),
            radial-gradient(ellipse at 100% 0%, rgba(245, 158, 11, 0.08), transparent 45%),
            var(--panel);
          border-block: 1px solid rgba(14, 18, 24, 0.08);
        }
        .landing-electronics__inner {
          width: min(100% - 2.25rem, var(--max));
          margin: 0 auto;
          display: grid;
          gap: 2.5rem;
        }
        @media (min-width: 860px) {
          .landing-electronics__inner {
            grid-template-columns: 1.1fr 1fr;
            align-items: center;
            gap: 4rem;
          }
        }
        .board-rail {
          display: grid;
          gap: 0;
          border-left: 2px solid var(--accent);
          padding-left: 1.5rem;
          margin: 0;
        }
        .board-rail li {
          list-style: none;
          padding: 1rem 0;
          border-bottom: 1px solid rgba(14, 18, 24, 0.1);
        }
        .board-rail li:last-child { border-bottom: 0; }
        .board-rail strong {
          display: block;
          font-size: 1.05rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          margin: 0 0 0.3rem;
          color: var(--ink);
        }
        .board-rail span {
          color: var(--ink-soft);
          font-size: 0.95rem;
          line-height: 1.55;
        }

        /* —— Parts & Looms —— */
        .landing-parts {
          padding: clamp(3.5rem, 7vw, 6rem) 0;
          background: var(--machine);
          color: #c5ced8;
        }
        .landing-parts__inner {
          width: min(100% - 2.25rem, var(--max));
          margin: 0 auto;
        }
        .parts-grid {
          display: grid;
          gap: 2rem;
          grid-template-columns: 1fr;
        }
        @media (min-width: 800px) {
          .parts-grid { grid-template-columns: repeat(3, 1fr); }
        }
        .parts-item {
          padding-top: 1.25rem;
          border-top: 1px solid rgba(154, 166, 181, 0.25);
        }
        .parts-item__code {
          font-size: 0.8rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--accent);
          margin: 0 0 0.65rem;
        }
        .parts-item h3 {
          font-size: 1.2rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: #eef2f6;
          margin: 0 0 0.5rem;
        }
        .parts-item p {
          margin: 0;
          font-size: 0.95rem;
          color: #9aa6b5;
          line-height: 1.55;
        }
        .parts-note {
          margin: 2.5rem 0 0;
          padding: 1.25rem 0 0;
          border-top: 1px solid rgba(13, 148, 136, 0.35);
          font-size: 0.95rem;
          color: #eef2f6;
          max-width: 54ch;
        }
        .parts-note strong { color: var(--accent-2); font-weight: 600; }

        /* —— Contact —— */
        .landing-contact {
          padding: clamp(3.5rem, 7vw, 6rem) 0;
          background: var(--panel-2);
        }
        .landing-contact__inner {
          width: min(100% - 2.25rem, var(--max));
          margin: 0 auto;
          display: grid;
          gap: 2rem;
        }
        @media (min-width: 800px) {
          .landing-contact__inner {
            grid-template-columns: 1.35fr auto;
            align-items: center;
          }
        }
        .landing-contact h2 {
          font-weight: 700;
          font-size: clamp(1.6rem, 3.4vw, 2.4rem);
          letter-spacing: -0.03em;
          line-height: 1.1;
          margin: 0 0 0.6rem;
          color: var(--ink);
        }
        .landing-contact p {
          margin: 0;
          color: var(--ink-soft);
          max-width: 44ch;
        }
        .landing-contact__actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
        }

        /* —— Footer —— */
        .landing-footer {
          padding: 1.75rem 0 2.25rem;
          background: var(--ink);
          color: rgba(238, 242, 246, 0.6);
          font-size: 0.88rem;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }
        .landing-footer__wrap {
          width: min(100% - 2.25rem, var(--max));
          margin: 0 auto;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 1rem 2rem;
          justify-content: space-between;
        }
        .landing-footer strong { color: #eef2f6; font-weight: 600; }
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
      `}</style>

      {/* Navigation Header */}
      <nav className="landing-nav">
        <div className="landing-nav__inner">
          <Link href="/" className="landing-brand">
            <span className="landing-dot"></span>
            Sara Textiles Weaving
          </Link>
          <ul className="landing-links">
            <li><a href="#line">Process</a></li>
            <li><a href="#machinery">Machinery</a></li>
            <li><a href="#electronics">Electronics Bench</a></li>
            <li><a href="#parts">Parts &amp; Looms</a></li>
            <li><a href="#contact">Contact</a></li>
          </ul>
          <Link href="/login" className="btn-portal-pill">
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
            </svg>
            Staff ERP Login
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="landing-hero">
        <div className="landing-hero__scan" aria-hidden="true"></div>
        <div className="landing-hero__inner">
          <p className="landing-brand-title">Sara Textiles Weaving</p>
          <h1 className="landing-headline">Modern weaving machinery. Greige fabric out.</h1>
          <p className="landing-lede">
            High-speed looms convert yarn into clean, dye-ready cloth—controlled, inspected, and released for the dye house.
          </p>
          <div className="landing-cta-row">
            <a className="landing-btn landing-btn--solid" href="#line">View the line</a>
            <a className="landing-btn landing-btn--ghost" href="#contact">Request capacity</a>
            <Link className="landing-btn landing-btn--portal" href="/login">
              <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
              </svg>
              Staff ERP Portal &rarr;
            </Link>
          </div>
        </div>
      </header>

      {/* Telemetry Strip */}
      <div className="landing-ticker" aria-hidden="true">
        <div className="landing-ticker__track">
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
      <section className="landing-process" id="line">
        <div className="landing-process__inner">
          <p className="landing-eyebrow">Production sequence</p>
          <h2 className="landing-section-title">Machinery built for weave, not for dye</h2>
          <p className="landing-section-lede">Color happens downstream. On our floor, modern weaving systems turn yarn into stable greige fabric.</p>

          <div className="landing-machines">
            <article className="landing-machine-card">
              <p className="landing-machine-code">STG-01</p>
              <h3>Yarn preparation</h3>
              <p>Packages are staged for warping—count, tension, and creel layout matched to the fabric construction.</p>
            </article>
            <article className="landing-machine-card">
              <p className="landing-machine-code">STG-02</p>
              <h3>Warp &amp; loom run</h3>
              <p>Beams feed contemporary weaving machines. Pick rate, width, and structure stay locked to the order profile.</p>
            </article>
            <article className="landing-machine-card">
              <p className="landing-machine-code">STG-03</p>
              <h3>Greige for dyeing</h3>
              <p>Cloth is inspected and released undyed—ready for bleaching, dyeing, or finishing partners.</p>
            </article>
          </div>
        </div>
      </section>

      {/* Specs Section */}
      <section className="landing-specs" id="machinery">
        <div className="landing-specs__inner">
          <div>
            <p className="landing-eyebrow" style={{ color: 'var(--accent-2)' }}>Machine profile</p>
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
      <section className="landing-electronics" id="electronics">
        <div className="landing-electronics__inner">
          <div>
            <p className="landing-eyebrow">Electronics department</p>
            <h2 className="landing-section-title">Loom electronic cards, repaired to run</h2>
            <p className="landing-section-lede">
              Sara Textiles runs a strong electronics bench that can be commissioned for weaving-machinery board and card repair—diagnosis, component work, and return-to-service for loom control electronics.
            </p>
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

      {/* Parts Section */}
      <section className="landing-parts" id="parts">
        <div className="landing-parts__inner">
          <p className="landing-eyebrow" style={{ color: 'var(--accent-2)' }}>Parts &amp; machines</p>
          <h2 className="landing-section-title" style={{ color: '#eef2f6' }}>Loom spares and pre-owned weaving machines</h2>
          <p className="landing-section-lede" style={{ color: '#9aa6b5' }}>
            We sell textile weaving loom spare parts and used or pre-owned machines—sourced from real mill operations, ready for mills that need capacity or replacements without waiting on long OEM lead times.
          </p>
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
          <p className="parts-note">
            <strong>Labour-cost commissioning:</strong> if the part is available and needs work, we can take it on at labour cost—parts priced separately where applicable.
          </p>
        </div>
      </section>

      {/* Contact Section */}
      <section className="landing-contact" id="contact">
        <div className="landing-contact__inner">
          <div>
            <p className="landing-eyebrow">Capacity &amp; supply</p>
            <h2>Weave, repair, or source parts</h2>
            <p>Ask about greige capacity, electronic card repair, loom spare parts, used machines, or commissioned part work at labour cost.</p>
          </div>
          <div className="landing-contact__actions">
            <a className="landing-btn" style={{ background: 'var(--machine)', color: '#eef2f6' }} href="mailto:info@saratextilesweaving.com">
              Email production
            </a>
            <a className="landing-btn landing-btn--solid" href="#contact">
              Inquire parts &amp; machines
            </a>
            <a className="landing-btn" style={{ background: 'transparent', color: 'var(--ink)', borderColor: 'rgba(14, 18, 24, 0.28)' }} href="#electronics">
              Commission electronics
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-footer__wrap">
          <span><strong>Sara Textiles Weaving</strong> — greige, electronics, spares &amp; used looms</span>
          <Link className="footer-portal-link" href="/login">
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
            </svg>
            Staff ERP Portal &rarr;
          </Link>
          <span>saratextilesweaving.com</span>
        </div>
      </footer>
    </div>
  )
}
