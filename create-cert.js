/**
 * Self-signed HTTPS sertifikası oluşturur (OpenSSL gerekmez).
 * Proje klasöründe çalıştırın: node create-cert.js
 */
const fs = require('fs');
const path = require('path');

const certPath = path.join(__dirname, 'cert.pem');
const keyPath = path.join(__dirname, 'key.pem');

if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  console.log('cert.pem ve key.pem zaten mevcut.');
  process.exit(0);
}

async function main() {
  try {
    const selfsigned = require('selfsigned');
    const attrs = [{ name: 'commonName', value: 'localhost' }];
    const pems = await selfsigned.generate(attrs, { days: 365, keySize: 2048 });
    fs.writeFileSync(certPath, pems.cert);
    fs.writeFileSync(keyPath, pems.private);
    console.log('Sertifika oluşturuldu: cert.pem, key.pem');
  } catch (e) {
    console.error('Hata: selfsigned paketi gerekli. Çalıştırın: npm install selfsigned');
    console.error('Sonra tekrar: node create-cert.js');
    process.exit(1);
  }
}

main();
