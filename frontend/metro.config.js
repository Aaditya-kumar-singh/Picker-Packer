const { getDefaultConfig } = require('expo/metro-config');
const http = require('http');
const https = require('https');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);
const API_TARGET = new URL(process.env.EXPO_PUBLIC_API_BASE_URL || 'https://test.yourbuildmart.com/api');
const TARGET_HOST = API_TARGET.hostname;
const TARGET_PORT = Number(API_TARGET.port || (API_TARGET.protocol === 'http:' ? 80 : 443));
const TARGET_ORIGIN = `${API_TARGET.protocol}//${API_TARGET.host}`;
const proxyTransport = API_TARGET.protocol === 'http:' ? http : https;

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

        const parsed = new URL(req.url, 'http://localhost');
        const headers = { ...req.headers };
        delete headers['host'];
        delete headers['origin'];
        delete headers['referer'];

        const options = {
          hostname: TARGET_HOST,
          port: TARGET_PORT,
          path: `${parsed.pathname}${parsed.search}`,
          method: req.method,
          headers: {
            ...headers,
            host: TARGET_HOST,
            origin: TARGET_ORIGIN,
            referer: `${TARGET_ORIGIN}/`
          }
        };

        const proxyReq = proxyTransport.request(options, (proxyRes) => {
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
