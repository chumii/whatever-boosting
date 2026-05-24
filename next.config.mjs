/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep trailing slashes on all URLs so that relative asset paths in the
  // vanilla HTML modules resolve correctly (e.g. "src/css/style.css" from
  // /boosting/ → /boosting/src/css/style.css, not /src/css/style.css).
  trailingSlash: true,

  async redirects() {
    return [
      // Kalender is the offi-stuff homepage – redirect root to it.
      { source: "/offi-stuff/", destination: "/offi-stuff/kalender/", permanent: false },
    ];
  },

  async rewrites() {
    // Next.js doesn't do directory-index serving from public/.
    // Only the trailing-slash variants are needed here because trailingSlash:true
    // redirects the no-slash versions before rewrites run.
    return [
      { source: "/boosting/",             destination: "/boosting/index.html" },
      { source: "/royale/",               destination: "/royale/index.html" },
      { source: "/royale/import/",        destination: "/royale/import/index.html" },
      // /offi-stuff/ now redirects to /kalender/ — member page lives at /offi-stuff/member/
      { source: "/offi-stuff/member/",    destination: "/offi-stuff/member/index.html" },
      { source: "/offi-stuff/kalender/",  destination: "/offi-stuff/kalender/index.html" },
    ];
  },
};

export default nextConfig;
