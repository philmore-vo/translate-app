# 📖 EngiLink Dictionary — Từ điển AI Đa ngôn ngữ trên Desktop

<p align="center">
  <strong>Tra từ trong mọi ứng dụng chỉ bằng một phím tắt. Học từ vựng bằng flashcard SRS. Đọc văn bản tiếng Anh và quét chữ từ màn hình bằng OCR.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Windows-0078D6?style=flat&logo=windows&logoColor=white" alt="Windows" />
  <img src="https://img.shields.io/badge/Electron-41.x-47848F?style=flat&logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/Version-3.5.0-7c3aed?style=flat" alt="Version" />
  <img src="https://img.shields.io/badge/License-MIT-22c55e?style=flat" alt="License" />
</p>

---

## 📋 Mục lục

1. [Giới thiệu](#-giới-thiệu)
2. [Tính năng chính](#-tính-năng-chính)
3. [Cài đặt](#-cài-đặt)
4. [Hướng dẫn lấy API Key miễn phí](#-hướng-dẫn-lấy-api-key-miễn-phí)
5. [Thiết lập lần đầu](#-thiết-lập-lần-đầu)
6. [Hướng dẫn sử dụng](#-hướng-dẫn-sử-dụng)
7. [Phím tắt](#-phím-tắt)
8. [Backup & Restore](#-backup--restore)
9. [Câu hỏi thường gặp (FAQ)](#-câu-hỏi-thường-gặp-faq)
10. [Xử lý lỗi](#-xử-lý-lỗi)
11. [Build từ source](#-build-từ-source)
12. [Lịch sử cập nhật](#-lịch-sử-cập-nhật)

---

## 🎯 Giới thiệu

**EngiLink Dictionary** là ứng dụng từ điển desktop dành cho người học tiếng Anh và các ngôn ngữ khác, kết hợp:

- 🤖 **AI translation** — dịch và giải thích từ/cụm từ bằng các mô hình AI hiện đại (Gemini, Groq, OpenRouter, OpenAI…)
- ⚡ **Hotkey toàn hệ thống** — bôi đen bất kỳ ứng dụng nào → bấm phím tắt → overlay tra từ hiện ra ngay
- 🧠 **SRS flashcard** — học lại từ vựng theo thuật toán SM-2 (Anki-style)
- 📷 **OCR màn hình** — quét vùng có chữ trên ảnh/PDF/video → tra trực tiếp
- 📚 **Reading Mode** — dán đoạn văn vào app để đọc và tra từ inline
- 💾 **Lưu trữ cục bộ** — toàn bộ dữ liệu nằm trên máy bạn, có backup/restore an toàn

> 💡 **Ai nên dùng?** Sinh viên, dân kỹ thuật, người đọc tài liệu/sách tiếng Anh thường xuyên — bất kỳ ai cần một công cụ tra từ nhanh, có ngữ cảnh và biết học theo thời gian.

---

## ✨ Tính năng chính

| Tính năng | Mô tả |
|-----------|-------|
| 🔤 **AI Translation** | Dịch từ/cụm từ kèm giải thích, ví dụ, related words, tech note |
| ⌨️ **Hotkey Lookup** | `Ctrl + Shift + Z` để tra từ đang bôi đen ở bất kỳ app nào |
| 🔍 **Spotlight Search** | `Ctrl + Shift + Space` để mở thanh tìm nhanh |
| 📷 **OCR Capture** | `Ctrl + Shift + X` để quét chữ từ vùng màn hình |
| 📖 **Reading Mode** | Dán đoạn văn → click từng từ để tra inline bằng overlay |
| 📚 **Library** | Lưu từ đã tra, ghi chú cá nhân, phân loại theo topic |
| 🎓 **Study (SRS)** | Học flashcard theo thuật toán SM-2, có Again/Hard/Good/Easy |
| 📜 **History** | Timeline các lần tra gần đây, click để mở lại overlay |
| 🔊 **Pronunciation** | Phát âm online (audio API) + offline TTS fallback |
| 🌙 **Dark Mode** | Giao diện tối/sáng cho Dashboard, Overlay và Spotlight |
| 📊 **Statistics** | Activity heatmap kiểu GitHub, thống kê tiến độ học |
| 💾 **Backup / Restore** | Export full database, auto-backup trước thao tác lớn |
| 📦 **Import / Export** | Hỗ trợ JSON, CSV, Anki TXT |
| 🩺 **Health Check** | Tự kiểm tra database, API, OCR, hotkeys, backup |

---

## 🚀 Cài đặt

### Cách 1: Cài bằng installer (khuyến nghị)

1. Vào mục **Releases** trên repository: <https://github.com/philmore-vo/translate-app/releases>
2. Tải file **`EngiLink Dictionary Setup x.x.x.exe`**
3. Mở file `.exe` và làm theo wizard cài đặt
4. Nếu Windows hiện **SmartScreen**, chọn **More info** → **Run anyway** (app cá nhân chưa có code signing — đây là tình trạng bình thường)

> 💡 Sau khi cài, app sẽ có shortcut trên Desktop và Start Menu với tên **EngiLink Dictionary**.

### Cách 2: Chạy từ source code

**Yêu cầu:**

- Windows 10/11
- [Node.js](https://nodejs.org) (LTS)
- npm (cài kèm Node.js)

**Các bước:**

```bash
# 1. Clone repo
git clone https://github.com/philmore-vo/translate-app.git
cd translate-app

# 2. Cài thư viện
npm install

# 3. Chạy app
npm start
```

Hoặc click đúp vào `setup.bat` để cài tự động, rồi `start-app.bat` để chạy.

---

## 🔑 Hướng dẫn lấy API Key miễn phí

App cần API key OpenAI-compatible để dùng tính năng AI. Dưới đây là các lựa chọn **miễn phí**, sắp xếp theo độ ổn định:

### Tùy chọn 1: Groq (Miễn phí, cực nhanh) ⭐⭐

Groq dùng phần cứng LPU riêng → tốc độ phản hồi rất nhanh, ít giới hạn.

1. Vào [console.groq.com/keys](https://console.groq.com/keys)
2. Đăng nhập bằng tài khoản Google
3. Nhấn **Create API Key** → đặt tên (ví dụ: "EngiLink") → copy key bắt đầu bằng `gsk_...`
4. Trong app: **Settings → AI Configuration**
   - **API Key:** paste key vừa copy
   - **API Endpoint:** `https://api.groq.com/openai/v1`
   - **Model:** `llama-3.3-70b-versatile`
5. Nhấn **Test Connection** → **Save Settings**

### Tùy chọn 2: Google Gemini ⭐

Gemini có quota miễn phí rộng rãi (~1500 request/ngày), chất lượng tốt với từ vựng.

1. Vào [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Đăng nhập Google → nhấn **Create API Key** → copy key bắt đầu bằng `AIza...`
3. Trong app: **Settings → AI Configuration**
   - **API Key:** paste key
   - **API Endpoint:** `https://generativelanguage.googleapis.com/v1beta/openai`
   - **Model:** `gemini-2.0-flash`
4. Nhấn **Test Connection** → **Save Settings**

### Tùy chọn 3: OpenRouter (Aggregator nhiều model)

OpenRouter cho phép dùng nhiều model qua một key duy nhất, có model free.

1. Vào [openrouter.ai/keys](https://openrouter.ai/keys) → tạo key bắt đầu bằng `sk-or-...`
2. Trong app: **Settings → AI Configuration**
   - **API Endpoint:** `https://openrouter.ai/api/v1`
   - **Model:** `google/gemini-2.0-flash-exp:free` (hoặc model bất kỳ trên OpenRouter)

### Tùy chọn 4: OpenAI (Trả phí)

Phù hợp khi cần chất lượng cao nhất.

- **API Endpoint:** `https://api.openai.com/v1`
- **Model:** `gpt-4o-mini` (rẻ) hoặc `gpt-4o` (mạnh hơn)

### Bảng so sánh

| Dịch vụ | Miễn phí? | Tốc độ | Ghi chú |
|---------|-----------|--------|---------|
| **Groq** | ✅ Có | ⚡⚡ Rất nhanh | Giới hạn ~30 req/phút |
| **Gemini** | ✅ Có | ⚡ Nhanh | ~1500 req/ngày |
| **OpenRouter** | ✅ Có (model free) | ⚡ Tùy model | Tổng hợp nhiều model |
| **OpenAI** | ❌ Trả phí | ⚡ Nhanh | Chất lượng cao nhất |

---

## ⚙️ Thiết lập lần đầu

Khi mở app lần đầu, **Onboarding Wizard** sẽ hướng dẫn bạn 3 bước:

1. **Setup AI** — paste API key + chọn model (xem mục trên)
2. **Try a workflow** — thử Reading Mode hoặc OCR với dữ liệu mẫu
3. **Backup** — tạo backup an toàn trước khi dùng thật

Sau khi onboarding, vào **Settings** để hoàn thiện:

- **Target Language:** ngôn ngữ đích bạn muốn dịch sang (Vietnamese, Japanese, Korean…)
- **Hotkeys:** đổi phím tắt nếu trùng với app khác
- **OCR Language:** mặc định English (offline). Có thể thêm `vie.traineddata`, `jpn.traineddata`… vào thư mục resources

> 💡 Sau khi đổi key/model, luôn bấm **🧪 Test Connection** trước khi save.

---

## 📖 Hướng dẫn sử dụng

### 1. Tra từ bằng hotkey (cách dùng phổ biến nhất)

1. Bôi đen từ/cụm từ ở bất kỳ ứng dụng nào (browser, PDF, Word…)
2. Bấm `Ctrl + Shift + Z`
3. Overlay nhỏ hiện ra với:
   - 🌐 Bản dịch + giải thích AI
   - 📚 Định nghĩa từ điển
   - 🔊 Phát âm
   - 🔗 Related words / synonyms (click để tra tiếp)
   - 💾 Nút **Save Word** để lưu vào Library

### 2. Spotlight Search

- Bấm `Ctrl + Shift + Space`
- Gõ từ/cụm từ → `Enter` → overlay hiện kết quả

### 3. OCR màn hình

- Bấm `Ctrl + Shift + X`
- Kéo chọn vùng có chữ trên màn hình
- Sau khi nhận chữ, app hiện **OCR Preview** để bạn sửa text trước khi:
  - **Lookup Word** — tra từ đầu tiên
  - **Translate Text** — dịch cả đoạn
  - **Save to Library** — lưu vào thư viện

### 4. Reading Mode

Dùng khi muốn đọc một bài/đoạn tiếng Anh:

1. Vào trang **Reading**
2. Dán đoạn văn vào ô bên trái → bấm **Process Text**
3. Click vào bất kỳ từ nào để mở overlay tra (không phải chuyển trang)
4. Từ đã có trong Library sẽ được **highlight**
5. Dùng **Save Word** / **Save Phrase** để lưu nhanh
6. Dùng **Explain Sentence** / **Translate Paragraph** để hiểu cả câu/đoạn

### 5. Library

Trang lưu tất cả từ đã tra:

- 🔍 Tìm kiếm + lọc theo topic
- 📝 Thêm note cá nhân (auto-save)
- 🔊 Phát âm
- 🔗 Click related word để mở overlay
- ☑️ Chọn nhiều từ → xóa hoặc export hàng loạt

### 6. Study (Flashcard SRS)

Học lại từ theo thuật toán SM-2:

1. Chọn topic (hoặc **All Topics**)
2. Chọn số lượng từ (1–20)
3. Bấm **Start Review**
4. Chấm điểm: `Again` / `Hard` / `Good` / `Easy` — app sẽ tính toán ngày ôn tiếp theo
5. Click related word khi đang học → overlay mở mà không làm mất tiến trình

### 7. History & Statistics

- **History:** timeline các lần tra gần đây, click word chip để mở lại overlay
- **Statistics:** activity heatmap kiểu GitHub, hiển thị độ đều đặn học tập

---

## ⌨️ Phím tắt

| Phím tắt | Chức năng |
|----------|-----------|
| `Ctrl + Shift + Z` | Tra từ đang bôi đen (toàn hệ thống) |
| `Ctrl + Shift + Space` | Mở Spotlight search |
| `Ctrl + Shift + X` | OCR vùng màn hình |
| `Esc` | Đóng overlay / popup |

> 💡 Có thể đổi tất cả hotkey trong **Settings → Hotkeys** nếu trùng với app khác.

---

## 💾 Backup & Restore

Database lưu cục bộ tại thư mục `userData` của Electron. Đường dẫn cụ thể hiện ở:

```text
Settings → Data Management → Database
```

### Trong **Settings → Data Management**:

| Thao tác | Mô tả |
|----------|-------|
| **Export Full Backup** | Xuất toàn bộ database ra file `.json` |
| **Restore Full Backup** | Khôi phục từ file backup |
| **Restore Latest Auto-Backup** | Khôi phục bản auto-backup gần nhất |
| **Export All Words** | Xuất từ vựng theo `JSON` / `CSV` / `Anki TXT` |
| **Import Words** | Nhập danh sách từ từ `.json`, `.csv`, `.txt` |

### 🛡️ Auto-backup an toàn

App **tự tạo safety backup** trước các thao tác lớn (restore, reset, import). Giữ tối đa **5 bản auto-backup** gần nhất → bạn có thể rollback nếu lỡ tay.

### 🩺 Health Check

Vào **Settings → Health Check → Run Health Check** để kiểm tra nhanh:

- ✅ Database & schema
- ✅ Library có dữ liệu
- ✅ API key / model / endpoint
- ✅ OCR traineddata cho ngôn ngữ đang chọn
- ✅ Auto-backup
- ✅ Hotkeys

Có thể **Export Health Report** ra `.json` khi cần debug hoặc chia sẻ tình trạng app.

---

## ❓ Câu hỏi thường gặp (FAQ)

### "Dữ liệu của tôi lưu ở đâu?"

Database SQLite nằm trong thư mục `userData` của Electron (xem đường dẫn cụ thể tại **Settings → Data Management → Database**). Dữ liệu **không bị mất** khi tắt app, restart máy, hoặc cập nhật version.

### "Có cần mạng để dùng app không?"

| Tính năng | Cần mạng? |
|-----------|-----------|
| AI translation, Reading explain | ✅ Có |
| Pronunciation (audio API) | ✅ Có |
| OCR (offline tiếng Anh) | ❌ Không |
| Library / Study / History | ❌ Không |
| Offline TTS fallback | ❌ Không |

App có cache AI offline → từ đã tra rồi không gọi lại API.

### "API key có bị gửi đi đâu không?"

API key được lưu **chỉ trên máy bạn**. Khi tra từ, app gửi request trực tiếp tới endpoint AI mà bạn cấu hình (Groq / Gemini / OpenAI…) — không qua server trung gian.

### "App có chạy trên Mac/Linux không?"

Hiện tại installer build cho **Windows**. Source code có thể chạy trên Mac/Linux thông qua `npm start`, nhưng OCR và một số hotkey cần điều chỉnh thêm.

### "Làm sao để học hiệu quả?"

1. **Tra từ trực tiếp trong ngữ cảnh** (hotkey hoặc Reading Mode) thay vì gõ tay
2. **Thêm note cá nhân** mỗi khi save từ → giúp nhớ lâu hơn
3. **Học flashcard hằng ngày** ở trang Study (10–15 phút/ngày)
4. **Export sang Anki TXT** nếu muốn đồng bộ với Anki

---

## 🔧 Xử lý lỗi

### Lỗi "API error 429: Rate limit exceeded"

**Nguyên nhân:** Hết quota AI miễn phí.

**Cách khắc phục:**

1. **Đợi 1–2 phút** (nếu là lỗi per-minute)
2. **Đợi đến ngày mai** (nếu là lỗi daily quota)
3. **Đổi sang Groq** (xem [Tùy chọn 1](#tùy-chọn-1-groq-miễn-phí-cực-nhanh-))
4. **Tạo key mới** ở provider khác

### Lỗi "API error 401: Invalid API key"

API key sai/hết hạn → mở **Settings**, kiểm tra lại key, hoặc tạo mới.

### Windows SmartScreen chặn installer

Chọn **More info** → **Run anyway**. Đây là do app cá nhân chưa có code signing certificate, không phải virus.

### OCR không nhận được chữ

- Chọn vùng **lớn hơn và rõ hơn**
- Đảm bảo có file `eng.traineddata` trong thư mục resources
- Nếu OCR ngôn ngữ khác, thêm file `*.traineddata` tương ứng (xem mục Build từ source)

### Hotkey bị trùng với app khác

Vào **Settings → Hotkeys**, đổi phím tắt sang tổ hợp khác chưa bị app nào dùng.

### Mất dữ liệu sau update

Vào **Settings → Data Management → Restore Latest Auto-Backup** để khôi phục bản backup gần nhất (app giữ tối đa 5 bản).

---

## 🛠️ Build từ source

### Build Windows installer

```bash
npm run build
```

Sau khi build xong, file installer nằm tại:

```text
dist/EngiLink Dictionary Setup x.x.x.exe
dist/win-unpacked/
```

### Build thư mục unpacked (debug nhanh)

```bash
npm run build:dir
```

### Thêm OCR ngôn ngữ khác

App build kèm sẵn `eng.traineddata` cho OCR tiếng Anh offline. Để hỗ trợ thêm ngôn ngữ:

1. Tải file traineddata từ [tessdata](https://github.com/tesseract-ocr/tessdata)
2. Đặt vào thư mục root của project (cạnh `eng.traineddata`):

```text
vie.traineddata    # Tiếng Việt
jpn.traineddata    # Tiếng Nhật
kor.traineddata    # Tiếng Hàn
chi_sim.traineddata  # Tiếng Trung giản thể
```

3. Build lại installer — `electron-builder` sẽ tự copy vào `resources/`
4. Trong app, chọn ngôn ngữ tương ứng ở **Settings → OCR Language**

### Cấu trúc thư mục

```text
translate-app/
├── 📄 main.js                  ← Electron main process
├── 📄 preload.js               ← IPC bridge cho overlay
├── 📄 preload-dashboard.js     ← IPC bridge cho dashboard
├── 📄 preload-spotlight.js     ← IPC bridge cho spotlight
├── 📄 preload-snip.js          ← IPC bridge cho OCR snip
├── 📄 dashboard.html           ← Giao diện chính (Library, Study, Settings…)
├── 📄 overlay.html             ← Overlay tra từ
├── 📄 spotlight.html           ← Spotlight search bar
├── 📄 snip.html                ← OCR region selector
├── 📄 setup.bat / start-app.bat
├── 📄 eng.traineddata          ← OCR English (offline)
├── 📁 css/                     ← Stylesheets
├── 📁 js/                      ← Renderer logic (dashboard.js…)
├── 📁 assets/                  ← Icon, tray icon, helpers
├── 📁 scripts/                 ← electron-builder afterPack
└── 📁 dist/                    ← Output sau khi build
```

---

## 📜 Lịch sử cập nhật

### V3.5 (hiện tại)

- 🩺 **Health Check** trong Settings — kiểm tra DB, library, API, OCR, backup, hotkeys
- 📤 Export health report ra JSON để debug/chia sẻ
- 📦 Schema migration lên V5

### V3.4

- 🎉 **Onboarding Wizard** lần mở đầu — hướng dẫn setup API key, thử Reading/OCR, tạo backup
- 🔘 Nút mở nhanh Settings và Reading Mode kèm sample text
- 📦 Schema V4 lưu trạng thái onboarding

### V3.3

- 📚 **Reading Mode** — dán đoạn văn → click từng từ tra inline bằng overlay nhỏ
- 🔆 Highlight từ đã có trong Library
- 💬 **Explain Sentence** và **Translate Paragraph** không làm mất ngữ cảnh

### V3.2

- 👁️ **OCR Preview** — sửa text trước khi tra
- 🎯 Mode `Lookup Word` / `Translate Text` / `Save to Library`
- 🌐 Setting **OCR Language** + báo lỗi rõ khi thiếu traineddata

### V3.1

- 💾 **Full Backup / Restore** trong Settings
- 🔄 Auto-backup an toàn trước restore/reset/import (giữ tối đa 5 bản)
- 📤 Export words theo JSON / CSV / Anki TXT
- 📥 Import từ JSON / CSV / TXT, merge thông minh không ghi đè note/SRS
- 🔗 Related word mở overlay nhỏ thay vì chuyển lookup inline

### V3.0

- 🌙 **Dark Mode** cho Dashboard, Overlay, Spotlight
- 📝 Personal word notes + auto-save trong Library
- 📊 Activity heatmap trong Statistics
- ☑️ Batch selection + delete/export hàng loạt
- 🔊 Offline TTS fallback
- 📷 **OCR screen capture** (`Ctrl + Shift + X`) với `eng.traineddata` offline

### V2.0

- 💾 Offline AI cache — không gọi lại API cho từ đã tra
- ⌨️ Custom hotkeys cho Lookup và Spotlight
- 🧪 **Test Connection** kiểm tra API key/model/endpoint
- 🌍 Target Language tùy chỉnh (không chỉ Vietnamese)
- 🔍 Spotlight search bar
- 📜 History timeline
- 🎓 SRS flashcard theo SM-2
- 🔄 Refresh AI trong overlay
- 🔗 Related words / synonyms click để tra tiếp

### V1.0

- 🎉 Bản đầu tiên của EngiLink Dictionary
- 🔤 Tra từ bằng overlay
- 📚 Lưu từ vào Library
- 🖥️ Dashboard với Library, Study, Statistics, Lookup, Settings
- 🤖 Hỗ trợ API key và model AI trong Settings

---

## 📄 License

[MIT](LICENSE) © EngiLink

---

<p align="center">
  Made with ❤️ for language learners
</p>
