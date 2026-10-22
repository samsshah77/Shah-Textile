'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'
import './landing.css'

const STEPS = [
  { title: 'Yarn & warping', text: 'Yarn packages are checked for count and set on the creel. Warp is wound to the length and ends the order needs.' },
  { title: 'Beam & drawing-in', text: 'The warp beam is drawn through heddles and reed to the fabric design, then knotted onto the loom.' },
  { title: 'Weaving', text: 'Looms run with pick, reed and width set per quality. Every loom and shift is recorded in our production system.' },
  { title: 'Inspection & release', text: 'Greige cloth is checked, measured and released undyed, ready for bleaching, dyeing or finishing.' },
]

const SERVICES = [
  {
    title: 'Electronic card repair',
    text: 'Our electronics bench diagnoses and repairs loom control and driver cards. Send a failed card or book support against your downtime.',
  },
  {
    title: 'Loom spare parts',
    text: 'Mechanical and loom-line spares from working mill stock. Ask by part number, assembly, or for an equivalent.',
  },
  {
    title: 'Pre-owned weaving machines',
    text: 'Used looms from real mill service, for mills that need capacity or a replacement without long lead times.',
  },
  {
    title: 'Part work at labour cost',
    text: 'If a part needs fitting or bench work before it goes back on the loom, we do it at labour cost; parts are priced separately.',
  },
]

/** Warp threads for the hero layer (fixed list so server and browser render the same). */
const THREADS = Array.from({ length: 64 }, (_, i) => ({
  x: (i / 63) * 100,
  w: i % 7 === 0 ? 1.6 : i % 3 === 0 ? 1.1 : 0.7,
  o: i % 5 === 0 ? 0.55 : i % 2 === 0 ? 0.32 : 0.2,
}))

export default function HomePage() {
  const { isAuthenticated, logout, isLoggingOut } = useAuth()
  const [mounted, setMounted] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- login state is only known in the browser
    setMounted(true)
  }, [])
  const isLoggedIn = mounted && isAuthenticated

  // Parallax: each [data-depth] layer moves at its own speed while its section is on screen.
  useEffect(() => {
    const el = root.current
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const layers = [...el.querySelectorAll<HTMLElement>('[data-depth]')]
    const progress = [...el.querySelectorAll<HTMLElement>('[data-progress]')]
    let frame = 0
    let pointerX = 0
    let pointerY = 0

    const paint = () => {
      frame = 0
      const vh = window.innerHeight
      setScrolled(window.scrollY > 24)
      if (reduce) return
      for (const layer of layers) {
        const box = (layer.closest('[data-parallax]') as HTMLElement | null) || layer
        const r = box.getBoundingClientRect()
        if (r.bottom < -200 || r.top > vh + 200) continue
        const depth = Number(layer.dataset.depth) || 0
        // 0 when the section's centre is at the viewport centre.
        const offset = (r.top + r.height / 2 - vh / 2) * depth
        const tilt = layer.dataset.tilt ? Number(layer.dataset.tilt) : 0
        layer.style.transform = `translate3d(${(pointerX * tilt).toFixed(2)}px, ${offset.toFixed(2)}px, 0)`
      }
      for (const p of progress) {
        const r = p.getBoundingClientRect()
        const t = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (r.height + vh * 0.35)))
        p.style.setProperty('--progress', t.toFixed(3))
      }
      const hero = el.querySelector<HTMLElement>('.st-hero')
      if (hero) {
        const h = hero.getBoundingClientRect()
        const t = Math.min(1, Math.max(0, -h.top / h.height))
        hero.style.setProperty('--leave', t.toFixed(3))
        hero.style.setProperty('--py', pointerY.toFixed(3))
      }
    }
    const request = () => {
      if (!frame) frame = requestAnimationFrame(paint)
    }
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      pointerX = (e.clientX / window.innerWidth - 0.5) * 2
      pointerY = (e.clientY / window.innerHeight - 0.5) * 2
      request()
    }
    paint()
    window.addEventListener('scroll', request, { passive: true })
    window.addEventListener('resize', request)
    window.addEventListener('pointermove', onPointer, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', request)
      window.removeEventListener('resize', request)
      window.removeEventListener('pointermove', onPointer)
    }
  }, [])

  // Reveal blocks once as they come into view.
  useEffect(() => {
    const el = root.current
    if (!el) return
    const items = [...el.querySelectorAll<HTMLElement>('[data-reveal]')]
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      items.forEach((i) => i.classList.add('is-in'))
      return
    }
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-in')
            io.unobserve(e.target)
          }
        }),
      { threshold: 0.2, rootMargin: '0px 0px -8% 0px' }
    )
    items.forEach((i) => io.observe(i))
    return () => io.disconnect()
  }, [])

  const close = () => setMenuOpen(false)

  return (
    <div className="st-site" ref={root}>
      <a className="st-skip" href="#main">
        Skip to content
      </a>

      <nav className={`st-nav${scrolled ? ' is-solid' : ''}${menuOpen ? ' is-open' : ''}`} aria-label="Main">
        <div className="st-wrap st-nav__inner">
          <Link href="/" className="st-brand" onClick={close}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/media/site/logo.webp" alt="" width={36} height={36} />
            <span>Sara Textiles</span>
          </Link>
          <button
            type="button"
            className="st-nav__toggle"
            aria-expanded={menuOpen}
            aria-controls="st-menu"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span className="sr-only">Menu</span>
            <span aria-hidden="true" />
          </button>
          <div className="st-nav__menu" id="st-menu">
            <ul>
              <li>
                <a href="#process" onClick={close}>
                  How we weave
                </a>
              </li>
              <li>
                <a href="#services" onClick={close}>
                  Repair &amp; spares
                </a>
              </li>
              <li>
                <a href="#contact" onClick={close}>
                  Contact
                </a>
              </li>
            </ul>
            <div className="st-nav__staff">
              {isLoggedIn ? (
                <>
                  <Link href="/dashboard" className="st-btn st-btn--small st-btn--amber">
                    Open ERP
                  </Link>
                  <button type="button" className="st-btn st-btn--small st-btn--ghost" onClick={() => logout('/')} disabled={isLoggingOut}>
                    Sign out
                  </button>
                </>
              ) : (
                <Link href="/login" className="st-btn st-btn--small st-btn--ghost">
                  Staff login
                </Link>
              )}
            </div>
          </div>
        </div>
      </nav>

      <header className="st-hero" data-parallax>
        <div className="st-hero__photo" data-depth="-0.18" data-tilt="-6" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/media/site/modern-loom.webp"
            srcSet="/media/site/modern-loom-800.webp 800w, /media/site/modern-loom.webp 1920w"
            sizes="100vw"
            alt=""
            fetchPriority="high"
          />
        </div>
        <div className="st-hero__shade" aria-hidden="true" />
        <div className="st-hero__warp" data-depth="-0.36" data-tilt="10" aria-hidden="true">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none">
            {THREADS.map((t, i) => (
              <line key={i} x1={t.x} y1="0" x2={t.x} y2="100" strokeWidth={t.w} strokeOpacity={t.o} vectorEffect="non-scaling-stroke" />
            ))}
          </svg>
          <span className="st-hero__weft" />
        </div>
        <div className="st-wrap st-hero__copy" id="main">
          <h1>
            We weave greige
            <br />
            fabric for the
            <br />
            dye house.
          </h1>
          <p className="st-hero__lede">
            Yarn in, clean undyed cloth out — woven on modern looms, inspected, and released ready for bleaching, dyeing or
            finishing.
          </p>
          <div className="st-hero__cta">
            <a className="st-btn st-btn--amber" href="#contact">
              Ask about capacity
            </a>
            <a className="st-btn st-btn--line-light" href="#process">
              See how we weave
            </a>
          </div>
        </div>
        <a className="st-hero__scroll" href="#process" aria-label="Scroll to how we weave">
          <span />
        </a>
      </header>

      <main>
        <section className="st-process" id="process" data-progress>
          <div className="st-wrap">
            <div className="st-head" data-reveal>
              <h2>From yarn to greige, in four steps</h2>
              <p>Colour happens downstream. Our job is a stable, even cloth that takes dye the same way across every roll.</p>
            </div>
            <ol className="st-steps">
              {STEPS.map((s, i) => (
                <li key={s.title} data-reveal style={{ transitionDelay: `${i * 90}ms` }}>
                  <span className="st-steps__n">{i + 1}</span>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </li>
              ))}
            </ol>
            <div className="st-weft-line" aria-hidden="true">
              <span />
            </div>
          </div>
        </section>

        <section className="st-band" data-parallax aria-label="On the loom">
          <div className="st-band__photo" data-depth="-0.22" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/media/site/loom-warp.webp"
              srcSet="/media/site/loom-warp-800.webp 800w, /media/site/loom-warp.webp 1920w"
              sizes="100vw"
              alt=""
              loading="lazy"
            />
          </div>
          <div className="st-band__shade" aria-hidden="true" />
          <div className="st-wrap st-band__copy" data-depth="0.08">
            <p className="st-band__quote">
              Thousands of warp ends, one pick at a time. The reed beats every weft into place so the cloth comes off the loom
              even, edge to edge.
            </p>
          </div>
        </section>

        <section className="st-weave" aria-labelledby="weave-title">
          <div className="st-wrap st-weave__grid">
            <figure className="st-weave__figure" data-parallax data-reveal>
              <div data-depth="-0.08">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/media/site/loom-weaving.webp"
                  srcSet="/media/site/loom-weaving-800.webp 800w, /media/site/loom-weaving.webp 1200w"
                  sizes="(min-width: 900px) 50vw, 100vw"
                  alt="Grey cotton fabric being woven on a loom, with the loom's control panel beside it"
                  loading="lazy"
                />
              </div>
            </figure>
            <div className="st-weave__copy" data-reveal>
              <h2 id="weave-title">What leaves our floor</h2>
              <dl className="st-facts">
                <div>
                  <dt>Product</dt>
                  <dd>Greige (undyed) woven fabric, suiting and shirting qualities</dd>
                </div>
                <div>
                  <dt>Set per quality</dt>
                  <dd>Warp and weft yarn, reed, pick and width, held for the whole run</dd>
                </div>
                <div>
                  <dt>Tracked daily</dt>
                  <dd>Meters per loom and shift, efficiency and stoppages, in our own ERP</dd>
                </div>
                <div>
                  <dt>Delivered to</dt>
                  <dd>Bleaching, dyeing and finishing houses</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        <section className="st-services" id="services" aria-labelledby="services-title">
          <div className="st-wrap st-services__grid">
            <div className="st-services__intro" data-reveal>
              <h2 id="services-title">Keeping other mills running too</h2>
              <p>
                The team that keeps our own looms weaving also repairs loom electronics and supplies parts and machines to other
                mills.
              </p>
              <figure className="st-services__figure" data-parallax>
                <div data-depth="-0.1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/media/site/loom-industrial-800.webp"
                    srcSet="/media/site/loom-industrial-800.webp 800w, /media/site/loom-industrial.webp 1200w"
                    sizes="(min-width: 900px) 40vw, 100vw"
                    alt="Warp beam feeding a rapier loom on the mill floor"
                    loading="lazy"
                  />
                </div>
              </figure>
            </div>
            <ul className="st-services__list">
              {SERVICES.map((s) => (
                <li key={s.title} data-reveal>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="st-contact" id="contact" aria-labelledby="contact-title">
          <div className="st-wrap st-contact__inner" data-reveal>
            <div>
              <h2 id="contact-title">Tell us what you need woven, repaired or sourced</h2>
              <p>Greige capacity, a failed loom card, a spare part or a used machine — write to us with the details and we will reply.</p>
            </div>
            <div className="st-contact__actions">
              <a className="st-btn st-btn--amber" href="mailto:info@saratextilesweaving.com">
                Email info@saratextilesweaving.com
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="st-footer">
        <div className="st-wrap st-footer__inner">
          <span>© {new Date().getFullYear()} Sara Textiles Weaving</span>
          <Link href={isLoggedIn ? '/dashboard' : '/login'}>{isLoggedIn ? 'Open ERP' : 'Staff login'}</Link>
        </div>
      </footer>
    </div>
  )
}
