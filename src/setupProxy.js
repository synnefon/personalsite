const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function (app) {
  app.use(
    "/journeynorth",
    createProxyMiddleware({
      target: "https://maps.journeynorth.org",
      changeOrigin: true,
      pathRewrite: { "^/journeynorth": "" },
    })
  );
  // Dev-only escape from the oura api's CORS origin allowlist
  app.use(
    "/oura-api",
    createProxyMiddleware({
      target: "https://api.ouraring.com",
      changeOrigin: true,
      pathRewrite: { "^/oura-api": "" },
    })
  );
};
