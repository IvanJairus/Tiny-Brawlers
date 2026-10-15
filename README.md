# Tiny Brawlers

Arena tempur 3D di browser: empat tim chibi berebut peti kayu di tengah pulau, memikulnya ke
*building pad* 2x2x2 milik sendiri, dan merakit tumpukan itu menjadi senjata, satuan tambahan,
atau tank. objective utamanya menghancurkan bunker lawan. Homage ke Team Buddies (PS1), dengan
aset dan audio yang dibuat sendiri.

Cabang `v2` adalah penulisan ulang total. Cabang `main` menyimpan versi lama dan dipakai sebagai
pembanding paritas.

## Menjalankan

```bash
npm install
npm run dev            # http://localhost:3000
npm test               # 255 tes unit/sim/net, headless
npm run test:speed     # gerbang 1000x realtime dari rencana M1, file itu saja yang jalan
npm run test:browser   # 66 tes Playwright: 3 ukuran layar, netplay, relay, artefak produksi
npm run test:perf      # 1 tes budget frame dengan CPU di-throttle 6x, sendirian
npm run build          # tsc + vite build
npm audit              # 0 kerentanan; CI gagal bila ada yang high atau critical
npm run preview        # sajikan hasil build seperti saat tayang
```

## Kendali

| Aksi | Keyboard | Sentuh |
|---|---|---|
| Jalan | WASD atau panah | stick dinamis di setengah layar kiri |
| Ambil / letak / lempar peti, naik tank | E | AMBIL |
| Tembak | F atau Spasi | TEMBAK |
| Rakit pad (harus berdiri di dekat pad) | R atau Q | tombol Rakit di kartu pad |
| Zoom | scroll atau + / - | dua tombol + dan - di kanan bawah |
| Jeda (mode solo) | Esc | tombol II |
| Keluar dari laga jaringan | Esc lalu pilih "Ya, Keluar" | tombol X lalu "Ya, Keluar" |
| Semua menu tanpa mouse | Tab atau Shift+Tab untuk berpindah, Enter untuk memilih | sentuh |

Orientasi utama di ponsel adalah landscape. Portrait tetap bisa dimainkan dengan HUD yang lebih
sedikit.

## Cara main

1. Peti jatuh berkala di zona tengah pulau.
2. Satu buddy memikul satu peti; peti terlihat di atas kepalanya.
3. Letakkan di pad tim sendiri. Bentuk tumpukan menentukan hasilnya.
4. Bunker punya 1000 HP. Tim hilang ketika bunker rata dan semua anggotanya tumbang.

| Peti | Bentuk | Hasil |
|---|---|---|
| 1 | slot mana saja | Pistol (90 DPS) |
| 2 | tumpuk vertikal | Granat nanas x5 (ledak 320) |
| 2 | sebaris mendatar | Shotgun (220 DPS) |
| 3 | 2 bawah + 1 atas | Medic Buddy (unit AI penyembuh) |
| 3 | 3 di lantai bawah | Medkit x3 (sembuh 60, hidupkan kawan) |
| 4 | 2x2 lantai bawah | Rocket Bazooka (ledak 450) |
| 4 | dinding 2x1x2 | Commando Buddy (unit AI) |
| 8 | kubus penuh | Heavy Battle Tank |

Saat membawa peti dan berdiri di dekat pad, satu slot akan ditandai kotak kosong
berkedip: itu slot yang akan terisi kalau tombol ambil ditekan. Berdiri jauh dari pad
mengganti tanda itu dengan garis putih yang menunjukkan ke mana peti akan jatuh kalau
dilempar; garisnya dihitung oleh fisika yang sama dengan peti sungguhan, bukan perkiraan.

Badan karakter memendek saat membawa peti dan membesar sesaat saat tumbang, ledakan di
dekat kamera mengguncang layar dan menahan gambar 40 ms, tapi guncangan dan tahan-gambar
itu hanya hidup di desktop dengan `prefers-reduced-motion` mati. Peti yang jatuh dari
langit memunculkan debu saat menyentuh tanah, dan pad yang mengonsumsi peti memuntahkan
serpihan kayu. Keduanya terdeteksi dari ketinggian peti, bukan dari event khusus, karena
kecepatan vertikal tidak ikut dikirim ke klien.

Kelas: **Petarung** 130 HP dan rusak 1,25x, **Tabib** 100 HP dengan aura sembuh 25 HP/dtk dalam
4,5 m, **Pembangun** 90 HP, paling cepat, dan paling jauh melempar.

## Main bersama teman

Host-authoritative: satu browser menjalankan simulasi, sisanya mengirim masukan dan merender
keadaan. Snapshot penuh dikirim 15 Hz (di bawah 16 KB/s per arah), masukan naik 8 byte.

- Dua tab di satu browser langsung bisa main tanpa server: signaling memakai BroadcastChannel.
- Lintas perangkat atau lintas jaringan: jalankan relay, lalu buka game dengan
  `?signal=wss://host/`.

  ```bash
  npm install ws
  npm run signal            # ws://localhost:8080
  ```

  Kalau relay-nya tidak jalan, lobby tidak diam menunggu tamu yang tidak akan pernah
  datang: koneksi yang ditolak dilaporkan di layar sebagai "Server penghubung tidak
  bisa dihubungi".

- Peer yang putus diambil alih AI di tempat, lengkap dengan peti yang sedang dibawanya.
- Slot yang tidak diisi manusia otomatis diisi bot, jadi 2 orang tetap jadi brawl 4 tim.

## Bot

Rekan setim AI mengisi pad sampai bentuk yang sedang dituju timnya, bukan asal menumpuk satu peti
lalu merakit. Yang dulu macet: bot yang meletakkan peti terakhir sudah tidak membawa apa-apa, dan
tekanan rakit hanya dilakukan bot yang sedang memikul peti, jadi pad delapan peti menunggu "kebetulan"
ada yang lewat dan menekan. Sekarang bot tanpa peti pun jalan ke pad dan merakit bentuk yang sudah
genap. Terukur di delapan seed, laga lima menit semua-bot: bentuk tank muncul 2 dari 8 sebelum
perubahan ini, 5 dari 8 sesudahnya. Angka itu dicetak sendiri oleh tesnya
(`tests/sim/bots.test.ts`, delapan seed, masing-masing lima menit waktu simulasi), dan tujuh resep pad lainnya
semuanya muncul di seed 20260.

Harganya, diukur di delapan seed yang sama: commando tidak muncul lagi di satu seed (7) yang sebelumnya
selalu muncul. Rotasi target tim jadi bergerak lebih cepat, dan bentuk empat peti itu dapat terlewat
sebelum waktu habis. Saya catat daripada menyembunyikannya.

## Arsitektur

```
src/
  sim/        TypeScript murni. Tidak boleh menyentuh three, DOM, jam dinding, atau Math.random
    core/     world, ids, rng, tick, events, view, step
    domain/   teams, classes, pad, recipes, buddy, crate, weapon, projectile, tank, bunker, match
    ai/       keputusan bot
    input/    kosakata InputCmd yang sama untuk keyboard, sentuh, dan jaringan
    net/      codec, messages, transport, webrtc, signalling, host, client, predict, interp, session
  render/     satu-satunya tempat Three.js: arena merge, chibi instanced, air shader, partikel pool
  ui/         machine layar, router, layar, HUD store + bind, i18n id, CSS token
  platform/   audio sintesis, input keyboard/sentuh, storage, browsercheck, net link
  boot.ts     satu-satunya pemilik requestAnimationFrame
```

Aturan lapisan ditegakkan oleh `tests/layers.test.ts`, bukan oleh kesepakatan. Karena itu sim bisa
dijalankan headless di Vitest dan di browser lewat jalur kode yang sama, dan bug kelas "logika
sudah berubah tapi gambar belum" tidak punya tempat untuk terjadi.

Anggaran render diuji di `tests/render/budget.test.ts`: draw call ≤ 60, material ≤ 12, geometry
≤ 30, triangle ≤ 45k, tanpa shadow map. Terukur di medan penuh: 25 draw call dan 5 material.

## Mengukur di perangkat sendiri

Buka game dengan `?meter=1` untuk menampilkan fps, p50, p95, dan jumlah draw call langsung di
layar. Ini satu-satunya cara jujur menjawab "apakah lancar di HP ini", karena devtools tidak bisa
dipasang di ponsel saat bermain.

```bash
npm run dev            # catat alamat network yang ditampilkan, misalnya http://192.168.1.2:3000
# di ponsel yang satu Wi-Fi: http://192.168.1.2:3000/?meter=1
```

Angka yang terlihat di sana adalah angka perangkat itu.

Ada mode kedua, `?ascii=1`, yang menempelkan pandangan dunia sebagai teks di pojok kiri bawah:
grid 65x33 petak, tick, jam, nyawa tiap benteng, dan jumlah buddy hidup. Teksnya sendiri tidak butuh
GPU, jadi ia memisahkan bug simulasi dari bug render saat dua-duanya aktif bersamaan. Keduanya hanya
muncul lewat query, tidak pernah tampil di permainan biasa.

```bash
# http://192.168.1.2:3000/?ascii=1&seed=5
```

Sebagai gerbang regresi, `e2e/perf.spec.ts` mengukur headless Chromium dengan CPU di-throttle 6x
pada viewport 740x360 dan menuntut p95 ≤ 20 ms. Itu mendeteksi perubahan yang membuat main thread
berat, tapi bukan pengganti pengukuran di HP: CPU ponsel kelas menengah punya karakteristik berbeda
(GPU, bandwidth memori, thermal). Gerbang perangkat tetap berstatus belum terverifikasi.

Tiga kali jalan di mesin ini dengan mesin kosong memberi p95 16,7 sampai 16,8 ms pada 59 sampai
60 fps (n=3, `npm run test:perf`, 2026-10-15). Dua jalan lain mencatat p95 33,3 ms, dan keduanya
terjadi segera sesudah suite browser lain selesai di mesin yang sama. Gerbang ini sensitif terhadap
beban sampingan, jadi jalankan `test:perf` sendirian dan jangan menambah retry untuk menutupinya.

Yang diverifikasi di artefak build, bukan hanya di dev server: boot tanpa error, rute layar penuh
(judul → pilih kelas → main → jeda → keluar ke judul), nol bocor horizontal dan nol kartu HUD
tumpang tindih di 1440x900, 740x360, dan 390x844, bingkai render nyata, dan meter di perangkat.
Yang tidak bisa diverifikasi di artefak build: layar hasil. Laga hanya selesai kalau bunker satu tim
rata dan semua anggotanya tumbang, dan satu-satunya cara mempercepat waktu simulasi ada di dev
handle yang justru tidak ikut di-build. Jadi layar hasil teruji di dev server dan tetap jadi langkah
playtest manual di build, sampai keputusan batas waktu laga di bagian Status verifikasi diambil.

Kontras teks modal diukur dari warna yang benar-benar dipakai browser: warna teks dihitung, lalu
latar belakangnya dilacak naik ke elemen pertama yang opaque, dan rasio WCAG-nya ditagih 4,5:1 per
bagian teks. Yang terukur sekarang: paused 15,82:1, confirming 15,82:1, results 10,14:1, disconnected
15,82/15,82/6,83:1.

Kenapa tidak cukup dengan menguji nilai token atau screenshot: layar notice dulu memakai scrim gelap
transparan dengan teks gelap, dan itu terbaca di screenshot sebagai baris aksi yang nyaris tidak
terlihat. Gerbang pixel tidak menangkapnya sama sekali saat warna baris itu diganti merah murni,
karena perubahannya cuma 1.748 piksel, di bawah ambang 0,15 persen. Dan tes yang membaca token CSS
bisa hijau walaupun elemen aslinya tidak memakai token itu. Jadi yang ditagih adalah computed style,
di `e2e/layout.spec.ts`.

## Deploy

Build bersifat portabel: `base` relatif, jadi `dist/` bisa diletakkan di root domain maupun di
bawah subpath repo. Hosting harus HTTPS karena WebRTC dan broker signaling menolak halaman `http`.

```bash
npm run build && npx serve dist    # cek lokal hasil yang sama dengan yang akan tayang
```

## Status verifikasi

Daftar "jangan turun mutu" ada di `docs/PARITY.md`: 115 baris, tiap baris menyebut tes yang
membuktikannya. `tests/docs/parity.test.ts` menjaga daftar itu sendiri, yaitu nomor baris unik,
klaim perilakunya ada, milestone M0-M7, file yang disebut harus benar-benar ada serta berisi tes,
dan statusnya hanya A atau P; sebuah P wajib punya alasan di bagian "Masih sebagian". Sebelum tes
itu ada, audit ini saya kerjakan dengan mata dan ia menemukan baris yang menyebut file yang tidak
pernah ada; sekarang kesalahan seperti itu merah.

Satu baris sengaja berstatus P: batas simpul prediksi 0,75 m dari rencana bagian 4.3. Saya bangun
pengukurannya (host mengakui nomor input terbaru di snapshot, klien membandingkan pada seq yang sama),
lalu menghapusnya lagi: simpul terbesar 0,867-0,982 m, tetapi prediktor yang dirusak sampai tidak
bergerak sama sekali hanya 0,989-1,227 m di link yang sama. Yang menahan angka itu kecil adalah
koreksi snap, bukan mutu prediksi, jadi batas di kisaran itu bukan gerbang. Karena kodenya sudah
dihapus, dua angka di atas tidak bisa anda ukur ulang dari build ini; ia catatan hasil eksperimen. Sejarahnya ada di
`docs/PARITY.md` bagian Masih sebagian.

Baseline visual: `npm run test:visual` membandingkan tujuh permukaan UI (judul, pilih kelas, HUD,
pause, konfirmasi keluar, terputus, hasil) di dua viewport, 1440x900 dan 740x360, dengan PNG di
`e2e/visual.spec.ts-snapshots`; `npm run visual:baseline` untuk membuat ulang. Nama file memuat
platform, jadi baseline ini milik darwin; runner Linux harus membuatnya sendiri sebelum gerbang itu
berarti di sana.

Canvas disembunyikan lewat style yang disuntik tes sebelum tiap shot, jadi yang dibandingkan murni
DOM dan ambangnya cukup 0,15 persen. Angka itu bukan hiasan: dengan ambang 1,5 persen sebuah
perubahan copy di daftar hasil lolos dan baseline lama tetap terpakai tanpa ada yang sadar. Arena
dijaga oleh tes anggaran draw call dan tes baca layar, dan tiap jalan tetap menyimpan tangkapan
viewport penuh di `test-results/visual-review/` untuk dinilai manusia.

Yang dibuktikan otomatis: aturan lapisan, determinisme sim, 7 resep, invarian cacat lama, codec,
dan sesi netplay termasuk harness 1 host plus 3 klien selama 5 menit waktu link dengan 60 ms delay,
60 ms jitter, loss 3 persen dan duplikasi 2 persen (lag snapshot maksimum 3 tick terukur), anggaran
render, tidak ada bocor horizontal dan tidak ada
tumpang tindih HUD di 1440x900 / 740x360 / 390x844, dua halaman browser main satu pertandingan,
dan build hasil `vite build` benar-benar dijalankan lewat `vite preview` tanpa error konsol.
Kebocoran jangka panjang diuji dengan 20 menit simulasi (roster, peti, dan id aktif tetap terbatas)
serta 45 detik bermain nyata di browser (jumlah node DOM dan heap tidak naik).

Yang belum: 60 fps pada perangkat ponsel nyata, netplay lintas perangkat di jaringan seluler,
dan satu baris ledger yang masih P (batas simpul prediksi 0,75 m). Selama baris itu P, gerbang M7
"PARITY.md 100 persen" belum tercapai.
Dua yang pertama butuh perangkat, jadi angka performa ponsel sengaja tidak diklaim; yang terakhir
butuh keputusan desain, lihat di atas.

Belum ada satu pun langkah CI yang pernah berjalan untuk cabang ini, termasuk langkah
`test:speed` yang menagih 1000x realtime di runner. Angka 2278-4284x berasal dari mesin ini
(n=5, CPU sendiri), bukan dari runner. Gerbangnya merah atau hijau di sana baru terbukti setelah
push pertama.

Satu pertanyaan desain yang masih terbuka: laga tidak punya batas waktu. Ia selesai hanya kalau
bunker satu tim rata dan semua anggotanya tumbang, dan pada seed 7 empat tim bot masih belum
saling habiskan setelah 400 detik waktu simulasi (satu pengamatan, `e2e/visual.spec.ts`).
Menambah jam laga mengubah aturan main, jadi itu keputusan anda, bukan saya sisipkan diam-diam.

## Lisensi

Kode dan gamenya MIT. Seluruh model 3D dan audio dibuat prosedural dari kode, tanpa aset berhak
ciptaan. Kecuali tipografi: Baloo 2 dan Nunito Sans adalah woff2 subset latin yang di-self-host di
`public/fonts`, masing-masing disertai notis SIL Open Font License 1.1 dari proyek upstream. Kalau
font itu ikut disalin, file `.txt` lisensinya harus ikut.
