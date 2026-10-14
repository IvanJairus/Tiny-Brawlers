# Tiny Brawlers 🥊📦

> **Arcade 3D Crate-Stacking Battle Arena**  
> *Spiritual successor berkinerja tinggi yang terinspirasi oleh game PS1 legendaris (Team Buddies), dibangun dengan Three.js, WebGL 2.0, Web Audio API prosedural, dan fisika AABB khusus tanpa ketergantungan library berat.*

---

## 🎮 Tentang Permainan

**Tiny Brawlers** adalah game pertempuran aksi strategi 3D di mana empat tim (Merah, Hijau, Kuning, Biru) saling memperebutkan peti-peti kayu yang jatuh dari langit ke tengah arena. Pemain membawa peti tersebut ke markas (*Building Pad* 2x2x2) untuk dirakit menjadi senjata mematikan, menyembuhkan kawan, atau membangkitkan prajurit dan kendaraan tempur.

### 🌟 3 Tipe Kelas Buddy (Batu-Gunting-Kertas)

1. **Fighter (Prajurit Tempur)**
   * **Atribut:** HP 130 (paling tebal), pengali kerusakan senjata 1.25x.
   * **Peran:** Penyerang lini depan, spesialis senjata berat (Shotgun, Bazooka, Granat).
   * **Kelemahan:** Kecepatan bergerak berkurang 25% saat mengangkat peti.

2. **Healer (Dokter Tim / Pendukung)**
   * **Atribut:** HP 100, memancarkan aura regenerasi pasif (+25 HP/detik) untuk kawan dalam radius 4.5 meter.
   * **Peran:** Mendukung skuad, membangkitkan kawan yang pingsan (*knocked-down*).
   * **Kelemahan:** Kerusakan senjata berkurang 20%.

3. **Constructor (Pembangun / Logistik)**
   * **Atribut:** HP 90, kecepatan gerak tertinggi (8.2 m/s), hampir tanpa penalti beban peti (95% speed), lemparan peti terjauh (gaya lempar 18).
   * **Peran:** Mengumpulkan peti di tengah arena dengan cepat dan merakit pad markas.
   * **Kelemahan:** Daya tahan fisik paling rendah.

---

## 📦 Matriks Resep Peti (Stacking Pad 2x2x2)

Pad di markas memiliki 8 slot kubus (4 di Lantai 1, 4 di Lantai 2). Resep dievaluasi secara instan:

| Jumlah Peti | Formasi Penataan | Hasil Rakitan | Kategori | Daya / Efek |
| :--- | :--- | :--- | :--- | :--- |
| **1 Peti** | Slot bebas mana saja (1x1x1) | **Pistol Standard** | Senjata Ringan | 90 DPS, peluru tak terbatas |
| **2 Peti** | **Vertikal Bertumpuk (1x1x2)** | **Granat Nanas (x5)** | Senjata Lempar | 320 Ledakan Area, pantulan fisika 3 detik |
| **2 Peti** | **Horizontal Sebaris (2x1x1)** | **Shotgun Penghancur** | Senjata Menengah | 220 DPS, sebaran 5 butir peluru |
| **3 Peti** | **2 di Bawah + 1 di Atas** | **Medic Buddy** | Spawn Unit | Dokter AI pembawa medkit (+40 HP/s) |
| **4 Peti** | **2x2x1 Penuh di Lantai Bawah** | **Rocket Bazooka** | Senjata Berat | 450 DPS, proyektil ledakan area masif |
| **4 Peti** | **2x1x2 Dinding Vertikal** | **Commando Buddy** | Spawn Unit | Prajurit tempur AI bersenjata senapan mesin |
| **8 Peti** | **2x2x2 Kubus Penuh (Semua Slot)** | **Heavy Battle Tank** | Kendaraan Berat | 980 DPS, meriam ganda pelindung baja |

---

## ⚡ Arsitektur & Optimasi Web Browser

* **Zero 3D Model Download:** Seluruh model karakter Chibi Buddy, helm, senjata, dan kendaraan dibuat secara prosedural lewat kode Three.js.
* **Zero Audio Files:** 100% efek suara (tembakan, ledakan, pop angkat peti, bunyi lentur, dan aura medic) disintesis secara real-time via Web Audio API.
* **Fisika Voxel & Balistik O(1):** Deteksi tabrakan AABB diskrit tanpa library eksternal (Bullet/Ammo/Rapier) yang membebani memori.
* **Multiplayer P2P Berbasis WebRTC:** Arsitektur Host-Authoritative Star Topology via PeerJS dengan kompresi data posisi terkuantisasi (Q1 & Q2).
* **Mobile-First Responsive Layout:** Dilengkapi virtual joystick analog untuk jempol kiri dan tombol aksi sentuh 68px untuk jempol kanan.

---

## 🧪 Skenario Pengujian (Test Suite)

Dijalankan secara otomatis menggunakan **Vitest** (37 skenario lulus uji 100%):

### 1. Skenario Alur Normal (Normal Flow)
* Evaluasi seluruh 7 kombinasi resep peti (1, 2 vertikal, 2 horizontal, 3 medic, 4 datar, 4 dinding, 8 kubus tank).
* Penerapan atribut unik kelas (Fighter HP 130, Constructor speed 8.2, Healer aura radius 4.5m).
* Mekanisme revive yang membangkitkan kawan pingsan dengan 40% HP.
* Balistik granat dengan pantulan gravitasi dan ledakan timer 3 detik.
* Serialisasi dan deserialisasi paket jaringan dengan kuantisasi hemat bandwidth.

### 2. Skenario Alur Abnormal (Abnormal & Edge-Case Flow)
* **Pelanggaran Peti Melayang:** Penolakan penempatan peti di lantai 2 jika slot tepat di bawahnya kosong.
* **Kaskade Gravitasi:** Jika peti di lantai bawah diambil, peti di atasnya otomatis gugur / ikut terhapus.
* **Indeks Tidak Valid:** Pemeriksaan batas array peti (< 0 atau >= 8) melempar error deskriptif yang aman.
* **Input Kerusakan Negatif:** Menolak masukan kerusakan atau penyembuhan bernilai negatif.
* **Cegah Overhealing:** Darah tidak bisa melebihi batas maksimum HP.
* **Jatuh ke Void:** Objek atau karakter yang terlempar keluar batas arena (-5m) terdeteksi untuk di-respawn.
* **Paket Jaringan Rusak / Usang:** Penolakan paket JSON korup atau paket urutan lama (*stale sequence*) tanpa merusak loop game.
* **Diskoneksi Pemain Tiba-tiba:** Konversi otomatis pemain yang terputus menjadi Bot AI aktif agar pertandingan tetap seimbang.

---

## 🚀 Menjalankan Permainan

```bash
# Pasang dependensi
npm install

# Jalankan server pengembang lokal
npm run dev

# Jalankan pengujian skenario
npm test

# Build versi produksi
npm run build
```

---

## ⚖️ Lisensi & Hak Cipta
* Dibuat sebagai *spiritual successor* orisinal.
* Seluruh kode, aset 3D prosedural, dan audio dibuat mandiri tanpa menggunakan aset berhak cipta.
* Lisensi: MIT.