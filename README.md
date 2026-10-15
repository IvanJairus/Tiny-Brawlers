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
npm test               # 168 tes unit/sim/net, headless
npm run test:browser   # 33 tes Playwright: 3 ukuran layar, relay, artefak produksi
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
itu hanya hidup di desktop dengan `prefers-reduced-motion` mati.

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

- Peer yang putus diambil alih AI di tempat, lengkap dengan peti yang sedang dibawanya.
- Slot yang tidak diisi manusia otomatis diisi bot, jadi 2 orang tetap jadi brawl 4 tim.

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

Sebagai gerbang regresi, `e2e/perf.spec.ts` mengukur headless Chromium dengan CPU di-throttle 6x
pada viewport 740x360 dan menuntut p95 ≤ 20 ms. Itu mendeteksi perubahan yang membuat main thread
berat, tapi bukan pengganti pengukuran di HP: CPU ponsel kelas menengah punya karakteristik berbeda
(GPU, bandwidth memori, thermal). Gerbang perangkat tetap berstatus belum terverifikasi.

Tiga kali jalan di mesin ini dengan mesin kosong memberi p95 16,7 sampai 16,8 ms pada 59 sampai
60 fps (n=3, `npm run test:perf`, 2026-10-15). Dua jalan lain mencatat p95 33,3 ms, dan keduanya
terjadi segera sesudah suite browser lain selesai di mesin yang sama. Gerbang ini sensitif terhadap
beban sampingan, jadi jalankan `test:perf` sendirian dan jangan menambah retry untuk menutupinya.

## Deploy

Build bersifat portabel: `base` relatif, jadi `dist/` bisa diletakkan di root domain maupun di
bawah subpath repo. Hosting harus HTTPS karena WebRTC dan broker signaling menolak halaman `http`.

```bash
npm run build && npx serve dist    # cek lokal hasil yang sama dengan yang akan tayang
```

## Status verifikasi

Yang dibuktikan otomatis: aturan lapisan, determinisme sim, 7 resep, invarian cacat lama, codec
dan sesi netplay di link ber-jitter, anggaran render, tidak ada bocor horizontal dan tidak ada
tumpang tindih HUD di 1440x900 / 740x360 / 390x844, dua halaman browser main satu pertandingan,
dan build hasil `vite build` benar-benar dijalankan lewat `vite preview` tanpa error konsol.
Kebocoran jangka panjang diuji dengan 20 menit simulasi (roster, peti, dan id aktif tetap terbatas)
serta 45 detik bermain nyata di browser (jumlah node DOM dan heap tidak naik).

Yang belum: 60 fps pada perangkat ponsel nyata, dan netplay lintas perangkat di jaringan seluler.
Keduanya butuh perangkat, jadi angka performa ponsel sengaja tidak diklaim.

## Lisensi

MIT. Seluruh model 3D dan audio dibuat prosedural dari kode, tanpa aset berhak cipta.
