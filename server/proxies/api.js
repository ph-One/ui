module.exports = function(app, options) {
  var path = require('path');
  var ForeverAgent = require('forever-agent');
  var HttpProxy = require('http-proxy');
  var httpServer = options.httpServer;

  var config = require('../../config/environment')().APP;
  var proxy = HttpProxy.createProxyServer({
    ws: true,
    xfwd: false,
    target: config.endpoint,
  });

  proxy.on('error', onProxyError);

  httpServer.on('upgrade', function proxyWsRequest(req, socket, head) {
    console.log('WS Proxy', req.method, 'to', req.url);
    proxy.ws(req, socket, head);
  });

  console.log('Proxying to', config.endpoint);

  var apiPath = '/v1';
  app.use(apiPath, function(req, res, next) {
    // include root path in proxied request
    req.url = path.join(apiPath, req.url);

    console.log('API Proxy', req.method, 'to', req.url);
    proxy.web(req, res);
  });

  var catalogPath = '/v1-catalog';
  app.use(catalogPath, function(req, res, next) {
    var catalogProxy = HttpProxy.createProxyServer({
      ws: true,
      xfwd: false,
      target: 'http://localhost:8088'
    });
    catalogProxy.on('error', onProxyError);

    // include root path in proxied request
    req.url = path.join(catalogPath, req.url);

    req.headers['user-agent'] = 'Rancher UI';

    console.log('Catalog Proxy', req.method, 'to', req.url);
    catalogProxy.web(req, res);
  });

};

function onProxyError(err, req, res) {
  console.log('Proxy Error: on', req.method,'to', req.url,':', err);
  var error = {
    type: 'error',
    status: 500,
    code: 'ProxyError',
    message: 'Error connecting to proxy',
    detail: err.toString()
  }

  if ( req.upgrade )
  {
    res.end();
  }
  else
  {
    res.writeHead(500, {'Content-Type': 'application/json'});
    res.end(JSON.stringify(error));
  }
}
