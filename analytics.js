(function () {
  const MEASUREMENT_ID = "G-8M0ZS19L72";

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  window.gtag("js", new Date());
  window.gtag("config", MEASUREMENT_ID);

  const tag = document.createElement("script");
  tag.async = true;
  tag.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`;
  document.head.appendChild(tag);

  window.VeloAnalytics = {
    trackMvpSignup() {
      window.gtag("event", "mvp_signup", {
        signup_source: `${window.location.pathname}${window.location.search}`,
      });
    },
  };
})();
