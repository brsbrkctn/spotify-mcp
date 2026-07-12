# Poke.ai ile Model Context Protocol (MCP) Entegrasyon Rehberi & Yol Haritası

Bu rehber, Spotify MCP sunucusunun bulut ortamında (Render) ve bulut tabanlı AI istemcileriyle (özellikle Poke.ai) entegrasyonu sürecinde karşılaşılan teknik engelleri, bu engellerin çözümlerini, doğru/yanlış mimari kararları ve gelecekteki MCP projeleriniz için altın kuralları içermektedir.

---

## 1. Mimari Tasarım: Bulut vs. Yerel Depolama (Doğrular & Yanlışlar)

### ❌ Yanlış Yöntem (Serverless + Yerel Dosya)
* **Senaryo**: Projeyi Vercel'e yükleyip token bilgilerini sunucudaki `.spotify-tokens.json` dosyasında saklamak.
* **Sorun**: Vercel sunucusuz (serverless) bir ortamdır ve dosya sistemi **geçicidir (ephemeral)**. Sunucu her kapandığında (10 saniye hareketsizlik sonrası veya yeniden deploy edildiğinde) tüm dosyalar silinir ve kullanıcı her seferinde tekrar `/login` yapmak zorunda kalır.

###  Doğru Yöntem (Serverless/Bulut + Kalıcı Veritabanı)
* **Senaryo**: Token bilgilerini buluttaki kalıcı bir veritabanında (**Supabase**) saklamak.
* **Çözüm**: Sunucu uyanırken veya token'ı yenilerken verileri Supabase'deki `spotify_auth` tablosundan okur/yazar. Sunucu sıfırlansa dahi bağlantı **ömür boyu** korunur.
* **Geriye Dönük Uyumluluk (Geliştirici Dostu)**: Sunucu, Supabase anahtarları tanımlı değilse yerel dosya sistemini kullanmaya devam edecek şekilde dinamik tasarlanmalıdır.

---

## 2. Karşılaşılan 5 Teknik Engel ve Çözümleri

### 1. Uyanma Gecikmesi & Port Bloklama (502 Bad Gateway)
* **Sorun**: Render ücretsiz planında sunucu 15 dakika istek almazsa uykuya dalar. İlk istekte uyanması 40 saniye sürer. Eğer kodda `await loadTokens()` diyerek Supabase sorgusu bitene kadar `app.listen()` çağrısını ertelersek sunucu portu açamaz ve Render geçici olarak `502 Bad Gateway` verir.
* **Çözüm**: Sunucuyu **milisaniyeler içinde** ayağa kaldırıp portu açmak için `app.listen()` hemen çağrılmalıdır. Supabase'den token yükleme işlemi sunucu başladıktan sonra **arka planda (asenkron)** yapılmalıdır:
  ```javascript
  app.listen(PORT, () => {
    loadTokens().then(...); // Bloklamayan arka plan yüklemesi
  });
  ```

### 2. Tarayıcı EventSource Sınırı (Query Parameter Authentication)
* **Sorun**: Poke.ai tarayıcı üzerinden SSE tüneli açarken `EventSource` API'sini kullanır. Tarayıcı standartları gereği `EventSource` isteklerine özel HTTP Header'ları (`x-api-key` veya `Authorization`) eklenemez. Bu durum `401 Unauthorized` hatasına yol açar.
* **Çözüm**: Güvenlik duvarının (authMiddleware), şifreyi hem **Header** hem de **Query Parameter** (URL sonundaki `?api_key=...`) üzerinden doğrulamasına izin verilmelidir:
  ```javascript
  const queryApiKey = req.query.api_key || req.query.apiKey || req.query.token;
  const providedKey = xApiKey || queryApiKey || authHeader;
  ```

### 3. Çift Gövde Okuma Kilidi (POST /messages Hanging/Timeout)
* **Sorun**: Express'te `app.use(express.json())` middleware'i etkindir ve gelen POST gövdesini okur. Ancak MCP SDK'sının `handlePostMessage` fonksiyonu ham istek akışını (`req`) yeniden okumaya çalışır (`getRawBody`). Akış zaten Express tarafından tüketildiği için sunucu kilitlenir ve Poke 20 saniye sonra zaman aşımı (timeout) verir.
* **Çözüm**: Express'in çoktan ayrıştırdığı `req.body` nesnesini, SDK'nın `handlePostMessage` fonksiyonuna 3. parametre (`parsedBody`) olarak doğrudan iletmelisiniz:
  ```javascript
  await transport.handlePostMessage(req, res, req.body); // Akış okumayı atlar, hazır veriyi kullanır
  ```

### 4. Tekli Sunucu Bağlantı Sınırı (Already connected to a transport)
* **Sorun**: `@modelcontextprotocol/sdk` içindeki `Server` sınıfı aynı anda sadece tek bir aktif bağlantıya izin verir. İstemci (Poke) bağlantıyı yenilediğinde veya tekrar denediğinde, eski bağlantı kapatılmadan yenisi bağlanmaya çalışılır ve sunucu çöker.
* **Çözüm**: `/mcp` rotasına her yeni istek geldiğinde, varsa eski bağlantı kapatılmalı ve sunucunun bağlantı durumu manuel olarak sıfırlanmalıdır:
  ```javascript
  if (transport) {
    await transport.close(); // Eski tüneli kapat
  }
  server._transport = undefined; // Kütüphane durumunu zorla sıfırla
  ```

### 5. POST İsteklerinde Gereksiz Güvenlik Kontrolü
* **Sorun**: `/messages` (POST) rotasında da `authMiddleware` çalıştırmak, istemcilerin şifre gönderme zahmetini artırır ve bağlantıyı koparır.
* **Çözüm**: POST isteklerinden güvenliği kaldırmak güvenlidir; çünkü POST isteğinin işlenebilmesi için zaten öncesinde şifreyle korunan `GET /mcp` rotasından el sıkışma yapılmış olması şarttır. Ayrıca POST isteklerinin yanıtı HTTP yanıtında değil, sadece SSE tüneli üzerinden yetkili kişiye akar.

---

## 3. Doğru URL ve Bağlantı Yapısı (Altın Kural)

Bulut tabanlı AI istemcilerine (Poke.ai vb.) bağlantı kurulurken girilmesi gereken parametreler:

* **Name**: `spotify-mcp` (Herhangi bir isim)
* **Server URL**: SSE tünelinizin adresi ve şifrenizin URL parametresi olarak birleşimi:
  `https://your-mcp-server.onrender.com/mcp?api_key=GİZLİ_ŞİFRENİZ`
* **API Key (optional)**: `GİZLİ_ŞİFRENİZ`

*(Uzantının `/sse` yerine `/mcp` olması, bazı proxy ve güvenlik duvarlarının filtrelerine takılmayı engeller).*

---

## 4. Yeni Bir MCP Sunucusu Eklerken Kontrol Listesi (Checklist)

Gelecekte yeni bir MCP sunucusu yazıp buluta koyarken bu rehbere göre şu kontrolleri yapın:

1. [ ] Sunucu dosyaları yazmak yerine verileri dış bir veritabanında (Supabase/Redis) mı tutuyor?
2. [ ] Sunucu başlarken portu anında açıyor mu? (Veritabanı bağlantısı `app.listen()` sonrasında mı yapılıyor?)
3. [ ] Kimlik doğrulama middleware'i query string (`?api_key=...`) destekliyor mu?
4. [ ] `POST /messages` rotasında Express'in `req.body` verisi MCP SDK'sına `handlePostMessage(req, res, req.body)` olarak iletiliyor mu?
5. [ ] `POST /messages` rotası şifre kontrolünden muaf tutulmuş mu?
6. [ ] Sunucu her yeni GET isteğinde eski transportu kapatıp `server._transport = undefined` yapıyor mu?
