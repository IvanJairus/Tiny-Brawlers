# Project: Tiny Brawlers v2

## Bacaan produk

Game aksi isometrik 3D di browser. Empat tim chibi berebut peti di tengah pulau, memikulnya ke
building pad 2x2x2, dan merakit tumpukan menjadi senjata, satuan, atau tank. Objective: hancurkan
bunker lawan. Homage ke Team Buddies (PS1) dengan aset dan audio prosedural sendiri.

Tujuan layar: **experience**. HUD dan menu mengurangi friksi main, bukan memamerkan dashboard.

## Kontrak visual

1. Material: panel solid seperti mainan plastik, outline gelap 2px, drop shadow keras tanpa blur.
   Blur hanya di modal. Tidak ada glow menyeluruh, tidak ada glassmorphism berlapis.
2. Warna: dasar netral hangat dari rumput dan langit; warna tim sebagai satu-satunya aksen jenuh;
   satu warna peringatan. Token lama yang salah (`--team-blue` berisi hijau, `--team-cyan` berisi
   biru) sudah dibetulkan supaya nama dan warna cocok.
3. Tipografi: display `Baloo 2` untuk angka dan judul, teks `Nunito Sans` untuk keterangan.
   Keduanya woff2 subset latin yang di-self-host di `public/fonts` bersama notis
   lisensi OFL-nya, jadi tidak ada request ke host pihak ketiga dan tidak ada
   `<link>` font yang memblokir render.
4. Hierarki: HP pemain di kiri atas, skor bunker di kanan atas, kartu pad hanya muncul saat pemain
   berdiri di dekat pad, tombol jempol hanya ada di perangkat sentuh.
5. State yang ada dan diuji: memuat, judul, pilih kelas, lobby, playing, paused, results,
   disconnected, unsupported.
6. Kondisi selesai: nol bocor horizontal dan nol tumpang tindih di 1440x900, 740x360, 390x844;
   target sentuh ≥ 44px; modal menjebak fokus dan menutup dengan Escape; `prefers-reduced-motion`
   mematikan guncangan.

## Arsitektur

```
src/
  sim/        TypeScript murni: dilarang three, DOM, jam dinding, Math.random
    core/     world, ids, rng, tick, events, view, step
    domain/   constants, teams, classes, pad, recipes, buddy, crate, weapon, projectile, tank, match
    ai/       bot.ts: keputusan bot dengan target rakit per tim
    input/    actions.ts: InputCmd kuantan 8 byte
    net/      codec, messages, transport, webrtc, signalling, host, client, predict, interp, session
  render/     satu-satunya tempat Three.js
    scene, arena, water (di arena), chibi, props, projectiles, particles, tanks, materials, camera, budget, bridge
  ui/         shell/{machine,router,screens,lobby}, hud/{store,bind}, styles/{tokens,layout,screens}, i18n/id
  platform/   audio/{graph,patches,bgm,index}, input/{keyboard,touch}, storage, browsercheck, net, roomcode
  boot.ts     satu-satunya pemilik requestAnimationFrame
```

### Aturan lapisan

`tests/layers.test.ts` membaca setiap file di `src/sim` dan gagal kalau ada impor `three`, akses
`document`/`window`, `requestAnimationFrame`, `Date.now`, `Math.random`, atau `performance`. Satu tes
lain gagal kalau loop frame muncul di luar `boot.ts`. Konsekuensinya: bug kelas "logika sudah
berubah tapi gambar belum" tidak punya tempat terjadi, dan simulasi yang sama jalan di Vitest dan di
browser.

### Model waktu

Tick tetap 30 Hz dengan akumulator tunggal dan clamp 5 langkah. Render berjalan pada rAF sendiri,
hanya mendorong tick saat layar `playing`, dan membaca hasil lewat interpolasi `alpha`.
Snapshot jaringan 15 Hz. ViewState ke HUD 15 Hz.

### Netplay

Host-authoritative. Host satu-satunya yang mensimulasikan. Klien mengirim `InputCmd` dan merender
keadaan host; hanya buddy milik pemain lokal yang diprediksi, sisanya otoritatif. Snapshot penuh
bertahan di bawah 1200 byte sehingga 15 Hz tetap di bawah 16 KB/s. Signaling dan data dipisah:
BroadcastChannel untuk tab di satu browser, relay sendiri lewat `?signal=`, dan kode ruangan 6
karakter agar tidak bisa disusupi.

### Anggaran render

Diuji di `tests/render/budget.test.ts`: draw call ≤ 60, material ≤ 12, geometry ≤ 30,
triangle ≤ 45k, program GL ≤ 12, tanpa shadow map dinamis. Terukur pada pertempuran penuh:
25 draw call, 5 material, 25 geometry.

## Verifikasi

| Gerbang | Bukti |
|---|---|
| Tipe dan build | `tsc --noEmit` bersih, `vite build` hijau |
| Aturan lapisan | `npm run lint:layers` |
| Aturan sim | 168 tes Vitest: determinisme, 7 resep, invarian cacat lama, codec, sesi net |
| Netplay nyata | `e2e/netplay.spec.ts`: dua halaman browser menyelesaikan satu laga lewat WebRTC |
| Layout dan kendali | `e2e/layout.spec.ts` di 1440x900, 740x360, 390x844: 24 tes |
| Belum terverifikasi | 60 fps di perangkat ponsel nyata, netplay lintas perangkat di jaringan seluler |

Daftar paritas lengkap ada di `docs/PARITY.md`.

## Di luar cakupan

Gamepad, leaderboard atau backend skor, achievements, aplikasi native, modding, replay.
