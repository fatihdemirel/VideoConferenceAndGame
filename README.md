# Oyun Masaları

Oyuncuların adlarıyla katıldığı, açık oyun masalarını görüp yeni masa oluşturabildiği gerçek zamanlı oyun uygulaması. Oyun sırasında oyuncular WebRTC ile sesli/görüntülü görüşebilir.

## Özellikler

- 🎥 Gerçek zamanlı video ve ses
- 🎤 Mikrofon aç/kapa
- 📹 Kamera aç/kapa
- 🎲 Canlı oyun lobisi ve açık masa listesi
- 🪑 Oyun türü seçerek masa oluşturma ve masaya katılma
- ♟️ İki kişilik satranç, XOX, Amiral Battı ve Lingo
- 🧩 İki kişilik, 4×5 veya 5×6 taşlı hafıza eşleştirme oyunu
- 📱 Responsive arayüz
- 🎮 **Oyunlar:**
  - **Satranç** – Hamle animasyonları ve skor takibi
  - **XOX (TicTacToe)** – Klasik 3x3 X-O oyunu
  - **Amiral Battı** – İki kişilik deniz savaşı ve filo yerleştirme
  - **Lingo** – 4, 5 veya 6 harfli yaygın Türkçe kelimeleri 30 saniyelik sırayla tahmin etme
  - **Aynısını Bul** – 4×5 veya 5×6 tahtada hayvan ve eşya çiftlerini bulma; yanlış eşleşmede sıra rakibe geçer

## Proje yapısı

```
VideoConf/
├── client/
│   ├── games/       # Her oyunun arayüz ve etkileşim kodu
│   └── ...          # Uygulama arayüzü (HTML, CSS, JS)
├── server/
│   ├── games/       # Tüm oyun kuralları (XOX, Amiral Battı, Satranç, Lingo ve eşleştirme)
│   └── server.js    # Signaling sunucusu ve oyun olayları
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

1. Tarayıcıda `http://localhost:3000` adresini açın.
2. Masada görünecek adınızı yazıp **Masaları gör** butonuna tıklayın.
3. Var olan açık bir masaya katılın veya oyun türünü seçip **Masa aç** butonuna tıklayın.
4. Rakibiniz masaya katılınca oyun otomatik başlar.
5. Oyun ekranından isterseniz mikrofonunuzu, kameranızı veya ekran paylaşımını açın.

## Oyunlar

Her masa iki oyuncu içindir. Masa sahibi oyunu seçer; ikinci oyuncu açık masalardan birine katılarak oyunu başlatır.

- **Satranç:** Sırayla hamle yapın; yeniden başlatma için rakip onayı gerekir.
- **XOX:** Klasik üçe üç X-O oyunu; yeniden başlatma için rakip onayı gerekir.
- **Amiral Battı:** Her oyuncu gemilerini yerleştirir, ardından sırayla ateş eder. Tüm düşman gemilerini batıran kazanır.
- **Lingo:** Oyun açılırken 4, 5 veya 6 harf seçilir. Oyuncular yaygın Türkçe kelimeler arasından belirlenen aynı kelimeyi ekrandaki harf klavyesiyle sırayla, her turda 30 saniye içinde tahmin eder. Yeşil harf doğru yerde, sarı harf kelimede başka bir yerde bulunur; doğru konumdaki harfler sonraki tahmin satırında korunur.
- **Aynısını Bul:** 4×5 (10 çift) veya 5×6 (15 çift) tahtada hayvan ve eşya kartlarını eşleştirin. Eşleşme bulan oyuncu oynamaya devam eder; eşleşme olmazsa kartlar kapanır ve sıra rakibe geçer.

Yeni tur rakip onayıyla başlatıldığında ilk hamle/tahmin sırası oyuncular arasında değişir.

## Geliştirme

- Mikrofon ve kamera erişimi için HTTPS veya localhost gerekir
- İki kişilik görüşme için STUN sunucuları yeterlidir
- Daha fazla katılımcı için TURN sunucusu eklenebilir

## Lisans

MIT
