/**
 * Self-signed HTTPS sertifikası oluşturur (OpenSSL gerekmez).
 * Sertifikalar cert/ klasörüne yazılır. Çalıştırın: npm run cert
 */
const fs = require('fs');
const path = require('path');

const CERT_DIR = path.join(__dirname, '..', 'cert');
const certPath = path.join(CERT_DIR, 'cert.pem');
const keyPath = path.join(CERT_DIR, 'key.pem');

if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  console.log('cert.pem ve key.pem zaten mevcut (cert/ klasöründe).');
  process.exit(0);
}

if (!fs.existsSync(CERT_DIR)) {
  fs.mkdirSync(CERT_DIR, { recursive: true });
}

async function main() {
  try {
    const selfsigned = require('selfsigned');
    const attrs = [{ name: 'commonName', value: 'localhost' }];
    const pems = await selfsigned.generate(attrs, { days: 365, keySize: 2048 });
    fs.writeFileSync(certPath, pems.cert);
    fs.writeFileSync(keyPath, pems.private);
    console.log('Sertifika oluşturuldu: cert/cert.pem, cert/key.pem');
  } catch (e) {
    console.error('Hata: selfsigned paketi gerekli. Çalıştırın: npm install selfsigned');
    console.error('Sonra tekrar: npm run cert');
    process.exit(1);
  }
}

main();
