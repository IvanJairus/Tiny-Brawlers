import { T } from '../i18n/id';
import type { BuddyClass } from '../../sim/domain/classes';
import { TEAM_COLORS } from '../../sim/domain/teams';
import type { ViewState } from '../../sim/core/view';
import type { Screen } from './machine';
import type { LobbyActions } from './lobby';
import type { BiomeKind } from '../../sim/domain/obstacles';

export interface ScreenContext {
  send: (event: Parameters<import('./machine').Machine['send']>[0]) => void;
  startWith: (cls: BuddyClass, biome?: BiomeKind) => void;
  netplay: boolean;
  canPause(): boolean;
  lobby: LobbyActions;
  settings: { sound: boolean; music: boolean; quality: 'high' | 'low'; reducedMotion: boolean; biome?: BiomeKind };
  setSetting: (key: 'sound' | 'music' | 'quality' | 'reducedMotion' | 'biome', value: boolean | string) => void;
}

export interface MountedScreen {
  update?(view: ViewState): void;
  dispose(): void;
}

function shell(className: string, heading: string | null, body: string): HTMLElement {
  const root = document.createElement('div');
  root.className = `screen ${className}`;
  if (heading) {
    const title = document.createElement('h1');
    title.className = 'screen-title';
    title.textContent = heading;
    root.appendChild(title);
  }
  if (body) {
    const text = document.createElement('p');
    text.className = 'screen-body';
    text.textContent = body;
    root.appendChild(text);
  }
  return root;
}

function button(label: string, kind: string, onClick: () => void, autofocus = false): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `btn btn-${kind}`;
  el.textContent = label;
  el.addEventListener('click', onClick);
  if (autofocus) el.dataset.autofocus = '1';
  return el;
}

export function openTutorialModal(host: HTMLElement): HTMLElement {
  const existing = document.querySelector('.tutorial-overlay');
  if (existing) {
    existing.remove();
    return existing as HTMLElement;
  }

  const overlay = document.createElement('div');
  overlay.className = 'tutorial-overlay';

  const modal = document.createElement('div');
  modal.className = 'tutorial-page card';

  const header = document.createElement('header');
  header.className = 'tutorial-header';
  header.innerHTML = `
    <div class="tutorial-header-titles">
      <h2 class="tutorial-title">${T.tutorialTitle}</h2>
      <p class="tutorial-subtitle">Shortcut kontrol, panduan taktik tempur, dan resep lengkap Stacking Pad!</p>
    </div>
    <button type="button" class="btn btn-close-tutorial" tabindex="-1">${T.closeTutorial}</button>
  `;

  const tabsNav = document.createElement('nav');
  tabsNav.className = 'tutorial-tabs';
  tabsNav.setAttribute('role', 'tablist');
  tabsNav.innerHTML = `
    <button type="button" class="btn tutorial-tab is-active" data-tab="controls" tabindex="-1">${T.tabControls}</button>
    <button type="button" class="btn tutorial-tab" data-tab="recipes" tabindex="-1">${T.tabRecipes}</button>
    <button type="button" class="btn tutorial-tab" data-tab="arena" tabindex="-1">${T.tabArena}</button>
  `;

  const content = document.createElement('div');
  content.className = 'tutorial-content';

  // Panel 1: Controls
  const panelControls = document.createElement('section');
  panelControls.className = 'tutorial-panel panel-controls is-active';
  panelControls.innerHTML = `
    <div class="controls-grid">
      <article class="control-card">
        <div class="control-head">
          <span class="control-badge">Aksi 1</span>
          <h3>Jalan & Arahkan</h3>
        </div>
        <div class="control-preview">
          <img src="assets/karakter/bola_luncur_jalan.svg" class="tut-action-img" alt="Jalan" />
        </div>
        <div class="control-keys">
          <div class="key-row"><span class="key-tag">Desktop</span> <code>WASD</code> atau <code>Tombol Panah</code></div>
          <div class="key-row"><span class="key-tag">Mobile</span> <code>Stik Virtual Kiri</code></div>
        </div>
        <p class="control-desc">Gerakkan karakter ke segala arah di arena. Di desktop, arah hadap mengikuti <b>kursor mouse</b> — jadi kamu bisa mundur sambil menembak ke depan. Hindari proyektil lawan, ambil posisi strategis di balik tembok, dan serbu markas musuh!</p>
      </article>

      <article class="control-card">
        <div class="control-head">
          <span class="control-badge">Aksi 2</span>
          <h3>Pukul & Tembak</h3>
        </div>
        <div class="control-preview">
          <img src="assets/ui/tombol_merah_normal.svg" class="tut-btn-img" alt="Tombol Merah" />
        </div>
        <div class="control-keys">
          <div class="key-row"><span class="key-tag">Desktop</span> <code>Klik Kiri</code>, <code>F</code>, atau <code>Spasi</code></div>
          <div class="key-row"><span class="key-tag">Mobile</span> Tombol Merah <code>Tembak / Pukul</code></div>
        </div>
        <p class="control-desc">Saat tangan kosong, karakter akan <b>memukul lawan (22 DMG + dorongan)</b>. Jika lawan membawa peti, pukulanmu akan <b>menjatuhkan peti lawan</b> agar bisa direbut! Saat memegang senjata, tombol ini menembak atau melempar granat.</p>
      </article>

      <article class="control-card">
        <div class="control-head">
          <span class="control-badge">Aksi 3</span>
          <h3>Ambil, Taruh & Tank</h3>
        </div>
        <div class="control-preview">
          <img src="assets/karakter_crate/tupai_gudang/tupai_gudang_merah_bawa_bawah_1.svg" class="tut-action-img" alt="Bawa Peti" />
          <img src="assets/ui/tombol_biru_normal.svg" class="tut-btn-img" alt="Tombol Biru" />
        </div>
        <div class="control-keys">
          <div class="key-row"><span class="key-tag">Desktop</span> <code>Klik Kanan</code> atau <code>E</code></div>
          <div class="key-row"><span class="key-tag">Mobile</span> Tombol Biru <code>Ambil / Taruh</code></div>
        </div>
        <p class="control-desc">Tekan di dekat peti untuk mengangkatnya. Bawa ke <b>Stacking Pad</b> markasmu lalu tekan lagi untuk <b>menaruh peti ke slot pad</b>. Jika ditekan di luar pad, peti akan <b>dilempar ke depan (25 DMG ke lawan)</b>. Tekan di dekat Tank timmu untuk mengemudikannya!</p>
      </article>

      <article class="control-card">
        <div class="control-head">
          <span class="control-badge">Aksi 4</span>
          <h3>Rakit Resep (Pop Pad!)</h3>
        </div>
        <div class="control-preview">
          <img src="assets/ui/tombol_kuning_normal.svg" class="tut-btn-img" alt="Tombol Kuning" />
        </div>
        <div class="control-keys">
          <div class="key-row"><span class="key-tag">Desktop</span> <code>R</code> atau <code>Q</code> (atau pukul tumpukan di pad)</div>
          <div class="key-row"><span class="key-tag">Mobile</span> Tombol Kuning <code>Rakit</code></div>
        </div>
        <p class="control-desc">Setelah peti tersusun di <b>Stacking Pad</b> (1 s/d 8 peti), tekan <code>R</code> atau pukul langsung tumpukan peti untuk memecahkannya menjadi <b>Senjata, Kotak Medis, Buddy Baru, atau Tank Tempur</b>!</p>
      </article>
    </div>
  `;

  // Panel 2: Recipes
  const panelRecipes = document.createElement('section');
  panelRecipes.className = 'tutorial-panel panel-recipes';
  panelRecipes.innerHTML = `
    <div class="recipes-grid">
      <article class="recipe-card">
        <div class="recipe-num">1</div>
        <div class="recipe-images">
          <img src="assets/tumpukan/tumpukan_resep_pistol.svg" class="recipe-stack-img" alt="Pistol Pad" />
          <span class="recipe-arrow">-></span>
          <img src="assets/senjata/pistol.svg" class="recipe-icon-img" alt="Pistol" />
        </div>
        <h4 class="recipe-title">1. Pistol Standard</h4>
        <span class="recipe-req">1 Peti (Slot 1x1 Bawah)</span>
        <p class="recipe-detail">16 DMG per peluru, tembakan cepat jarak menengah, amunisi tak terbatas.</p>
      </article>

      <article class="recipe-card">
        <div class="recipe-num">2</div>
        <div class="recipe-images">
          <img src="assets/tumpukan/tumpukan_1x2_senjata.svg" class="recipe-stack-img" alt="Shotgun Pad" />
          <span class="recipe-arrow">-></span>
          <img src="assets/senjata/senapan_mesin.svg" class="recipe-icon-img" alt="Shotgun" />
        </div>
        <h4 class="recipe-title">2. Shotgun Penghancur</h4>
        <span class="recipe-req">2 Peti Sejajar (2 Slot Bawah)</span>
        <p class="recipe-detail">Menembakkan 5 peluru menyebar sekaligus (45 DMG total jarak dekat).</p>
      </article>

      <article class="recipe-card">
        <div class="recipe-num">3</div>
        <div class="recipe-images">
          <img src="assets/tumpukan/tumpukan_resep_granat.svg" class="recipe-stack-img" alt="Granat Pad" />
          <span class="recipe-arrow">-></span>
          <img src="assets/senjata/granat.svg" class="recipe-icon-img" alt="Granat" />
        </div>
        <h4 class="recipe-title">3. Granat Lempar x3</h4>
        <span class="recipe-req">2 Peti Bertumpuk (1 Bawah + 1 Atas)</span>
        <p class="recipe-detail">3 bom lambung (55 DMG area), sangat efektif menghancurkan tembok bata & markas.</p>
      </article>

      <article class="recipe-card">
        <div class="recipe-num">4</div>
        <div class="recipe-images">
          <img src="assets/tumpukan/tumpukan_resep_buddy_baru_merah.svg" class="recipe-stack-img" alt="Buddy Pad" />
          <span class="recipe-arrow">-></span>
          <img src="assets/karakter/biskuit_karamel_depan.svg" class="recipe-icon-img" alt="Buddy" />
        </div>
        <h4 class="recipe-title">4. Buddy Baru / Medic</h4>
        <span class="recipe-req">3 Peti Tumpuk L (2 Bawah + 1 Atas)</span>
        <p class="recipe-detail">Menambah 1 anggota tim baru dengan aura penyembuh otomatis di sekitarnya.</p>
      </article>

      <article class="recipe-card">
        <div class="recipe-num">5</div>
        <div class="recipe-images">
          <img src="assets/tumpukan/tumpukan_resep_kotak_medis.svg" class="recipe-stack-img" alt="Medkit Pad" />
          <span class="recipe-arrow">-></span>
          <img src="assets/senjata/kotak_medis.svg" class="recipe-icon-img" alt="Kotak Medis" />
        </div>
        <h4 class="recipe-title">5. Kotak Medis x3</h4>
        <span class="recipe-req">3 Peti Lapis Bawah (3 Slot Bawah)</span>
        <p class="recipe-detail">Memulihkan +50 HP rekan tim atau membangkitkan rekan KO kembali ke 100% HP.</p>
      </article>

      <article class="recipe-card">
        <div class="recipe-num">6</div>
        <div class="recipe-images">
          <img src="assets/tumpukan/tumpukan_resep_bazoka.svg" class="recipe-stack-img" alt="Bazoka Pad" />
          <span class="recipe-arrow">-></span>
          <img src="assets/senjata/bazoka.svg" class="recipe-icon-img" alt="Bazoka" />
        </div>
        <h4 class="recipe-title">6. Bazoka x4 Roket</h4>
        <span class="recipe-req">4 Peti Datar (2x2 Lapis Bawah)</span>
        <p class="recipe-detail">4 roket berat (70 DMG ledakan besar), penghancur utama markas lawan & Tank.</p>
      </article>

      <article class="recipe-card">
        <div class="recipe-num">7</div>
        <div class="recipe-images">
          <img src="assets/tumpukan/tumpukan_resep_sniper.svg" class="recipe-stack-img" alt="Sniper Pad" />
          <span class="recipe-arrow">-></span>
          <img src="assets/senjata/sniper.svg" class="recipe-icon-img" alt="Sniper" />
        </div>
        <h4 class="recipe-title">7. Unit Komando / Sniper</h4>
        <span class="recipe-req">4 Peti Tegak (2 Bawah + 2 Atas)</span>
        <p class="recipe-detail">Merekrut petarung elit (Kacang Radar) yang langsung dipersenjatai roket jarak jauh.</p>
      </article>

      <article class="recipe-card">
        <div class="recipe-num">8</div>
        <div class="recipe-images">
          <img src="assets/tumpukan/tumpukan_resep_tank.svg" class="recipe-stack-img" alt="Tank Pad" />
          <span class="recipe-arrow">-></span>
          <img src="assets/kendaraan/tank_merah_samping.svg" class="recipe-icon-img" alt="Tank" />
        </div>
        <h4 class="recipe-title">8. Tank Lapis Baja</h4>
        <span class="recipe-req">8 Peti Penuh (2x2x2 Dua Lapis)</span>
        <p class="recipe-detail">Kendaraan tempur baja (400 HP, meriam 85 DMG). Dekati Tank & tekan E untuk naik!</p>
      </article>
    </div>
  `;

  // Panel 3: Arena & Power-Ups
  const panelArena = document.createElement('section');
  panelArena.className = 'tutorial-panel panel-arena';
  panelArena.innerHTML = `
    <div class="arena-grid">
      <article class="arena-card">
        <img src="assets/png/tembok_keras.png" class="arena-item-img" alt="Tembok Baja" />
        <div class="arena-info">
          <h4>Tembok Baja Permanen</h4>
          <span class="arena-pill pill-perm">Permanen</span>
          <p>Tembok keras yang tidak dapat ditembus atau dihancurkan. Gunakan sebagai tameng berlindung dari proyektil meriam lawan.</p>
        </div>
      </article>

      <article class="arena-card">
        <img src="assets/png/bata_lunak.png" class="arena-item-img" alt="Bata Lunak" />
        <div class="arena-info">
          <h4>Bata Lunak 3-Tahap</h4>
          <span class="arena-pill pill-destr">Dapat Hancur</span>
          <p>Dapat dihancurkan dengan pukulan atau tembakan senjata. Memiliki peluang besar menjatuhkan peti kayu atau Power-Up langka!</p>
        </div>
      </article>

      <article class="arena-card">
        <img src="assets/png/up_api.png" class="arena-item-img" alt="Power Up Api" />
        <div class="arena-info">
          <h4>Api Tempur (+35% Damage)</h4>
          <span class="arena-pill pill-buff">Buff Serangan</span>
          <p>Meningkatkan daya rusak semua serangan pukulan dan tembakan sebesar 35% untuk menjebol pertahanan lawan.</p>
        </div>
      </article>

      <article class="arena-card">
        <img src="assets/png/up_lari.png" class="arena-item-img" alt="Power Up Lari" />
        <div class="arena-info">
          <h4>Sepatu Kilat (+30% Lari)</h4>
          <span class="arena-pill pill-buff">Buff Kelincahan</span>
          <p>Menambah kecepatan gerak sebesar 30%, memungkinkan pengangkutan peti ke Stacking Pad secara kilat.</p>
        </div>
      </article>

      <article class="arena-card">
        <img src="assets/png/up_bom.png" class="arena-item-img" alt="Power Up Bom" />
        <div class="arena-info">
          <h4>Bom Dahsyat (+3 Granat & Area)</h4>
          <span class="arena-pill pill-buff">Buff Ledakan</span>
          <p>Memberi ekstra 3 granat lontar dan memperluas radius ledakan destruktif terhadap markas lawan.</p>
        </div>
      </article>

      <article class="arena-card">
        <img src="assets/png/up_perisai.png" class="arena-item-img" alt="Power Up Perisai" />
        <div class="arena-info">
          <h4>Perisai Baja (+60 HP Perisai)</h4>
          <span class="arena-pill pill-buff">Buff Bertahan</span>
          <p>Melapisi buddy dengan 60 HP perisai proteksi ekstra untuk menyerap serangan mendadak musuh.</p>
        </div>
      </article>

      <article class="arena-card">
        <img src="assets/png/up_hati.png" class="arena-item-img" alt="Power Up Hati" />
        <div class="arena-info">
          <h4>Hati Pemulih (+50 HP Instan)</h4>
          <span class="arena-pill pill-buff">Instan Heal</span>
          <p>Memulihkan 50 poin HP seketika saat disentuh agar unit petarung dapat terus bertahan di medan laga.</p>
        </div>
      </article>
    </div>
  `;

  content.append(panelControls, panelRecipes, panelArena);
  modal.append(header, tabsNav, content);
  overlay.appendChild(modal);

  const tabs = tabsNav.querySelectorAll<HTMLButtonElement>('.tutorial-tab');
  const panels = [panelControls, panelRecipes, panelArena];
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.toggle('is-active', t === tab));
      panels.forEach((p, pIndex) => p.classList.toggle('is-active', pIndex === index));
    });
  });

  const close = (): void => {
    overlay.remove();
  };

  header.querySelector('.btn-close-tutorial')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  host.appendChild(overlay);
  return overlay;
}

export function mountTitle(host: HTMLElement, ctx: ScreenContext): MountedScreen {
  const root = shell('screen-title-page', T.appTitle, T.tagline);

  const heroBanner = document.createElement('div');
  heroBanner.className = 'title-hero-banner';
  heroBanner.innerHTML = `
    <div class="mascot-row">
      <img src="assets/karakter/bola_luncur_depan.svg" class="hero-mascot" alt="Bola Luncur" />
      <img src="assets/karakter/tupai_gudang_depan.svg" class="hero-mascot" alt="Tupai Gudang" />
      <img src="assets/karakter/kacang_radar_depan.svg" class="hero-mascot" alt="Kacang Radar" />
      <img src="assets/karakter/biskuit_karamel_depan.svg" class="hero-mascot" alt="Biskuit Karamel" />
    </div>
    <div class="hero-subrow">
      <img src="assets/senjata/pistol.svg" class="hero-icon" alt="" />
      <img src="assets/senjata/granat.svg" class="hero-icon" alt="" />
      <img src="assets/kendaraan/tank_merah_samping.svg" class="hero-icon hero-tank" alt="" />
      <img src="assets/senjata/bazoka.svg" class="hero-icon" alt="" />
      <img src="assets/senjata/kotak_medis.svg" class="hero-icon" alt="" />
    </div>
  `;
  root.prepend(heroBanner);

  const actions = document.createElement('div');
  actions.className = 'screen-actions';
  actions.appendChild(button(T.play, 'primary', () => ctx.send('play'), true));
  const tutBtn = document.createElement('div');
  tutBtn.setAttribute('role', 'button');
  tutBtn.className = 'btn btn-tutorial';
  tutBtn.setAttribute('tabindex', '-1');
  tutBtn.textContent = T.tutorial;
  tutBtn.addEventListener('click', () => openTutorialModal(host));
  actions.appendChild(tutBtn);
  if (ctx.netplay) actions.appendChild(button(T.netTitle, 'ghost', () => ctx.send('netplay')));
  root.appendChild(actions);
  host.appendChild(root);
  return { dispose: () => root.remove() };
}

export function mountSelect(host: HTMLElement, ctx: ScreenContext): MountedScreen {
  const root = shell('screen-select', T.pickClass, '');
  const list = document.createElement('div');
  list.className = 'class-list';
  const classes: BuddyClass[] = ['fighter', 'healer', 'constructor'];
  const mascotMap: Record<BuddyClass, string> = {
    fighter: 'bola_luncur',
    healer: 'biskuit_karamel',
    constructor: 'tupai_gudang'
  };
  let chosen: BuddyClass = 'fighter';
  let chosenBiome: BiomeKind = ctx.settings.biome ?? 'rumput';

  const buttons = classes.map((cls, index) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'class-card';
    card.dataset.class = cls;
    card.innerHTML =
      `<img class="class-mascot" src="assets/karakter/${mascotMap[cls]}_depan.svg" alt="" /><div class="class-info"><span class="class-name"></span><span class="class-blurb"></span><span class="class-stats"></span></div>`;
    card.querySelector('.class-name')!.textContent = `${index + 1}. ${T.classNames[cls]}`;
    card.querySelector('.class-blurb')!.textContent = T.classBlurb[cls];
    card.querySelector('.class-stats')!.textContent = T.classStatsLine[cls];
    card.addEventListener('click', () => {
      chosen = cls;
      for (const other of buttons) other.classList.toggle('is-chosen', other === card);
    });
    if (index === 0) card.classList.add('is-chosen');
    list.appendChild(card);
    return card;
  });
  root.appendChild(list);

  const biomeBar = document.createElement('div');
  biomeBar.className = 'biome-bar';
  const biomes: BiomeKind[] = ['rumput', 'gurun', 'salju'];
  const biomeThumb: Record<BiomeKind, string> = {
    rumput: 'assets/peta-contoh-rumput.png',
    gurun: 'assets/png/gurun_3.png',
    salju: 'assets/peta-contoh-salju.png'
  };
  const biomeChips = biomes.map((b) => {
    const chip = document.createElement('div');
    chip.setAttribute('role', 'button');
    chip.className = 'biome-chip';
    chip.setAttribute('tabindex', '-1');
    if (b === chosenBiome) chip.classList.add('is-chosen');
    chip.innerHTML = `<img src="${biomeThumb[b]}" alt="" class="biome-thumb" /><span>${T.biomeNames[b]}</span>`;
    chip.addEventListener('click', () => {
      chosenBiome = b;
      for (const other of biomeChips) other.classList.toggle('is-chosen', other === chip);
    });
    biomeBar.appendChild(chip);
    return chip;
  });
  root.appendChild(biomeBar);

  const actions = document.createElement('div');
  actions.className = 'screen-actions';
  actions.appendChild(button(T.back, 'ghost', () => ctx.send('quit')));
  actions.appendChild(button(T.play, 'primary', () => ctx.startWith(chosen, chosenBiome), true));
  const tutBtn = document.createElement('div');
  tutBtn.setAttribute('role', 'button');
  tutBtn.className = 'btn btn-tutorial';
  tutBtn.setAttribute('tabindex', '-1');
  tutBtn.textContent = T.tutorial;
  tutBtn.addEventListener('click', () => openTutorialModal(host));
  actions.appendChild(tutBtn);
  if (ctx.netplay) actions.appendChild(button(T.netTitle, 'ghost', () => ctx.send('netplay')));
  root.appendChild(actions);
  host.appendChild(root);
  return { dispose: () => root.remove() };
}

export function mountPause(host: HTMLElement, ctx: ScreenContext): MountedScreen {
  const root = shell('screen-modal screen-pause', T.pause, '');
  const actions = document.createElement('div');
  actions.className = 'screen-actions';
  actions.appendChild(button(T.resume, 'primary', () => ctx.send('resume'), true));
  actions.appendChild(button(T.settings, 'ghost', () => settingsHost.replaceChildren(settingsPanel(ctx))));
  const tutBtn = document.createElement('div');
  tutBtn.setAttribute('role', 'button');
  tutBtn.className = 'btn btn-tutorial';
  tutBtn.setAttribute('tabindex', '-1');
  tutBtn.textContent = T.tutorial;
  tutBtn.addEventListener('click', () => openTutorialModal(host));
  actions.appendChild(tutBtn);
  actions.appendChild(button(T.quit, 'ghost', () => ctx.send('quit')));
  root.appendChild(actions);
  const settingsHost = document.createElement('div');
  settingsHost.className = 'settings-host';
  root.appendChild(settingsHost);
  host.appendChild(root);
  return { dispose: () => root.remove() };
}

/** Netplay has no pause, so leaving needs an explicit confirmation instead. */
export function mountConfirm(host: HTMLElement, ctx: ScreenContext): MountedScreen {
  const root = shell('screen-modal screen-confirming', T.leaveTitle, T.leaveBody);
  const actions = document.createElement('div');
  actions.className = 'screen-actions';
  actions.appendChild(button(T.leaveNo, 'primary', () => ctx.send('stay'), true));
  actions.appendChild(button(T.leaveYes, 'ghost', () => ctx.send('quit')));
  root.appendChild(actions);
  host.appendChild(root);
  return { dispose: () => root.remove() };
}

function settingsPanel(ctx: ScreenContext): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'settings-panel';

  const row = (label: string, value: string, onToggle: () => void): void => {
    const line = document.createElement('div');
    line.className = 'setting-row';
    const name = document.createElement('span');
    name.textContent = label;
    const btn = button(value, 'ghost', () => {
      onToggle();
      name.textContent = label;
    });
    btn.dataset.role = 'setting';
    line.append(name, btn);
    wrap.appendChild(line);
  };

  row(T.sound, ctx.settings.sound ? T.soundOn : T.soundOff, () => ctx.setSetting('sound', !ctx.settings.sound));
  row(T.music, ctx.settings.music ? T.on : T.off, () => ctx.setSetting('music', !ctx.settings.music));
  row(T.quality, ctx.settings.quality === 'high' ? T.qualityHigh : T.qualityLow,
    () => ctx.setSetting('quality', ctx.settings.quality === 'high' ? 'low' : 'high'));
  row(T.reducedMotion, ctx.settings.reducedMotion ? T.on : T.off,
    () => ctx.setSetting('reducedMotion', !ctx.settings.reducedMotion));
  return wrap;
}

export function mountResults(host: HTMLElement, ctx: ScreenContext, view: ViewState | null): MountedScreen {
  const won = view?.winner === view?.team;
  const root = shell('screen-modal screen-results', view?.winner === null ? T.draw : won ? T.victory : T.defeat, '');
  const ribbon = document.createElement('img');
  ribbon.className = 'results-ribbon';
  ribbon.src = `assets/ui/${won ? 'pita_menang' : 'pita_kalah'}.svg`;
  ribbon.alt = '';
  root.prepend(ribbon);
  const stats = document.createElement('dl');
  stats.className = 'stat-list';
  const add = (label: string, value: string): void => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    stats.append(dt, dd);
  };
  if (view) {
    add(T.statBuilt, String(view.stats.built));
    add(T.statKnockouts, String(view.stats.knockouts));
    add(T.statCrates, String(view.stats.cratesDelivered));
    add(T.statTime, `${view.stats.survived} ${T.secondsSuffix}`);
    const teams = Object.keys(view.bunkerHp) as Array<keyof typeof view.bunkerHp>;
    for (const team of teams) {
      add(`${T.teamLabel} ${TEAM_COLORS[team].label}`, view.eliminated[team] ? 'x' : `${Math.max(0, Math.round(view.bunkerHp[team]))}`);
    }
  }
  root.appendChild(stats);

  const actions = document.createElement('div');
  actions.className = 'screen-actions';
  actions.appendChild(button(T.restart, 'primary', () => ctx.send('again'), true));
  actions.appendChild(button(T.quit, 'ghost', () => ctx.send('quit')));
  root.appendChild(actions);
  host.appendChild(root);
  return { dispose: () => root.remove() };
}

export function mountNotice(host: HTMLElement, screen: Screen, title: string, body: string, hint: string, onOk: () => void): MountedScreen {
  const root = shell(`screen-modal screen-${screen}`, title, body);
  if (hint) {
    const small = document.createElement('p');
    small.className = 'screen-hint';
    small.textContent = hint;
    root.appendChild(small);
  }
  const actions = document.createElement('div');
  actions.className = 'screen-actions';
  actions.appendChild(button(T.back, 'primary', onOk, true));
  root.appendChild(actions);
  host.appendChild(root);
  return { dispose: () => root.remove() };
}

export function mountHowTo(host: HTMLElement, ctx: ScreenContext): MountedScreen {
  const root = shell('screen-howto', T.howTo, T.objectiveBody);
  const keys = document.createElement('p');
  keys.className = 'screen-body';
  keys.textContent = T.controlsDesktop;
  const touch = document.createElement('p');
  touch.className = 'screen-body';
  touch.textContent = T.controlsTouch;
  root.append(keys, touch);
  const actions = document.createElement('div');
  actions.className = 'screen-actions';
  actions.appendChild(button(T.back, 'primary', () => ctx.send('quit'), true));
  root.appendChild(actions);
  host.appendChild(root);
  return { dispose: () => root.remove() };
}
