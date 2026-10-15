/* Applies the saved colour theme before the page paints (loaded in <head>, no inline script
   needed under the CSP). 'system' leaves the choice to prefers-color-scheme. */
(function () {
  try {
    var t = localStorage.getItem('bf.theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* storage blocked: follow the system */ }
})();
