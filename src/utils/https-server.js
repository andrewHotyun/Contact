const https = require('https');
const http = require('http');
const fs = require('fs');
const { exec } = require('child_process');
const os = require('os');

const getLocalIpAddress = () => {
  // Використовуємо фіксований IP для віддаленого доступу
  const targetIp = '192.168.50.125';
  
  // Перевіряємо чи цей IP доступний в мережі
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        // Якщо знайшли IP в діапазоні 192.168.x.x, використовуємо його
        if (iface.address.startsWith('192.168.')) {
          return iface.address;
        }
      }
    }
  }
  
  // Якщо не знайшли 192.168.x.x, повертаємо фіксований IP
  return targetIp;
};

const localIp = getLocalIpAddress();

// Створюємо самопідписаний сертифікат з Subject Alternative Name
const createSelfSignedCert = () => {
  return new Promise((resolve, reject) => {
    // Створюємо конфігураційний файл для OpenSSL
    const sslConfig = `[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
C = UA
ST = Ukraine
L = Kyiv
O = ContactApp
OU = IT Department
CN = ${localIp}

[v3_req]
keyUsage = keyEncipherment, dataEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
IP.1 = ${localIp}
IP.2 = 127.0.0.1
DNS.1 = localhost
DNS.2 = ${localIp}`;

    // Записуємо конфігураційний файл
    fs.writeFileSync('ssl.conf', sslConfig);

    // Створюємо приватний ключ
    exec('openssl genrsa -out key.pem 4096', (error, stdout, stderr) => {
      if (error) {
        console.error('Error creating private key:', error);
        reject(error);
        return;
      }

      // Створюємо сертифікат
      exec('openssl req -new -x509 -key key.pem -out cert.pem -days 365 -config ssl.conf -extensions v3_req', (error, stdout, stderr) => {
        // Видаляємо тимчасовий файл
        if (fs.existsSync('ssl.conf')) {
          fs.unlinkSync('ssl.conf');
        }

        if (error) {
          console.error('Error creating certificate:', error);
          reject(error);
        } else {
          console.log('Certificate created successfully with Subject Alternative Name');
          resolve();
        }
      });
    });
  });
};

const startHttpsServer = () => {
  // Перевіряємо чи існують сертифікати
  if (!fs.existsSync('key.pem') || !fs.existsSync('cert.pem')) {
    console.log('Creating self-signed certificate...');
    createSelfSignedCert().then(() => {
      startHttpsServer();
    }).catch(console.error);
    return;
  }

  const options = {
    key: fs.readFileSync('key.pem'),
    cert: fs.readFileSync('cert.pem')
  };

  const server = https.createServer(options, (req, res) => {
    // Простий проксі до React dev server
    const proxyReq = http.request({
      hostname: 'localhost',
      port: 3000,
      path: req.url,
      method: req.method,
      headers: req.headers
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.log('React server not ready, waiting...');
      res.writeHead(503, { 
        'Content-Type': 'text/html',
        'Retry-After': '2'
      });
      res.end(`
        <html>
          <head>
            <title>Loading...</title>
            <meta http-equiv="refresh" content="2">
          </head>
          <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1>🔄 Loading Contact App...</h1>
            <p>Please wait while the server starts up.</p>
            <p>This page will refresh automatically.</p>
          </body>
        </html>
      `);
    });

    req.pipe(proxyReq);
  });

  server.listen(3443, '0.0.0.0', () => {
    console.log(`🚀 HTTPS server running on https://${localIp}:3443`);
    console.log(`🌐 Access from other devices: https://${localIp}:3443`);
    console.log('📹 You can now access the app with camera/microphone permissions!');
    console.log('⚠️  Note: You may need to accept the self-signed certificate in your browser');
    console.log('   - Chrome/Edge: Click "Advanced" → "Proceed to site"');
    console.log('   - Firefox: Click "Advanced" → "Accept the Risk and Continue"');
    console.log('   - Safari: Click "Show Details" → "visit this website"');
  });
};

startHttpsServer();
