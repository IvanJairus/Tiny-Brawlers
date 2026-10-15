# Paritas fitur Tiny Brawlers

Sumber kebenaran untuk "jangan turun mutu" setelah penulisan ulang. Baris-fitur diturunkan dari
`reference/legacy-src` dan `PROJECT.md` lama; kode lamanya sendiri tidak dipakai. Tiap baris wajib
punya tes yang benar-benar membuktikan perilakunya, bukan hanya menyebutnya.

Status: `A` = diafirmasi tes hijau, `P` = sebagian, `-` = belum dikerjakan.

| # | Fitur | Perilaku yang diharapkan | Tes | Milestone | Status |
|---|---|---|---|---|---|
| 1 | Tick tetap 30 Hz | Waktu frame tidak mengubah hasil permainan | tests/sim/tick.test.ts | M1 | A |
| 2 | Akumulator tahan lonjakan | Backlog besar di-clamp, tidak spiral | tests/sim/tick.test.ts | M1 | A |
| 3 | Sim tanpa host API | Sim tidak menyentuh DOM, three, jam dinding, Math.random | tests/layers.test.ts | M0 | A |
| 4 | Satu loop rAF | requestAnimationFrame hanya di boot | tests/layers.test.ts | M0 | A |
| 5 | ID entitas bertingkat | Slot dipakai ulang dengan generasi baru, tanpa tabrakan | tests/sim/ids.test.ts | M1 | A |
| 6 | RNG dapat replay | Seed sama menghasilkan hash sama | tests/sim/determinism.test.ts | M1 | A |
| 7 | Hash dunia | Sidik jari kuantitatif untuk determinisme dan netplay | tests/sim/determinism.test.ts | M1 | A |
| 8 | Kecepatan simulasi | Pertandingan 60 detik jauh di atas realtime | tests/sim/determinism.test.ts | M1 | A |
| 9 | Kelas Fighter | HP 130, kecepatan 6,8, pengali rusak 1,25 | tests/sim/buddy.test.ts | M2 | A |
| 10 | Kelas Healer | HP 100, aura 4,5m, 25 HP per detik | tests/sim/buddy.test.ts, tests/sim/step.test.ts | M2 | A |
| 11 | Kelas Constructor | HP 90, kecepatan 8,2, faktor bawa 0,95, lempar 18 | tests/sim/buddy.test.ts | M2 | A |
| 12 | Penalti membawa peti | Kecepatan turun sesuai faktor kelas | tests/sim/buddy.test.ts | M2 | A |
| 13 | Batas arena | Karakter tidak keluar pulau lewat rumput | tests/sim/buddy.test.ts | M2 | A |
| 14 | Deteksi void | Keluar batas memicu jatuh dan kembali ke basis | tests/sim/step.ts (recoverFromVoid) | M2 | A |
| 15 | KO dan respawn | Tumbang 5 detik, hidup lagi 40 persen HP dengan kekebalan | tests/sim/buddy.test.ts, tests/sim/step.test.ts | M2 | A |
| 16 | Peti jatuh dan diam | Gravitasi, satu lantunan, lalu istirahat | tests/sim/crate.test.ts | M2 | A |
| 17 | Peti di kepala | Peti ikut pembawanya dan tidak diintegrasikan | tests/sim/crate.test.ts | M2 | A |
| 18 | Lempar peti | Busur sesuai gaya lempar kelas | tests/sim/crate.test.ts, tests/sim/step.test.ts | M2 | A |
| 19 | Pad 2x2x2 | Delapan slot, dua lapis, empat kuadran | tests/sim/pad.test.ts | M2 | A |
| 20 | Aturan gravitasi pad | Slot atas butuh bawah; melepas bawah meruntuhkan atas | tests/sim/pad.test.ts | M2 | A |
| 21 | Pemilihan slot terdekat | Mendekati kuadran terdekat, bawah dulu | tests/sim/pad.test.ts | M2 | A |
| 22 | Resep pistol | 1 peti ke pistol 90 DPS | tests/sim/recipes.test.ts, tests/sim/step.test.ts | M2 | A |
| 23 | Resep shotgun | 2 peti sebaris ke shotgun 220 DPS | tests/sim/recipes.test.ts, tests/sim/step.test.ts | M2 | A |
| 24 | Resep granat | 2 peti tumpuk ke 5 granat 320 ledak | tests/sim/recipes.test.ts, tests/sim/step.test.ts | M2 | A |
| 25 | Resep medic unit | 2 bawah 1 atas memanggil healer AI | tests/sim/recipes.test.ts, tests/sim/step.test.ts | M2 | A |
| 26 | Resep medkit | 3 bawah suntik 60 HP dan hidupkan kawan | tests/sim/recipes.test.ts, tests/sim/step.test.ts | M2 | A |
| 27 | Resep bazooka | 2x2 lantai bawah ke roket 450 DPS | tests/sim/recipes.test.ts, tests/sim/step.test.ts | M2 | A |
| 28 | Resep commando | Dinding 2x1x2 memanggil prajurit AI | tests/sim/recipes.test.ts, tests/sim/step.test.ts | M2 | A |
| 29 | Resep tank | Kubus penuh 8 peti memanggil tank | tests/sim/recipes.test.ts, tests/sim/step.test.ts | M2 | A |
| 30 | Paket amunisi | Bentuk tak beraturan tetap menghasilkan efek | tests/sim/recipes.test.ts | M2 | A |
| 31 | Semua mask legal terpetakan | 81 mask valid menghasilkan tepat satu resep | tests/sim/recipes.test.ts | M2 | A |
| 32 | Rakit butuh dekat pad | Tombol rakit tidak bekerja dari seberang peta | tests/sim/step.test.ts | M2 | A |
| 33 | Peti lempar tidak melayani musuh | Peti tim lain tidak masuk pad lawan | tests/sim/step.test.ts | M2 | A |
| 34 | Laju tembakan nyata | Cooldown per senjata, bukan klik tanpa batas | tests/sim/step.test.ts | M2 | A |
| 35 | Proyektil punya wujud | Granat, roket, dan peluru semuanya tercatat sebagai entitas | tests/sim/step.test.ts, tests/invariants/defects.test.ts | M2 | A |
| 36 | Tabrak sapuan | Proyektil cepat tidak menembus target | tests/sim/step.test.ts | M2 | A |
| 37 | Ledak ramah-timah | Ledakan tidak melukai tim penembak | tests/invariants/defects.test.ts, tests/sim/step.test.ts | M2 | A |
| 38 | Kerusakan bunker | Hanya tembok tim lawan yang berkurang, tidak oleh temannya | tests/sim/step.test.ts | M2 | A |
| 39 | Eliminasi tim | Bunker rata dan semua tumbang | tests/sim/step.test.ts | M2 | A |
| 40 | Akhir pertandingan membekukan sim | Tidak ada tick, spawn, atau event setelah laga usai | tests/invariants/defects.test.ts | M2 | A |
| 41 | Baku tambah pasukan | Unit baru lahir berkala selama bunker utuh | tests/sim/step.ts (tickReinforcements) | M2 | A |
| 42 | Tank bisa dikendarai | Naik, kemudi, tembak, terusir saat pengemudi tumbang | tests/sim/step.test.ts | M2 | A |
| 43 | Bangkai tank dibersihkan | Entitas hilang dan id-nya dilepas | tests/sim/step.test.ts | M2 | A |
| 44 | Meriam tank satu frame dunia | Sudut menara dunia, bukan lokal | tests/invariants/defects.test.ts | M2 | A |
| 45 | Tidak ada peti hantu | Setiap `heldBy` dan `carryCrate` selalu valid | tests/invariants/defects.test.ts | M2 | A |
| 46 | Bot menumpuk resep sungguhan | Bot mencapai seluruh resep, bukan pistol saja | tests/invariants/defects.test.ts | M2 | A |
| 47 | Bot melawan dan mengambil peti | AI memakai senjata, memburu peti, mengisi pad | tests/invariants/defects.test.ts | M2 | A |
| 48 | Input kuantan tetap | Stream sentuh dan keyboard identik menghasilkan dunia identik | tests/net/parity-input.test.ts | M4 | - |
| 49 | Mesin tanpa nama | Sim tidak punya nama node scene graph untuk di-assert | tests/layers.test.ts | M0 | A |
| 50 | Arena satu draw call statis | Pulau, bunker, karung pasir, pad digabung | tests/render/budget.test.ts | M3 | - |
| 51 | Anggaran draw call | DC ≤ 60, material ≤ 12, geometry ≤ 30 | tests/render/budget.test.ts | M3 | - |
| 52 | Air di GPU | Gelombang di vertex shader, bukan CPU | tests/render/budget.test.ts | M3 | - |
| 53 | Chibi multi-part merge | Karakter 2-3 mesh, bukan 67 | tests/render/budget.test.ts | M3 | - |
| 54 | Palet tim benar | Nama tim dan warna cocok | tests/render/palette.test.ts | M3 | - |
| 55 | Layar judul dan pilih | State machine menelusuri semua layar | tests/ui/machine.test.ts | M4 | - |
| 56 | Pause hanya solo | Netplay tidak membekukan orang lain | tests/ui/machine.test.ts | M4 | - |
| 57 | HUD tanpa lookup per frame | Node diselesaikan sekali saat mount | tests/ui/hud-bind.test.ts | M4 | - |
| 58 | Tidak ada bocor horizontal | scrollWidth = lebar viewport di 3 ukuran | tests/browser/layout.test.ts | M4 | - |
| 59 | Target sentuh 44px | Semua kontrol sentuh ≥ 44px dengan jarak | tests/browser/layout.test.ts | M4 | - |
| 60 | Kontrol sentuh hanya di sentuh | `pointer: coarse` menjadi satu-satunya pemicu | tests/browser/layout.test.ts | M4 | - |
| 61 | Audio unlock oleh gesture | Context dimulai hanya setelah "Mulai" | tests/browser/audio.test.ts | M7 | - |
| 62 | Pool suara | Maksimal 8 SFX per detik, dedup 40ms | tests/platform/audio.test.ts | M7 | - |
| 63 | Codec snapshot | Round-trip biner identik | tests/net/codec.test.ts | M5 | - |
| 64 | Host otoritatif | Klien hanya mengirim input | tests/net/host.test.ts | M5 | - |
| 65 | Prediksi bounded | Selisih buddy lokal tidak pernah > 0,75m | tests/net/predict.test.ts | M5 | - |
| 66 | Interpolasi tahan loss | Stall 400ms lalu konvergen ≤ 1 tick | tests/net/interp.test.ts | M5 | - |
| 67 | Putus jadi bot | Slot diambil alih AI ≤ 3 detik tanpa peti hantu | tests/net/takeover.test.ts | M5 | - |
| 68 | Anggaran bandwidth | Snapshot 15Hz di bawah 16KB/s | tests/net/bandwidth.test.ts | M5 | - |
| 69 | Kode ruangan | Gabung tanpa kode ditolak | tests/net/room.test.ts | M6 | - |
| 70 | Perangkat pendukung | RTCPeerConnection tidak ada pindah layar unsupported | tests/browser/browsercheck.test.ts | M6 | - |
| 71 | Layar hasil nyata | Statistik berasal dari dunia, bukan angka hiasan | tests/browser/results.test.ts | M7 | - |
| 72 | Bangun produksi bersih | tsc dan vite build tanpa error | CI | M0 | A |
