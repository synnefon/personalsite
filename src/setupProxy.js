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
};
