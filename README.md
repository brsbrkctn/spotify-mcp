# Spotify MCP Server

Spotify için geliştirilmiş, Server-Sent Events (SSE) kullanan kapsamlı bir Model Context Protocol (MCP) sunucusu.

## Özellikler

- **Oynatma Kontrolü**: Duraklat, devam et, ses ayarla, parça atla, shuffle ve repeat modlarını yönet.
- **Kütüphane & Çalma Listeleri**: Çalma listesi oluştur, parça ekle/çıkar, beğenilen şarkıları yönet.
- **Arama & Keşif**: Şarkı, sanatçı ve albüm ara, öneriler al.
- **Cihaz Yönetimi**: Mevcut cihazları listele ve oynatmayı aktar.
- **Kalıcı Oturum**: OAuth token'larını yerel dosyada saklayarak sunucu kapansa bile oturumu korur.

## Kurulum ve Yapılandırma

### Ortak Adımlar
1. [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) üzerinden bir uygulama oluşturun.
2. Uygulama ayarlarından bir **Redirect URI** ekleyin: `http://localhost:3000/callback` (veya sunucu adresiniz).
3. **Client ID** ve **Client Secret** değerlerini not edin.

---

### Yol A: Yerel Kurulum (Debian, Homebridge, macOS, Windows)
Yerel ağda, 100% özel ve hızlı kullanım için idealdir.

1. **Repoyu indirin ve bağımlılıkları kurun:**
   ```bash
   git clone https://github.com/brsbrkctn/spotify-mcp.git
   cd spotify-mcp
   npm install
   ```

2. **`.env` dosyasını oluşturun:**
   ```env
   SPOTIFY_CLIENT_ID=your_id
   SPOTIFY_CLIENT_SECRET=your_secret
   REDIRECT_URI=http://localhost:3000/callback
   PORT=3000
   ```

3. **Çalıştırın:**
   `npm start` veya kalıcı çalışma için `pm2 start index.js --name spotify-mcp`.

4. **Yetkilendirin:** Tarayıcıdan `http://localhost:3000/login` adresine gidin.

---

### Yol B: Uzak Sunucu Kurulumu (Render, Railway, Fly.io)
AI araçları (ChatGPT, Cursor) ile her yerden erişmek için idealdir.

1. **Güvenlik (API_KEY):** Sunucunuz internete açık olacağı için mutlaka bir `API_KEY` belirleyin.
2. **Environment Variables:**
   - `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `REDIRECT_URI`
   - `API_KEY`: Karmaşık bir şifre belirleyin (örn: `benim_gizli_anahtarim_123`).
3. **Bağlantı (AI Client):** AI istemcinizde (Cursor/ChatGPT) sunucu URL'sini eklerken şu header'ı kullanın:
   - Header: `Authorization: Bearer <API_KEY>` veya `x-api-key: <API_KEY>`.

*Not: Ücretsiz sunucu katmanlarında (ephemeral storage) dosya sistemi geçicidir. Sunucu uyku moduna girip uyanırsa tekrar login olmanız gerekebilir.*

---

## Değişkenler (Environment Variables)

| Değişken | Açıklama | Zorunlu mu? |
| :--- | :--- | :--- |
| `PORT` | Sunucunun çalışacağı port (Varsayılan: 3000). | Hayır |
| `SPOTIFY_CLIENT_ID` | Spotify Developer App Client ID. | Evet |
| `SPOTIFY_CLIENT_SECRET` | Spotify Developer App Client Secret. | Evet |
| `REDIRECT_URI` | Spotify OAuth Redirect URI. | Evet |
| `API_KEY` | Uzak erişim için güvenlik anahtarı. | Uzak kurulumda Evet |

## Araçlar (Tools)

- **Playback**: `get_current_track`, `play_pause`, `set_volume`, `skip_to_next`, `set_shuffle_state`, vb.
- **Playlists**: `create_playlist`, `add_to_playlist`, `get_user_playlists`.
- **Discovery**: `search`, `get_recommendations`.
- **Library**: `get_liked_songs`, `save_tracks`.
