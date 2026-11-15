/* Shared Google Analytics consent for lipu.dev sites. Served by the lipu-geo Worker at
   https://geo.lipu.dev/consent.js; source: komapc/lipu-hub geo/client/consent.js.

   <script defer src="https://geo.lipu.dev/consent.js" data-ga="G-XXXXXXX"></script>
     data-ga      GA4 Measurement ID (required; without it the script does nothing)
     data-accent  button colour, any CSS colour or var(...) (default #4f46e5)
     data-msg     banner text in the page language, replacing the built-in one
     data-privacy URL of the site's privacy page; adds a "Details" link to the banner

   The choice is kept per site in localStorage "lipu-consent" ("yes" | "no"), the same
   key the per-site copies used, so earlier choices carry over. window.gtag exists only
   once GA is loaded; call it guarded.

   With no stored choice the script asks https://geo.lipu.dev/ whether the visitor's
   region needs opt-in (EU/EEA, UK, CH, unknown). Only a literal
   {"consentRequired": false} within 1.5 s loads GA straight away, with a one-time
   notice and an Opt out button; that implied grant is not stored, so it is re-checked
   every visit. Anything else (error, timeout, other value) shows Allow/Decline and loads
   nothing until Allow.

   To let visitors change their choice, add an element with data-lipu-consent-open
   (e.g. <a href="#" data-lipu-consent-open>Analytics settings</a>) or call
   window.lipuConsent.open(). Opting out stops GA and deletes its _ga cookies. */
(function () {
  var me = document.currentScript;
  var GA = me && me.dataset.ga;
  if (!GA || window.lipuConsent) return;
  var ACCENT = (me.dataset.accent || '#4f46e5').replace(/[;{}<>]/g, '');
  var MSG = me.dataset.msg;
  var PRIVACY = me.dataset.privacy;
  var KEY = 'lipu-consent';
  var NOTICE_KEY = 'lipu-consent-notice';
  var GEO_URL = 'https://geo.lipu.dev/';
  var GEO_TIMEOUT_MS = 1500;
  var get = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
  var set = function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} };

  function load() {
    window['ga-disable-' + GA] = false;
    if (window.__gaLoaded) return;
    window.__gaLoaded = true;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA);
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA, { anonymize_ip: true });
  }

  // Stops further hits from an already-loaded GA and deletes its cookies.
  function unload() {
    window['ga-disable-' + GA] = true;
    var host = location.hostname;
    var domains = ['', '; domain=' + host, '; domain=.' + host, '; domain=.' + host.split('.').slice(-2).join('.')];
    document.cookie.split(';').forEach(function (part) {
      var name = part.split('=')[0].trim();
      if (name.indexOf('_ga') !== 0) return;
      domains.forEach(function (d) {
        document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + d;
      });
    });
  }

  function consentNotRequired() {
    return new Promise(function (resolve) {
      try {
        var ctrl = new AbortController();
        setTimeout(function () { ctrl.abort(); resolve(false); }, GEO_TIMEOUT_MS);
        fetch(GEO_URL, { signal: ctrl.signal, credentials: 'omit', cache: 'no-store' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) { resolve(!!d && d.consentRequired === false); })
          .catch(function () { resolve(false); });
      } catch (e) { resolve(false); }
    });
  }

  var T = {
    en: { msg: 'We use Google Analytics (cookies) to count visits.', more: 'You can opt out at any time.', allow: 'Allow', decline: 'Decline', ok: 'OK', optOut: 'Opt out', details: 'Details' },
    eo: { msg: 'Ni uzas Google Analytics (kuketojn) por kalkuli vizitojn.', more: 'Vi povas malaliĝi iam ajn.', allow: 'Permesi', decline: 'Rifuzi', ok: 'Bone', optOut: 'Malaliĝi', details: 'Detaloj' },
    io: { msg: 'Ni uzas Google Analytics (kuketi) por kontar viziti.', more: 'Vu povas refuzar ulatempe.', allow: 'Permisar', decline: 'Refuzar', ok: 'Bone', optOut: 'Refuzar', details: 'Detali' },
    ru: { msg: 'Мы используем Google Analytics (cookie), чтобы считать посещения.', more: 'Отказаться можно в любой момент.', allow: 'Разрешить', decline: 'Отказаться', ok: 'OK', optOut: 'Отказаться', details: 'Подробнее' },
    uk: { msg: 'Ми використовуємо Google Analytics (cookie), щоб рахувати відвідування.', more: 'Відмовитися можна будь-коли.', allow: 'Дозволити', decline: 'Відмовитися', ok: 'OK', optOut: 'Відмовитися', details: 'Докладніше' },
    be: { msg: 'Мы выкарыстоўваем Google Analytics (cookie), каб лічыць наведванні.', more: 'Адмовіцца можна ў любы момант.', allow: 'Дазволіць', decline: 'Адмовіцца', ok: 'OK', optOut: 'Адмовіцца', details: 'Падрабязней' },
    he: { msg: 'אנחנו משתמשים ב־Google Analytics (עוגיות) כדי לספור ביקורים.', more: 'אפשר לבטל בכל עת.', allow: 'אישור', decline: 'דחייה', ok: 'הבנתי', optOut: 'ביטול', details: 'פרטים' }
  };

  var close = null;

  // mode "ask": Allow / Decline, nothing loaded yet. mode "notice": GA already running; OK / Opt out.
  function show(mode) {
    if (close) close();
    var l = (document.documentElement.lang || 'en').slice(0, 2).toLowerCase();
    var t = T[l] || T.en;
    var notice = mode === 'notice';
    var msg = MSG || t.msg;
    var st = document.createElement('style');
    st.textContent = '#lipu-consent{position:fixed;left:12px;right:12px;bottom:12px;max-width:560px;margin:0 auto;padding:12px 14px;' +
      'background:#fff;color:#1f1b16;border:1px solid #cfc6b6;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.18);' +
      'font:14px/1.4 system-ui,sans-serif;z-index:2147483000;display:flex;flex-wrap:wrap;gap:8px;align-items:center}' +
      '#lipu-consent a{color:inherit}#lipu-consent span{flex:1 1 220px}#lipu-consent button{font:inherit;padding:6px 12px;border-radius:8px;cursor:pointer;' +
      'border:1px solid ' + ACCENT + ';background:none;color:inherit}#lipu-consent button.y{background:' + ACCENT + ';color:#fff}' +
      '@media(max-width:480px){#lipu-consent span{flex-basis:100%}}' +
      '@media(prefers-color-scheme:dark){#lipu-consent{background:#1e1b16;color:#f1ebe0;border-color:#5a5144}}';
    var d = document.createElement('div');
    d.id = 'lipu-consent';
    d.setAttribute('role', notice ? 'status' : 'dialog');
    d.setAttribute('aria-label', 'Cookie consent');
    var sp = document.createElement('span'); sp.textContent = notice ? msg + ' ' + t.more : msg;
    var y = document.createElement('button'); y.type = 'button'; y.className = 'y'; y.textContent = notice ? t.ok : t.allow;
    var n = document.createElement('button'); n.type = 'button'; n.textContent = notice ? t.optOut : t.decline;
    close = function () { d.remove(); st.remove(); close = null; };
    y.onclick = function () {
      if (notice) set(NOTICE_KEY, '1');
      else { set(KEY, 'yes'); load(); }
      close();
    };
    n.onclick = function () { set(KEY, 'no'); unload(); close(); };
    d.append(sp, y, n);
    if (PRIVACY) {
      var a = document.createElement('a'); a.href = PRIVACY; a.textContent = t.details;
      d.append(a);
    }
    document.head.appendChild(st);
    document.body.appendChild(d);
  }

  function whenBody(fn) {
    if (document.body) fn(); else document.addEventListener('DOMContentLoaded', fn);
  }

  window.lipuConsent = { open: function () { whenBody(function () { show('ask'); }); } };
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest && e.target.closest('[data-lipu-consent-open]');
    if (!el) return;
    e.preventDefault();
    window.lipuConsent.open();
  });

  var c = get(KEY);
  if (c === 'yes') load();
  else if (c !== 'no') {
    consentNotRequired().then(function (notRequired) {
      var now = get(KEY);
      if (now === 'yes' || now === 'no') return;
      if (notRequired) {
        load();
        if (!get(NOTICE_KEY)) whenBody(function () { show('notice'); });
      } else {
        whenBody(function () { show('ask'); });
      }
    });
  }
})();
