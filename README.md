# EngiLink Dictionary

EngiLink Dictionary la ung dung tu dien desktop cho Windows, ho tro tra tu/cum tu bang AI, hoc tu vung bang flashcard, OCR tu anh/man hinh, va quan ly thu vien tu ca nhan.

Ung dung duoc xay bang Electron, chay nhu app desktop rieng, phu hop de dung ca nhan hoac chia se cho ban be.

## Tai va cai dat

### Cach 1: Cai bang installer

1. Vao trang phat hanh cua project, thuong la muc **Releases** tren GitHub.
2. Tai file `EngiLink Dictionary Setup x.x.x.exe`.
3. Mo file `.exe` va lam theo huong dan cai dat.
4. Neu Windows hien SmartScreen, chon **More info** -> **Run anyway** neu ban tin nguon tai.

> Luu y: App tu build/local thuong chua co code signing nen Windows co the canh bao. Day la binh thuong voi app ca nhan.

### Cach 2: Chay tu source code

Yeu cau:

- Windows 10/11
- Node.js
- npm

Lenh chay:

```bash
npm install
npm start
```

Build installer:

```bash
npm run build
```

Sau khi build, installer nam trong thu muc:

```text
dist/
```

## Thiet lap lan dau

1. Mo app **EngiLink Dictionary**.
2. Vao **Settings**.
3. Nhap API key vao muc **AI Configuration**.
4. Mac dinh app dung OpenRouter-compatible API endpoint:

```text
https://openrouter.ai/api/v1
```

5. Bam **Test Connection** de kiem tra ket noi AI.
6. Chon ngon ngu dich o **Target Language**, vi du `Vietnamese`, `Japanese`, `Korean`.
7. Bam **Save Settings**.

## Cach dung nhanh

### Tra tu bang hotkey

1. Boi den tu hoac cum tu trong bat ky ung dung nao.
2. Bam hotkey mac dinh:

```text
Ctrl + Shift + Z
```

3. Overlay nho se hien ket qua dich, giai thich, phat am, related words va tech note.

### Tra nhanh bang Spotlight

Hotkey mac dinh:

```text
Ctrl + Shift + Space
```

Nhap tu/cum tu, bam `Enter`, overlay se hien ket qua.

### Reading Mode

Trang **Reading** giup ban dan mot doan van tieng Anh vao app de doc va tra tu nhanh.

- Dan text vao o ben trai, bam **Process Text**.
- Cac tu trong doan van se co the click duoc.
- Tu da co trong Library se duoc highlight.
- Bam mot tu de mo overlay nho, khong can chuyen sang trang Lookup.
- Dung **Save Word** hoac **Save Phrase** de luu nhanh vao Library.
- Dung **Explain Sentence** hoac **Translate Paragraph** de tra cau/doan bang overlay.

### OCR tu man hinh

Hotkey mac dinh:

```text
Ctrl + Shift + X
```

Keo chon vung co chu tren man hinh. App se nhan dien chu bang OCR va mo overlay de tra noi dung do.

Tu V3.2, sau khi OCR xong app se hien **OCR Preview**. Ban co the sua text truoc khi chon:

- **Lookup Word**: tra tu dau tien trong text OCR.
- **Translate Text**: dich ca doan/cum tu OCR.
- **Save to Library**: luu text OCR vao thu vien va mo overlay.

### Library

Trang **Library** luu cac tu da tra. Ban co the:

- Tim kiem tu.
- Loc theo topic.
- Xem chi tiet tu.
- Them note ca nhan.
- Phat am.
- Bam related word de mo overlay nho.
- Chon nhieu tu de xoa hoac export.

### Study

Trang **Study** dung flashcard de hoc lai tu vung.

- Chon topic hoac de `All Topics`.
- Chon so luong tu moi phien hoc, tu 1 den 20.
- Bam **Start Review**.
- Cham diem bang `Again`, `Hard`, `Good`, `Easy`.
- Bam related word trong luc hoc se mo overlay nho, khong lam mat tien trinh hoc.

### History

Trang **History** ghi lai cac lan lookup gan day. Bam vao word chip trong history de mo overlay nho.

### Backup / Restore / Import / Export

Trong **Settings > Data Management**:

- **Export Full Backup**: xuat toan bo database ra file `.json`.
- **Restore Full Backup**: khoi phuc toan bo database tu file backup.
- **Restore Latest Auto-Backup**: khoi phuc ban backup tu dong gan nhat.
- **Export All Words**: xuat thu vien tu theo `JSON`, `CSV`, hoac `Anki TXT`.
- **Import Words**: nhap danh sach tu tu `.json`, `.csv`, hoac `.txt`.

App se tu tao safety backup truoc cac thao tac lon nhu restore, reset, import word list.

### Onboarding va Health Check

Tu V3.4, app co man hinh onboarding cho lan mo dau de huong dan setup API key, thu Reading/OCR, va tao backup.

Tu V3.5, trong **Settings > Health Check** co nut **Run Health Check** de kiem tra nhanh:

- Database va schema.
- Library co du lieu hay chua.
- API key/model/endpoint.
- OCR traineddata cho ngon ngu dang chon.
- Auto-backup.
- Hotkeys.

Co the export health report ra file `.json` khi can debug hoac chia se ban build.

## Cac tinh nang chinh

- AI translation cho tu va cum tu.
- Dictionary data tu dictionary API.
- Overlay nho khi tra bang hotkey.
- Refresh AI trong overlay.
- Related words va synonyms co the click de tra tiep.
- Phat am bang audio API hoac offline TTS fallback.
- Library luu tu da tra.
- Personal notes cho tung tu.
- Study flashcard voi SRS.
- History timeline.
- Activity heatmap.
- Dark mode.
- Spotlight search.
- Reading Mode de doc doan van va tra tu inline bang overlay nho.
- OCR screen capture.
- Import/export/backup/restore data.
- First-run onboarding cho nguoi moi.
- Health Check va export diagnostics report.

## Lich su cap nhat

### V1.0

- Ban dau cua EngiLink Dictionary.
- Tra tu bang overlay.
- Luu tu vao Library.
- Dashboard co Library, Study, Statistics, Lookup, Settings.
- Ho tro API key va model AI trong Settings.

### V2.0

- Offline AI cache de tranh goi API lap lai cho cung mot tu.
- Custom hotkeys cho lookup va Spotlight.
- Test Connection de kiem tra API key/model/endpoint.
- Target Language de dich sang ngon ngu khac, khong chi Vietnamese.
- Spotlight search bar.
- History timeline.
- SRS flashcard theo SM-2.
- Refresh AI trong overlay.
- Related words/synonyms co the click de lookup tiep.

### V3.0

- Dark Mode cho Dashboard, Overlay va Spotlight.
- Personal word notes trong Library.
- Auto-save note.
- Activity heatmap trong Statistics.
- Batch selection trong Library.
- Batch delete/export selected words.
- Offline TTS fallback cho phat am.
- OCR screen capture bang `Ctrl + Shift + X`.
- Dong goi `eng.traineddata` de OCR tieng Anh co the chay offline trong ban release.
- Schema migration len V3.

### V3.1

- Full Backup va Restore trong Settings.
- Auto-backup an toan truoc restore/reset/import.
- Giu toi da 5 auto-backup gan nhat.
- Export all/selected words theo JSON, CSV, Anki TXT.
- Import word list tu JSON/CSV/TXT.
- Merge word import theo duplicate key, khong ghi de note/SRS/favorite hien co.
- Related/synonym trong Dashboard Lookup mo overlay nho thay vi chuyen lookup inline.
- Library related word mo overlay nho va khong dong modal.
- Study related word mo overlay nho va khong lam mat tien trinh hoc.

### V3.2

- OCR Preview sau khi quet vung man hinh.
- Cho phep sua text OCR truoc khi tra.
- Them mode `Lookup Word`, `Translate Text`, `Save to Library`.
- Them setting **OCR Language**.
- Mac dinh English OCR chay offline bang `eng.traineddata`.
- Neu chon ngon ngu OCR khac ma thieu traineddata, app bao loi ro rang thay vi fail im lang.

### V3.3

- Them trang **Reading Mode**.
- Dan doan van vao app, xu ly thanh cac tu co the click.
- Click tu trong Reading Mode mo overlay nho nhu hotkey.
- Highlight cac tu da ton tai trong Library.
- Luu nhanh word hoac phrase tu doan doc vao Library.
- Explain Sentence va Translate Paragraph bang overlay, khong lam mat ngu canh dang doc.

### V3.4

- Them first-run onboarding wizard.
- Huong dan nguoi moi setup API key, thu workflow chinh, va backup du lieu.
- Nut mo nhanh Settings tu onboarding.
- Nut thu Reading Mode kem sample text.
- Luu trang thai onboarding vao database schema V4.

### V3.5

- Them Settings > Health Check.
- Kiem tra database, library, API settings, endpoint, OCR traineddata, backup, hotkeys.
- Luu thoi diem health check gan nhat vao schema V5.
- Export health report ra JSON de debug/chia se tinh trang app.
- Version app cap nhat len `3.5.0`.

## Du lieu duoc luu o dau?

Database nam trong thu muc userData cua Electron. Ban co the xem duong dan truc tiep trong:

```text
Settings > Data Management > Database
```

Khi can chuyen may hoac giu an toan du lieu, hay dung **Export Full Backup**.

## Build va dong goi

Lenh build Windows installer:

```bash
npm run build
```

Build se tao:

```text
dist/EngiLink Dictionary Setup x.x.x.exe
dist/win-unpacked/
```

OCR offline can file:

```text
eng.traineddata
```

File nay duoc cau hinh de copy vao `resources` khi build installer.

Neu muon OCR ngon ngu khac, them file traineddata tuong ung vao thu muc resources/dev root, vi du:

```text
vie.traineddata
jpn.traineddata
kor.traineddata
chi_sim.traineddata
```

## Goi y su dung

- Nen bam **Test Connection** sau khi doi API key/model.
- Nen export full backup truoc khi import danh sach tu lon.
- Nen dung CSV/Anki TXT neu muon dua tu vung sang ung dung hoc khac.
- Neu OCR khong nhan duoc chu, hay chon vung lon hon va ro hon.
- Neu hotkey bi trung voi app khac, doi hotkey trong Settings.

## License

MIT
