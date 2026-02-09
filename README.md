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
