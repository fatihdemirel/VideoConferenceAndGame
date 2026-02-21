# Video Konferans

WebRTC tabanlı basit video konferans uygulaması. Tarayıcıdan doğrudan peer-to-peer görüşme yapabilirsiniz.

## Özellikler

- 🎥 Gerçek zamanlı video ve ses
- 🖥️ Ekran paylaşımı
- 🎤 Mikrofon aç/kapa
- 📹 Kamera aç/kapa
- 🔗 Oda tabanlı katılım (aynı oda ID'si = aynı görüşme)
- 📱 Responsive arayüz
- 🎮 **Oyunlar** – Görüşme sırasında oynanabilir oyunlar:
  - **XOX (TicTacToe)** – Klasik 3x3 X-O oyunu
  - **Amiral Battı** – İki kişilik deniz savaşı oyunu

## Proje yapısı

```
VideoConf/
├── client/          # Ön yüz (HTML, CSS, JS)
├── server/          # Arka yüz (Node.js signaling sunucusu)
├── cert/            # HTTPS sertifika dosyaları (cert.pem, key.pem)
├── scripts/         # Yardımcı scriptler (sertifika oluşturma vb.)
├── package.json
└── README.md
```

## Teknolojiler

- **Backend:** Node.js, Express, Socket.io (signaling)
- **Frontend:** Vanilla JavaScript, WebRTC API
- **Kullanım:** getUserMedia, RTCPeerConnection, STUN sunucuları

## Kurulum

```bash
# Bağımlılıkları yükle
npm install

# Sunucuyu başlat
npm start
```

Uygulama `http://localhost:3000` adresinde çalışacaktır.

## HTTPS ile çalıştırma

Kamera/mikrofon birçok tarayıcıda yalnızca **güvenli bağlamda** (HTTPS veya localhost) çalışır. Uzaktan erişim veya mobilde test için HTTPS kullanın.

### Yerel (self-signed sertifika)

1. Sertifika oluşturun (OpenSSL gerekmez). **Proje klasöründe** (VideoConf) terminal/PowerShell açıp:

```bash
cd c:\Projects\VideoConf
npm install
npm run cert
```

veya doğrudan: `node scripts/create-cert.js` (sertifikalar `cert/` klasörüne yazılır)

2. Sunucuyu HTTPS ile başlatın:

```bash
set HTTPS=1
npm start
```

Windows PowerShell: `$env:HTTPS="1"; npm start`

3. Tarayıcıda `https://localhost:3000` açın. Self-signed uyarısında "Gelişmiş" → "localhost'a devam et" ile geçin.

**Alternatif (güvenilir yerel sertifika):** [mkcert](https://github.com/FiloSottile/mkcert) ile tarayıcı uyarı vermez:

```bash
mkcert -install
mkcert -key-file cert/key.pem -cert-file cert/cert.pem localhost 127.0.0.1
set HTTPS=1
npm start
```

### Kendi sertifikanız

Sertifika ve anahtar dosya yollarını ortam değişkeni ile verebilirsiniz:

```bash
set HTTPS=1
set SSL_CRT_FILE=C:\yol\cert.pem
set SSL_KEY_FILE=C:\yol\key.pem
npm start
```

### Canlı (production) yayın

- **Önerilen:** Uygulamayı HTTP (3000) ile çalıştırıp önüne **Nginx** veya **Caddy** koyun; SSL’i reverse proxy üzerinde sonlandırın (Let’s Encrypt ile ücretsiz sertifika).
- Alternatif: Node’u doğrudan HTTPS ile çalıştırıp Let’s Encrypt (örn. certbot) ile alınan `fullchain.pem` / `privkey.pem` dosyalarını `SSL_CRT_FILE` ve `SSL_KEY_FILE` ile kullanın.

## Kullanım

1. Tarayıcıda `http://localhost:3000` adresini açın
2. Oda ID girin (veya otomatik oluşturulanı kullanın)
3. **Odaya Katıl** butonuna tıklayın
4. Kamera/mikrofon izni verin
5. Başka bir sekme veya cihazda aynı oda ID'si ile katılın

**İpucu:** Aynı görüşmeye katılmak için tüm katılımcıların aynı oda ID'sini kullanması gerekir.

## Oyunlar

Konferans sırasında sol menüden (🎮) oyunlar açılabilir. Oyunlar yalnızca odaya katılan ilk iki oyuncu arasında oynanır:

- **XOX:** Biri oyunu seçer, diğeri "Katıl" ile oyuna girer. Skor tutulur; yeniden başlatmak için rakip onayı gerekir.
- **Amiral Battı:** Aynı şekilde seçim ve katılım. Her oyuncu gemilerini yerleştirir, ardından sırayla ateş eder. Tüm düşman gemilerini batıran kazanır.

## Geliştirme

- Mikrofon ve kamera erişimi için HTTPS veya localhost gerekir
- İki kişilik görüşme için STUN sunucuları yeterlidir
- Daha fazla katılımcı için TURN sunucusu eklenebilir

## Lisans

MIT
