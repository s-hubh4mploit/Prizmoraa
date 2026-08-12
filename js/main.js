document.addEventListener('DOMContentLoaded', () => {
  // Nav scroll shadow
  const nav = document.getElementById('siteNav');
  if (nav) {
    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', window.scrollY > 12);
    });
  }

  // Mobile nav toggle
  const toggle = document.getElementById('navToggle');
  const links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', () => {
      const open = links.style.display === 'flex';
      links.style.display = open ? 'none' : 'flex';
      if (!open) {
        links.style.cssText = 'display:flex; position:absolute; top:64px; left:0; right:0; background:#FBF7F1; flex-direction:column; padding:20px 32px; gap:18px; border-bottom:1px solid rgba(58,42,29,0.08);';
      }
    });

    document.querySelectorAll('.nav-links a').forEach(a => {
      a.addEventListener('click', () => {
        if (window.innerWidth <= 980) links.style.display = 'none';
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
