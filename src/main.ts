import { TinyBrawlersGame } from './game';
import { BuddyClass } from './types';
import { SoundFx } from './engine/audio';

// Initialize Game
const gameContainer = document.getElementById('gameCanvas') as HTMLElement;
let activeClass: BuddyClass = 'fighter';
const game = new TinyBrawlersGame(gameContainer, activeClass);
game.start();

// Class Selection Buttons
const classButtons = document.querySelectorAll('.class-btn');
classButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    classButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const selected = btn.getAttribute('data-class') as BuddyClass;
    if (selected) {
      activeClass = selected;
      game.player.classType = selected;
      const stats = (btn as HTMLElement).dataset.info || '';
      const infoEl = document.getElementById('classInfoText');
      if (infoEl) infoEl.textContent = stats;
    }
  });
});

// Trigger Stacking Pad Build button
const btnBuildPad = document.getElementById('btnBuildPad');
if (btnBuildPad) {
  btnBuildPad.addEventListener('click', () => {
    game.triggerPadBuild(game.player.team);
  });
}

// Sound Toggle
const btnAudioToggle = document.getElementById('btnAudioToggle');
if (btnAudioToggle) {
  btnAudioToggle.addEventListener('click', () => {
    SoundFx.enabled = !SoundFx.enabled;
    btnAudioToggle.textContent = SoundFx.enabled ? 'Suara: Aktif' : 'Suara: Senyap';
    btnAudioToggle.classList.toggle('muted', !SoundFx.enabled);
  });
}

// Touch Action Buttons for Mobile
const btnTouchAction = document.getElementById('btnTouchAction');
if (btnTouchAction) {
  btnTouchAction.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    game.handlePlayerInteract();
  });
}

const btnTouchAttack = document.getElementById('btnTouchAttack');
if (btnTouchAttack) {
  btnTouchAttack.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    game.handlePlayerAttack();
  });
}

// Virtual Joystick for Mobile (Left thumb drag)
const joystickArea = document.getElementById('joystickArea');
const joystickKnob = document.getElementById('joystickKnob');
let isTouchingJoystick = false;
let joyOrigin = { x: 0, y: 0 };

if (joystickArea && joystickKnob) {
  joystickArea.addEventListener('pointerdown', (e) => {
    isTouchingJoystick = true;
    joyOrigin = { x: e.clientX, y: e.clientY };
    joystickArea.setPointerCapture(e.pointerId);
  });

  window.addEventListener('pointermove', (e) => {
    if (!isTouchingJoystick) return;
    const dx = e.clientX - joyOrigin.x;
    const dy = e.clientY - joyOrigin.y;
    const dist = Math.hypot(dx, dy);
    const maxR = 40;
    const clampedR = Math.min(dist, maxR);
    const angle = Math.atan2(dy, dx);

    const kx = Math.cos(angle) * clampedR;
    const ky = Math.sin(angle) * clampedR;
    joystickKnob.style.transform = `translate(${kx}px, ${ky}px)`;

    game.joystickVector = {
      x: kx / maxR,
      y: ky / maxR
    };
  });

  const stopJoy = () => {
    isTouchingJoystick = false;
    joystickKnob.style.transform = 'translate(0px, 0px)';
    game.joystickVector = { x: 0, y: 0 };
  };

  window.addEventListener('pointerup', stopJoy);
  window.addEventListener('pointercancel', stopJoy);
}

// Update HUD loop
function updateHUD() {
  requestAnimationFrame(updateHUD);

  // Player HP bar
  const hpPercent = Math.max(0, Math.min(100, (game.player.hp / game.player.maxHp) * 100));
  const hpBar = document.getElementById('playerHpBar');
  if (hpBar) hpBar.style.width = `${hpPercent}%`;

  const hpText = document.getElementById('playerHpText');
  if (hpText) hpText.textContent = `${Math.ceil(game.player.hp)} / ${game.player.maxHp} HP`;

  // Weapon status
  const wpnText = document.getElementById('playerWeaponText');
  if (wpnText) {
    if (game.player.isCarryingCrate) {
      wpnText.textContent = 'Membawa: Peti Kayu';
    } else {
      wpnText.textContent = `Senjata: ${game.player.weapon.toUpperCase()}`;
    }
  }

  // Base Pad Recipe Status
  const redPad = game.pads['red'];
  const recipe = redPad.evaluate();
  const padStatusText = document.getElementById('padRecipeText');
  if (padStatusText) {
    padStatusText.textContent = `Pad: ${recipe.title} (${redPad.totalCrates}/8 Peti)`;
  }
}
updateHUD();
