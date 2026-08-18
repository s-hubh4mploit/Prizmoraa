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
