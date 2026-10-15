const { getDefaultConfig } = require('expo/metro-config');
const https = require('https');
const url = require('url');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

const TARGET_HOST = 'test.yourbuildmart.com';

config.server = {
  ...config.server,
  enhanceMiddleware: (metroMiddleware) => {
    return (req, res, next) => {
      // Proxy /api/* calls to backend to eliminate browser CORS blocks during local web development
      if (req.url && req.url.startsWith('/api')) {
        // Handle preflight OPTIONS requests directly
        if (req.method === 'OPTIONS') {
          res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, X-Requested-With'
          });
          return res.end();
        }

        const parsed = url.parse(req.url);
        const headers = { ...req.headers };
        delete headers['host'];
        delete headers['origin'];
        delete headers['referer'];

        const options = {
          hostname: TARGET_HOST,
          port: 443,
          path: parsed.path,
          method: req.method,
          headers: {
            ...headers,
            host: TARGET_HOST,
            origin: `https://${TARGET_HOST}`,
            referer: `https://${TARGET_HOST}/`
          }
        };

        const proxyReq = https.request(options, (proxyRes) => {
          const resHeaders = {
            ...proxyRes.headers,
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
            'access-control-allow-headers': 'Content-Type, Authorization, Accept, X-Requested-With'
          };
          res.writeHead(proxyRes.statusCode, resHeaders);
          proxyRes.pipe(res);
        });

        proxyReq.on('error', (err) => {
          console.error('[Metro Proxy Error]:', err.message);
          res.writeHead(502, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(JSON.stringify({ error: 'BAD_GATEWAY', message: err.message }));
        });

        req.pipe(proxyReq);
        return;
      }

      return metroMiddleware(req, res, next);
    };
  }
};

module.exports = config;
