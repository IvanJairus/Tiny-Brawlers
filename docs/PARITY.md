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
| 8 | Kecepatan simulasi | Pertandingan 4 tim 60 detik jalan ≥1000x realtime; terukur 2278-4284x (n=5) saat file itu memegang CPU sendiri lewat `npm run test:speed`, dan 1054x saat seluruh suite berjalan paralel, jadi lantai di suite adalah jaring regresi 300x | tests/sim/determinism.test.ts, .github/workflows/ci.yml | M1 | A |
| 9 | Kelas Fighter | HP 130, kecepatan 6,8, pengali rusak 1,25 | tests/sim/buddy.test.ts | M2 | A |
| 10 | Kelas Healer | HP 100, aura 4,5m, 25 HP per detik | tests/sim/buddy.test.ts, tests/sim/step.test.ts | M2 | A |
| 11 | Kelas Constructor | HP 90, kecepatan 8,2, faktor bawa 0,95, lempar 18 | tests/sim/buddy.test.ts | M2 | A |
| 12 | Penalti membawa peti | Kecepatan turun sesuai faktor kelas | tests/sim/buddy.test.ts | M2 | A |
| 13 | Batas arena | Karakter tidak keluar pulau lewat rumput | tests/sim/buddy.test.ts | M2 | A |
| 14 | Deteksi void | Buddy di luar 46 m dikembalikan ke basis dan tumbang, peti yang hilang di luar terhapus dan id-nya dilepas | tests/sim/step.test.ts | M2 | A |
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
| 41 | Pasukan bala bantuan | Tiap tim yang belum kalah memanggil satu fighter baru setiap 20 detik sampai skuad penuh (6) | tests/sim/step.test.ts | M2 | A |
| 42 | Tank bisa dikendarai | Naik, kemudi, tembak, terusir saat pengemudi tumbang | tests/sim/step.test.ts | M2 | A |
| 43 | Bangkai tank dibersihkan | Entitas hilang dan id-nya dilepas | tests/sim/step.test.ts | M2 | A |
| 44 | Meriam tank satu frame dunia | Sudut menara dunia, bukan lokal | tests/invariants/defects.test.ts | M2 | A |
| 45 | Tidak ada peti hantu | Setiap `heldBy` dan `carryCrate` selalu valid | tests/invariants/defects.test.ts | M2 | A |
| 46 | Bot menumpuk resep sungguhan | Bot mencapai seluruh resep, bukan pistol saja | tests/invariants/defects.test.ts | M2 | A |
| 47 | Bot melawan dan mengambil peti | AI memakai senjata, memburu peti, mengisi pad | tests/invariants/defects.test.ts | M2 | A |
| 48 | Input kuantan tetap | Stream sentuh dan keyboard identik menghasilkan dunia identik | tests/sim/input-parity.test.ts | M4 | A |
| 49 | Mesin tanpa nama | Sim tidak punya nama node scene graph untuk di-assert | tests/layers.test.ts | M0 | A |
| 50 | Arena satu draw call statis | Pulau, bunker, karung pasir, pad digabung | tests/render/budget.test.ts | M3 | A |
| 51 | Anggaran draw call | DC ≤ 60, material ≤ 12, geometry ≤ 30 | tests/render/budget.test.ts | M3 | A |
| 52 | Air di GPU | Gelombang di vertex shader, bukan CPU | tests/render/water.test.ts | M3 | A |
| 53 | Chibi multi-part merge | Bagian tubuh digabung jadi satu geometri, 13 mesh melayani 24 buddy dan tidak tumbuh mengikuti jumlah buddy | tests/render/budget.test.ts | M3 | A |
| 54 | Palet tim benar | Nama tim dan warna cocok, tanpa tekstur | tests/render/palette.test.ts | M3 | A |
| 55 | Layar judul dan pilih | State machine menelusuri semua layar | tests/ui/machine.test.ts | M4 | A |
| 56 | Pause hanya solo | Simulasi berhenti saat layar bukan playing | tests/ui/machine.test.ts | M4 | A |
| 57 | HUD tanpa lookup per frame | Node diselesaikan sekali saat mount, tulis di-diff | tests/ui/hud-bind.test.ts | M4 | A |
| 58 | Tidak ada bocor horizontal | scrollWidth = lebar viewport di 3 ukuran | e2e/layout.spec.ts | M4 | A |
| 59 | Target sentuh 44px | Semua kontrol sentuh ≥ 44px dengan jarak | e2e/layout.spec.ts | M4 | A |
| 60 | Kontrol sentuh hanya di sentuh | `pointer: coarse` menjadi satu-satunya pemicu | e2e/layout.spec.ts | M4 | A |
| 61 | Audio unlock oleh gesture | Tidak ada AudioContext sebelum dan sesudah tombol pertama ditekan, persis satu setelah pertandingan mulai | e2e/production.spec.ts | M7 | A |
| 62 | Pool suara | Maksimal 8 cue per detik, 12 voice dengan oldest-steal, dedup 40ms per lokasi | tests/platform/audio.test.ts | M7 | A |
| 63 | Codec snapshot | Round-trip biner identik, buffer rusak ditolak | tests/net/net.test.ts | M5 | A |
| 64 | Host otoritatif | Klien hanya mengirim input, host yang mensimulasikan | tests/net/net.test.ts | M5 | A |
| 65 | Prediksi bounded | Hanya buddy lokal yang diprediksi, sisanya otoritatif | tests/net/net.test.ts | M5 | A |
| 66 | Interpolasi tahan loss | Harness 1 host plus 3 klien selama 5 menit waktu link (60ms delay, 60ms jitter, loss 3 persen, duplikasi 2 persen): lag snapshot maksimum 3 tick, 4195 dari sekitar 4500 snapshot tiba, hard snap 1 sampai 3 kali | tests/net/net.test.ts | M5 | A |
| 67 | Putus jadi bot | Peer yang hilang jadi bot dan tetap membawa petinya, dalam ≤3 detik waktu link sesuai rencana (terukur 2466,7 ms, n=1) | tests/net/net.test.ts | M5 | A |
| 68 | Anggaran bandwidth | Snapshot dunia penuh < 1200 byte, di bawah 16KB/s | tests/net/net.test.ts | M5 | A |
| 69 | Kode ruangan | Gabung dengan kode salah ditolak | tests/net/net.test.ts | M5 | A |
| 70 | Perangkat pendukung | RTCPeerConnection tidak ada pindah layar unsupported | tests/platform/audio.test.ts, tests/ui/machine.test.ts | M6 | A |
| 71 | Layar hasil nyata | Statistik dihitung dari event simulasi yang nyata | e2e/layout.spec.ts | M7 | A |
| 72 | Bangun produksi bersih | tsc dan vite build tanpa error; artefak produksi yang diuji suite datang dari hasil build, jadi build yang gagal menyeret seluruh suite production | playwright.config.ts, e2e/production.spec.ts | M0 | A |
| 75 | Artefak produksi benar-benar jalan | Build hasil `vite build` dihidupkan lewat preview: boot, layout ponsel, frame nyata, tanpa error konsol | e2e/production.spec.ts | M7 | A |
| 81 | Preview slot penempatan | Peti yang dibawa menunjukkan slot tujuan di pad | e2e/layout.spec.ts, tests/render/reading-aids.test.ts | M3 | A |
| 82 | Guncangan kamera | Ledakan dekat kamera mengguncang, yang jauh tidak | tests/render/reading-aids.test.ts | M4 | A |
| 83 | Turun resolusi otomatis | 60 frame berturut-turut di atas 20ms menurunkan skala render ke 0,75 sekali saja | tests/render/reading-aids.test.ts | M3 | A |
| 84 | Tidak ada pause di netplay | Escape membuka dialog keluar dan membekukan tampilan lokal, tidak pernah masuk layar paused | e2e/relay.spec.ts, tests/ui/router.test.ts, tests/ui/machine.test.ts | M4 | A |
| 92 | Jalan keluar saat netplay | Tombol HUD berubah jadi Keluar, konfirmasi mengembalikan pemain ke judul dan menutup koneksi | e2e/netplay.spec.ts | M6 | A |
| 93 | Zoom di kedua jalur input | Tombol + dan - muncul hanya di sentuh dan mengubah jarak kamera; di desktop scroll dan tombol +/- tetap bekerja | e2e/layout.spec.ts, tests/sim/input-parity.test.ts, tests/ui/hud-bind.test.ts | M4 | A |
| 94 | Ring stick tidak mencaplok tombol | Rect ring tidak memotong satu pun tombol aksi pada 1440x900, 740x360, dan 390x844 | e2e/layout.spec.ts | M4 | A |
| 95 | Baseline visual UI | Tujuh permukaan UI di dua viewport (1440x900 dan 740x360) dibandingkan PNG yang di-commit, canvas disembunyikan supaya yang diuji murni DOM, ambang 0,15 persen; tiga jalan beruntun identik | e2e/visual.spec.ts | M7 | A |
| 96 | Relay mati dilaporkan | Koneksi signaling yang ditolak muncul sebagai alasan di lobby, bukan ruang tunggu yang menggantung | e2e/relay.spec.ts, tests/net/signalling.test.ts, tests/net/session.test.ts | M6 | A |
| 97 | Tetap main tanpa audio | AudioContext yang gagal dibuat tidak menghentikan pertandingan dan tidak melempar error halaman | e2e/layout.spec.ts | M7 | A |
| 85 | Alasan gabung gagal ditampilkan | Kode salah atau ruangan penuh terlihat di layar lobby | tests/net/session.test.ts | M6 | A |
| 86 | Busur lemparan | Membawa peti di luar jangkauan pad menampilkan garis jalur jatuh, dan ujungnya sama persis dengan integrasi peti sungguhan | tests/render/reading-aids.test.ts, tests/sim/crate.test.ts, e2e/layout.spec.ts | M4 | A |
| 87 | Flash kerusakan | Tubuh yang kena serangan dibungkus shell putih aditif yang memudar dalam 60 ms | tests/render/reading-aids.test.ts | M4 | A |
| 88 | Bobot peti dan pop tumbang | Membawa peti memendekkan sekaligus melebarkan badan; KO menaikkan skala badan 30 persen sesaat | tests/render/reading-aids.test.ts | M4 | A |
| 89 | Hit-stop khusus desktop | Ledakan kuat di dekat kamera menahan gambar 40 ms; mati di sentuh, reduced motion, atau frame di atas 20 ms | tests/render/reading-aids.test.ts | M4 | A |
| 90 | Font di-self-host | Baloo 2 dan Nunito Sans dimuat dari bundle dan kedua face berstatus loaded; nol request ke host lain | e2e/production.spec.ts | M4 | A |
| 91 | Pengumuman screen reader | HP antar-kuartal, peti diambil atau dilepas, skuad tumbang, dan pemenang lewat satu region polite selebar 1 px | tests/ui/hud-bind.test.ts, e2e/layout.spec.ts | M4 | A |
| 80 | Tahan throttle 6x | p95 ≤ 20ms dan ≥ 50 fps di viewport ponsel dengan CPU di-throttle 6x | e2e/perf.spec.ts | M7 | A |
| 79 | Relay signaling nyata | Dua halaman bernegosiasi lewat server WebSocket sungguhan | e2e/relay.spec.ts | M6 | A |
| 77 | Soak 20 menit tanpa bocor | Roster ≤ 6 per tim, peti ≤ 24, id aktif tidak bertambah tanpa batas | tests/invariants/soak.test.ts | M7 | A |
| 78 | Sesi panjang di browser | 45 detik bermain nyata tidak menambah node DOM atau heap | e2e/production.spec.ts | M7 | A |
| 76 | Alat ukur di perangkat | `?meter=1` menampilkan fps, p50, p95, dan draw call | e2e/production.spec.ts | M7 | A |
| 73 | Netplay dua halaman | Dua halaman browser menyelesaikan satu pertandingan lewat WebRTC, dan kursi kedua benar-benar terisi (roster host menunjuk 2 manusia, tamu mengontrol buddy yang ada di host) | e2e/netplay.spec.ts | M6 | A |
| 98 | Pesan sebelum channel terbuka | join yang dikirim sebelum data channel open tidak hilang, melainkan keluar saat open | tests/net/webrtc.test.ts, e2e/netplay.spec.ts | M5 | A |
| 99 | Host tidak diambil alih AI | Setelah 30 detik waktu link, buddy host tetap ownedByPlayer dan bukan bot | tests/net/session.test.ts | M5 | A |
| 100 | Tamu yang tabnya ditutup jadi bot | Di dua halaman nyata: host kembali ke 1 manusia, tanpa peti hantu, dan tick terus jalan | e2e/netplay.spec.ts | M6 | A |
| 101 | Delapan bentuk lewat InputCmd | Setiap resep dicapai dengan urutan ambil/letak/rakit sungguhan tanpa menulis mask langsung, dan pad kosong setelah dirakit | tests/sim/step.test.ts | M2 | A |
| 74 | Simulasi tidak berjalan di layar salah | Tick hanya terjadi saat layar playing | e2e/layout.spec.ts | M4 | A |
| 102 | Tampilan ASCII debug | `?ascii=1` menampilkan grid 65x33 plus tick/hp/hidup, setiap baris ≤ 65 karakter, dan panel tidak keluar dari layar di 1440x900, 740x360, 390x844 | tests/sim/ascii.test.ts, e2e/layout.spec.ts | M2 | A |
| 103 | Navigasi keyboard penuh di menu | Tab dan Shift+Tab berputar di dalam layar tanpa pernah keluar (fokus = none), setiap layar merebut fokus saat dibuka, dan Enter menyelesaikan rute judul → pilih kelas → main → jeda → lanjut di tiga ukuran | e2e/layout.spec.ts | M4 | A |
| 104 | Reduced motion dan tanpa animasi tanpa pemicu | Dengan prefers-reduced-motion: reduce tidak ada transisi UI yang lebih dari 1 ms dan tidak ada animasi CSS tak berujung; probe yang sama membuktikan transisi nyata ada saat motion normal | e2e/layout.spec.ts | M4 | A |
| 105 | Paritas dijaga mesin | Setiap baris ledger punya nomor unik, klaim perilaku, milestone M0-M7, menyebut file tes yang benar-benar ada serta berisi tes, dan berstatus A atau P; kalau P, alasannya harus tertulis di bagian Masih sebagian | tests/docs/parity.test.ts | M7 | A |
| 106 | Konvergensi setelah stall 400 ms | Di link bermusuhan (60ms delay, 60ms jitter, loss 3%, dup 2%) klien kembali memegang snapshot dari setelah stall dalam 133,3 ms waktu link dan tertinggal 3 tick (n=1, seed 5; gerbang 250 ms dan 5 tick), dan isi snapshot yang dipegangnya persis sama dengan state host untuk tick itu | tests/net/net.test.ts | M5 | A |
| 107 | Simpul prediksi ≤0,75 m | Rencana 4.3 menuntut simpul prediksi tidak pernah lewat 0,75 m setelah loss acak. Terukur 0,867-0,982 m (dan 0,989-1,227 m untuk prediktor yang dirusak sampai tidak bergerak, jadi batas di kisaran itu tidak membuktikan mutu prediksi); angka itu dari eksperimen yang sudah ditarik sehingga tidak bisa direproduksi dari build ini, alasannya di bagian Masih sebagian | tests/net/net.test.ts | M5 | P |
| 108 | Bot mencapai tujuh resep pad | Laga 5 menit semua-bot di seed 20260 membangun pistol, shotgun, grenade, medic_unit, medic, bazooka, dan commando tanpa satu pun manusia menekan tombol | tests/sim/bots.test.ts | M4 | A |
| 109 | Tank dirakit AI sendiri | Pad delapan peti benar-benar selesai dan keluar tank tanpa manusia: 5 dari 8 seed sesudah perbaikan, 2 dari 8 sebelumnya, dan angka itu dicetak oleh tesnya sendiri | tests/sim/bots.test.ts | M4 | A |
| 110 | Artefak build dilalui tanpa dev handle | Rute layar penuh di hasil build sungguhan (judul → pilih kelas → main → jeda → keluar ke judul), plus nol bocor horizontal dan nol kartu HUD tumpang tindih di 1440x900, 740x360, dan 390x844 | e2e/production.spec.ts | M7 | A |
| 111 | Layar notice menyebut sebab dan aksi | Layar unsupported dan disconnected punya judul, badan, satu baris aksi, dan tombol yang mengirim recover; memindah layar tidak meninggalkan panel lama | tests/ui/screens.test.ts | M4 | A |
| 112 | Kontras modal terukur di browser | Rasio WCAG dihitung dari computed style tiap teks modal terhadap latar opaque pertama di atasnya: paused 15,82, confirming 15,82, results 10,14, disconnected 15,82/15,82/6,83, semuanya ≥4,5:1; blur hanya ada di modal hasil sesuai kontrak 5.3 | e2e/layout.spec.ts | M4 | A |
| 113 | Debu saat peti mendarat | Peti yang sudah di atas tanah dan sekarang diam memunculkan burst debu; terdeteksi 2 kali dari 2 peti yang benar-benar jatuh dalam 10 detik simulasi, dan tidak berulang saat peti sudah diam | tests/render/effects.test.ts | M4 | A |
| 114 | Serpihan kayu saat peti pecah | Momen pad mengonsumsi peti memicu serpihan kayu selain kilatan rakit | tests/render/effects.test.ts | M4 | A |
| 115 | Satu cue berbeda per aksi | ambil, lempar, rakit, tembak, kena, KO memakai patch yang berbeda satu sama lain, dan sting menang tidak dipakai ulang oleh salah satunya | tests/platform/audio.test.ts | M4 | A |
| 116 | Tayang dari subpath repo | Build yang sama disajikan dari /Tiny-Brawlers/ tanpa fallback SPA: boot sampai layar main, kedua font benar-benar termuat, kanvas memuat frame nyata, dan nol request 404; mengubah base vite ke '/' membuatnya merah | e2e/subpath.spec.ts | M7 | A |
| 117 | Latensi masukan terkunci | Di link bermusuhan masukan terbaru sudah menjadi otoritas pada tick yang sama saat host menerima: p95 3 tick, maksimum 3 (n=1456 penerapan). Versi berantrean menaikkan keduanya ke 6 dan 7 tick dan membuat tes ini merah | tests/net/net.test.ts | M5 | A |

## Masih sebagian

**Baris 107, Simpul prediksi ≤0,75 m.** Klausa ini sudah diuji dan hasilnya bukan lolos atau
gagal, melainkan bahwa angka itu tidak bisa menjadi gerbang mutu. Saya tambahkan pengakuan
nomor input ke snapshot supaya klien membandingkan posisinya pada *seq* yang sama, lalu mengukur
selama lima menit di link 60 ms + jitter 60 ms: simpul terbesar 0,867 sampai 0,982 meter. Masalahnya,
prediktor yang sengaja dirusak sampai tidak bergerak sama sekali (mengabaikan masukan) hanya
naik ke 0,989 sampai 1,227 meter di link yang sama. Yang menahan angka itu tetap kecil bukan
prediksinya, melainkan koreksi: begitu lewat 0,75 m klien disnap, jadi batas di kisaran 1,3 m
terpenuhi oleh prediktor apa pun, termasuk yang useless. Gerbang yang tidak bisa membedakan prediktor bagus dari yang rusak tidak
ada gunanya, jadi percobaannya saya tarik kembali: tidak ada field wire baru di build ini.

Satu temuan lain, dan jawabannya sudah diukur: klien tidak bisa mereplikasi lintasan host, karena
host hanya menyimpan masukan terbaru per tick sementara klien melangkah tiap masukan. Di bawah
jitter, masukan yang datang berbarengan dipakai host sekali tapi dilangkahi klien beberapa kali,
terukur 4355 dari 6000 masukan benar-benar menjadi otoritas.

Antrean per slot (keluarkan satu masukan tiap tick, seperti rollback netcode) sudah dicoba dan
sudah diukur: ia menaikkan penerapan masukan menjadi 5786 dari 6000, tetapi menaikkan latensi
masukan dari p95 3 tick menjadi p95 6 tick, yaitu sekitar 100 ms menjadi 200 ms. Karena simpul
prediksi sudah dibatasi oleh snap threshold, tambahan latensi itu tidak membeli apa pun yang bisa
diamati, jadi antreannya tidak dipakai. Baris 117 menjaga keputusan itu: dengan antrean, tesnya
merah.

## Yang sengaja tidak ada

Rencana bagian 4.5 menyebut "peregangan saat melompat". Simulasi v2 tidak punya
lompatan, jadi tidak ada yang bisa diregangkan; bahasa badan dibawa oleh squash
membawa peti (baris 88) dan pop saat tumbang. Tidak ada stub atau tombol mati untuk
ini, sama seperti gamepad, leaderboard, dan aplikasi native di bagian 9 rencana.
