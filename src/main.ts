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

// Sound Toggle & BGM Control
const btnAudioToggle = document.getElementById('btnAudioToggle');
if (btnAudioToggle) {
  btnAudioToggle.addEventListener('click', () => {
    const isEnabled = SoundFx.toggleMute();
    btnAudioToggle.textContent = isEnabled ? 'Suara: Aktif' : 'Suara: Senyap';
    btnAudioToggle.classList.toggle('muted', !isEnabled);
  });
}

// Camera Zoom Buttons (+ / -)
const btnZoomIn = document.getElementById('btnZoomIn');
if (btnZoomIn) {
  btnZoomIn.addEventListener('click', () => {
    game.handleWheel(-150);
  });
}

const btnZoomOut = document.getElementById('btnZoomOut');
if (btnZoomOut) {
  btnZoomOut.addEventListener('click', () => {
    game.handleWheel(150);
  });
}

// Match End Restart Button
const btnRestartMatch = document.getElementById('btnRestartMatch');
if (btnRestartMatch) {
  btnRestartMatch.addEventListener('click', () => {
    window.location.reload();
  });
}

// Camera Zoom Controls (Mouse Wheel & Mobile Pinch)
window.addEventListener('wheel', (e) => {
  game.handleWheel(e.deltaY);
}, { passive: true });

let initialPinchDistance: number | null = null;
window.addEventListener('touchstart', (e) => {
  if (e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    initialPinchDistance = Math.hypot(dx, dy);
  }
}, { passive: true });

window.addEventListener('touchmove', (e) => {
  if (e.touches.length === 2 && initialPinchDistance !== null && initialPinchDistance > 0) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const currentDistance = Math.hypot(dx, dy);
    const ratio = currentDistance / initialPinchDistance;
    game.handlePinch(ratio);
    initialPinchDistance = currentDistance;
  }
}, { passive: true });

const endPinch = (e: TouchEvent) => {
  if (e.touches.length < 2) {
    initialPinchDistance = null;
  }
};
window.addEventListener('touchend', endPinch, { passive: true });
window.addEventListener('touchcancel', endPinch, { passive: true });

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

  // Bunker Scoreboard updates
  const teams = ['red', 'blue', 'yellow', 'cyan'] as const;
  for (const t of teams) {
    const hp = Math.max(0, Math.ceil(game.baseHp[t] || 0));
    const titleCase = t.charAt(0).toUpperCase() + t.slice(1);
    const textEl = document.getElementById(`bunkerHp${titleCase}Text`);
    const barEl = document.getElementById(`bunkerHp${titleCase}Bar`);
    if (textEl) textEl.textContent = `${hp}`;
    if (barEl) barEl.style.width = `${(hp / 1000) * 100}%`;
  }

  // Base Pad Recipe & 2x2x2 Visualizer
  const redPad = game.pads['red'];
  if (redPad) {
    const recipe = redPad.evaluate();
    const padStatusText = document.getElementById('padRecipeText');
    if (padStatusText) {
      padStatusText.textContent = `Pad: ${recipe.title} (${redPad.totalCrates}/8 Peti)`;
    }

    const padRecipeBadge = document.getElementById('padRecipeBadge');
    if (padRecipeBadge) {
      padRecipeBadge.textContent = recipe.category.toUpperCase();
    }

    const padRecipeDesc = document.getElementById('padRecipeDesc');
    if (padRecipeDesc) {
      padRecipeDesc.textContent = recipe.description;
    }

    const padDpsText = document.getElementById('padDpsText');
    if (padDpsText) {
      padDpsText.textContent = `DPS: ${recipe.dps}`;
    }

    // Light up 2x2x2 visualizer slots
    for (let i = 0; i < 8; i++) {
      const slotEl = document.getElementById(`padSlot${i}`);
      if (slotEl) {
        if (redPad.slots[i]) {
          slotEl.classList.add('filled');
        } else {
          slotEl.classList.remove('filled');
        }
      }
    }
  }

  // Match Over Modal Trigger
  if (game.isGameOver) {
    const modal = document.getElementById('matchEndModal');
    const title = document.getElementById('matchEndTitle');
    const desc = document.getElementById('matchEndDesc');
    if (modal && !modal.classList.contains('active')) {
      modal.classList.add('active');
      const isPlayerWin = game.winningTeam === game.player.team;
      if (title) {
        title.textContent = isPlayerWin ? 'VICTORY!' : 'DEFEAT!';
        title.className = `match-end-title ${isPlayerWin ? 'victory' : 'defeat'}`;
      }
      if (desc) {
        desc.textContent = isPlayerWin
          ? 'Tim Merah berhasil menghancurkan seluruh base musuh dan menjadi penguasa pulau arena!'
          : `Base Tim Merah hancur. Pemenang arena: Tim ${game.winningTeam?.toUpperCase() || 'Lain'}.`;
      }
    }
  }
}
updateHUD();
