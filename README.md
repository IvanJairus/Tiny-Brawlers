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
npm run test:browser   # 24 tes Playwright di 3 ukuran layar
npm run build          # tsc + vite build
```

## Kendali

| Aksi | Keyboard | Sentuh |
|---|---|---|
| Jalan | WASD atau panah | stick dinamis di setengah layar kiri |
| Ambil / letak / lempar peti, naik tank | E | AMBIL |
| Tembak | F atau Spasi | TEMBAK |
| Rakit pad (harus berdiri di dekat pad) | R atau Q | tombol Rakit di kartu pad |
| Zoom | scroll atau + / - | cubit, atau dua tombol zoom |
| Jeda (mode solo) | Esc | tombol II |

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

## Status verifikasi

Yang dibuktikan otomatis: aturan lapisan, determinisme sim, 7 resep, invarian cacat lama, codec
dan sesi netplay di link ber-jitter, anggaran render, tidak ada bocor horizontal dan tidak ada
tumpang tindih HUD di 1440x900 / 740x360 / 390x844, dua halaman browser main satu pertandingan.

Yang belum: 60 fps pada perangkat ponsel nyata, dan netplay lintas perangkat di jaringan seluler.
Keduanya butuh perangkat, jadi angka performa ponsel sengaja tidak diklaim.

## Lisensi

MIT. Seluruh model 3D dan audio dibuat prosedural dari kode, tanpa aset berhak cipta.
