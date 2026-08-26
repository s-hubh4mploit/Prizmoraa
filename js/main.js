// First-party page-view beacon for the admin dashboard's analytics panel.
// Fire-and-forget: never blocks rendering and never throws if it fails.
// This file is only included on storefront pages, not admin.html, so admin
// activity never inflates the visitor counts it displays.
(function trackVisit() {
  try {
    const STORAGE_KEY = 'prizmoraa_visitor_id';
    let visitorId = localStorage.getItem(STORAGE_KEY);
    if (!visitorId) {
      visitorId = (crypto.randomUUID ? crypto.randomUUID() : `v-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      localStorage.setItem(STORAGE_KEY, visitorId);
    }
    const payload = JSON.stringify({
      visitorId,
      path: window.location.pathname,
      referrer: document.referrer || '',
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/track-visit', new Blob([payload], { type: 'application/json' }));
    } else {
      fetch('/api/track-visit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {});
    }
  } catch (e) {}
})();

document.addEventListener('DOMContentLoaded', () => {
  // Nav scroll shadow
  const nav = document.getElementById('siteNav');
  if (nav) {
    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', window.scrollY > 12);
    });

    // Expose the nav's real height so sections below can fill exactly
    // the remaining viewport (used for the full-screen hero section).
    const syncNavHeight = () => {
      document.documentElement.style.setProperty('--nav-h', `${nav.offsetHeight}px`);
    };
    syncNavHeight();
    window.addEventListener('resize', syncNavHeight);
  }

  // Mobile nav toggle
  const toggle = document.getElementById('navToggle');
  const links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', () => {
      const isOpen = links.classList.toggle('open');
      toggle.classList.toggle('active', isOpen);
      toggle.setAttribute('aria-label', isOpen ? 'Close menu' : 'Menu');
      document.body.classList.toggle('nav-open', isOpen);
  });

    document.querySelectorAll('.nav-links a').forEach(a => {
    a.addEventListener('click', () => {
      links.classList.remove('open');
      toggle.classList.remove('active');
      document.body.classList.remove('nav-open');
    });
  });
}

  // Reveal on scroll
  const reveals = document.querySelectorAll('.reveal');
  if (reveals.length > 0) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.15 });
    
    reveals.forEach(el => io.observe(el));
  }
});
