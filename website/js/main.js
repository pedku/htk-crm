/* ============================================================
   HTK INGENIERIA — main.js
   Interactividad completa del sitio
   ============================================================ */

(function () {
  'use strict';

  /* ==========================================================
     1. INICIALIZACIÓN
     ========================================================== */

  document.addEventListener('DOMContentLoaded', function () {
    initAOS();
    initNavbar();
    initSmoothScroll();
    initActiveLinkTracking();
    initCounters();
    initContactForm();
    initCopyrightYear();
    initParticles();
  });

  /* ==========================================================
     2. AOS (Animate On Scroll)
     ========================================================== */

  function initAOS() {
    AOS.init({
      duration: 800,
      easing: 'ease-out-cubic',
      once: true,
      offset: 100,
      disable: 'mobile' // Keep animations but respect reduced motion on mobile
    });

    // Re-enable on mobile but faster
    if (window.innerWidth < 768) {
      AOS.init({
        duration: 600,
        easing: 'ease-out-cubic',
        once: true,
        offset: 60
      });
    }
  }

  /* ==========================================================
     3. NAVBAR SCROLL BEHAVIOR
     ========================================================== */

  function initNavbar() {
    var nav = document.getElementById('mainNav');
    if (!nav) return;

    var scrollThreshold = 100;

    function updateNavbar() {
      if (window.scrollY > scrollThreshold) {
        nav.classList.add('navbar-scrolled');
      } else {
        nav.classList.remove('navbar-scrolled');
      }
    }

    // Initial check
    updateNavbar();

    // Throttled scroll listener
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (!ticking) {
        window.requestAnimationFrame(function () {
          updateNavbar();
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });

    // Close mobile nav on link click
    var navLinks = nav.querySelectorAll('.nav-link');
    var navbarCollapse = nav.querySelector('.navbar-collapse');

    navLinks.forEach(function (link) {
      link.addEventListener('click', function () {
        if (navbarCollapse.classList.contains('show')) {
          var bsCollapse = bootstrap.Collapse.getInstance(navbarCollapse);
          if (bsCollapse) bsCollapse.hide();
        }
      });
    });
  }

  /* ==========================================================
     4. SMOOTH SCROLL
     ========================================================== */

  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
      anchor.addEventListener('click', function (e) {
        var targetId = this.getAttribute('href');
        if (targetId === '#') return;

        var target = document.querySelector(targetId);
        if (!target) return;

        e.preventDefault();

        var targetPosition = target.getBoundingClientRect().top + window.pageYOffset - 90;

        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
      });
    });
  }

  /* ==========================================================
     5. ACTIVE LINK TRACKING (IntersectionObserver)
     ========================================================== */

  function initActiveLinkTracking() {
    var sections = document.querySelectorAll('section[id]');
    var navLinks = document.querySelectorAll('#mainNav .nav-link[href^="#"]');

    if (!sections.length || !navLinks.length) return;

    var observerOptions = {
      root: null,
      rootMargin: '-30% 0px -65% 0px',
      threshold: 0
    };

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var id = entry.target.getAttribute('id');
          setActiveLink(id);
        }
      });
    }, observerOptions);

    sections.forEach(function (section) {
      observer.observe(section);
    });

    function setActiveLink(id) {
      navLinks.forEach(function (link) {
        link.classList.remove('active');
        if (link.getAttribute('href') === '#' + id) {
          link.classList.add('active');
        }
      });
    }
  }

  /* ==========================================================
     6. COUNTERS (IntersectionObserver)
     ========================================================== */

  function initCounters() {
    var counters = document.querySelectorAll('.counter');
    if (!counters.length) return;

    var hasAnimated = false;

    var observerOptions = {
      root: null,
      rootMargin: '0px',
      threshold: 0.3
    };

    var observer = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting && !hasAnimated) {
          hasAnimated = true;
          animateAllCounters();
          obs.disconnect();
        }
      });
    }, observerOptions);

    // Observe the counters container
    var countersContainer = document.getElementById('counters');
    if (countersContainer) {
      observer.observe(countersContainer);
    }

    function animateAllCounters() {
      counters.forEach(function (counter) {
        animateCounter(counter);
      });
    }

    function animateCounter(counter) {
      var target = parseInt(counter.getAttribute('data-target'), 10);
      if (isNaN(target)) return;

      var duration = 2000; // ms
      var stepTime = Math.abs(Math.floor(duration / target));
      var current = 0;
      var step = Math.max(1, Math.ceil(target / (duration / 16)));

      function update() {
        current += step;
        if (current >= target) {
          counter.textContent = target;
          return;
        }
        counter.textContent = current;
        requestAnimationFrame(function () {
          setTimeout(update, stepTime);
        });
      }

      update();
    }
  }

  /* ==========================================================
     7. CONTACT FORM
     ========================================================== */

  function initContactForm() {
    var form = document.getElementById('contactForm');
    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      // Reset
      form.classList.remove('was-validated');

      // Validate
      if (!form.checkValidity()) {
        form.classList.add('was-validated');
        // Scroll to first invalid field
        var firstInvalid = form.querySelector(':invalid');
        if (firstInvalid) {
          firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
          firstInvalid.focus();
        }
        return;
      }

      // Show toast
      showToast();

      // Reset form
      form.reset();
      form.classList.remove('was-validated');
    });

    // Real-time validation cleanup
    form.querySelectorAll('input, textarea').forEach(function (field) {
      field.addEventListener('input', function () {
        if (field.checkValidity()) {
          field.classList.remove('is-invalid');
        }
      });

      field.addEventListener('blur', function () {
        if (form.classList.contains('was-validated')) {
          if (!field.checkValidity()) {
            field.classList.add('is-invalid');
          } else {
            field.classList.remove('is-invalid');
          }
        }
      });
    });
  }

  function showToast() {
    var toastEl = document.getElementById('confirmationToast');
    if (!toastEl) return;

    var toast = new bootstrap.Toast(toastEl, {
      delay: 4000,
      autohide: true
    });
    toast.show();
  }

  /* ==========================================================
     8. COPYRIGHT YEAR
     ========================================================== */

  function initCopyrightYear() {
    var yearEl = document.getElementById('year');
    if (yearEl) {
      yearEl.textContent = new Date().getFullYear();
    }
  }

  /* ==========================================================
     9. CANVAS PARTICLES (Hero)
     ========================================================== */

  function initParticles() {
    var canvas = document.getElementById('particlesCanvas');
    if (!canvas) return;

    var ctx = canvas.getContext('2d');
    var particles = [];
    var maxParticles = 60;
    var animationId;

    function resizeCanvas() {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }

    function createParticle() {
      return {
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        radius: Math.random() * 1.8 + 0.4,
        alpha: Math.random() * 0.4 + 0.1,
        alphaSpeed: (Math.random() - 0.5) * 0.008
      };
    }

    function initParticlesArray() {
      particles.length = 0;
      for (var i = 0; i < maxParticles; i++) {
        particles.push(createParticle());
      }
    }

    function drawParticles() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach(function (p) {
        // Update alpha
        p.alpha += p.alphaSpeed;
        if (p.alpha <= 0.05 || p.alpha >= 0.5) {
          p.alphaSpeed *= -1;
        }

        // Move
        p.x += p.vx;
        p.y += p.vy;

        // Wrap around
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        // Draw
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, ' + p.alpha + ')';
        ctx.fill();
      });

      // Draw connecting lines between nearby particles
      for (var i = 0; i < particles.length; i++) {
        for (var j = i + 1; j < particles.length; j++) {
          var dx = particles[i].x - particles[j].x;
          var dy = particles[i].y - particles[j].y;
          var dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 140) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = 'rgba(255, 255, 255, ' + (0.06 * (1 - dist / 140)) + ')';
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      animationId = requestAnimationFrame(drawParticles);
    }

    // Handle visibility change to save resources
    function handleVisibility() {
      if (document.hidden) {
        if (animationId) {
          cancelAnimationFrame(animationId);
          animationId = null;
        }
      } else {
        if (!animationId) {
          drawParticles();
        }
      }
    }

    // Handle resize
    var resizeTimeout;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(function () {
        resizeCanvas();
        initParticlesArray();
      }, 250);
    });

    document.addEventListener('visibilitychange', handleVisibility);

    // Start
    resizeCanvas();
    initParticlesArray();
    drawParticles();
  }

})();
