# Tiny Brawlers Test Infrastructure & E2E Testing Methodology

## 1. Overview & Dual Track Philosophy
The Tiny Brawlers test suite implements an opaque-box, requirements-driven testing architecture designed to guarantee behavioral stability, mathematical correctness, and deterministic gameplay across all game systems.

Tests are structured according to the **4-Tier Testing Methodology**:
- **Tier 1: Feature Coverage**: Granular unit & subsystem requirements verification covering core mechanics (>=5 tests per area).
- **Tier 2: Boundary & Corner Cases**: Extreme values, zero/negative clamping, out-of-bounds guards, and structural constraints.
- **Tier 3: Cross-Feature Combinations**: Realistic interactions between multiple disparate systems (e.g., classes + pad crafting + combat physics + aura healing).
- **Tier 4: Real-World Scenarios**: Full match lifecycles simulating early game resource gathering, mid-game siege, and endgame team elimination.

---

## 2. Test Suite Architecture

```
tests/
├── classes.test.ts    # Unit tests for Fighter, Healer, Constructor stats, aura, and revive (11 tests)
├── recipes.test.ts    # Unit tests for 2x2x2 pad recipe engine, gravity, and slot bounds (12 tests)
├── physics.test.ts    # Unit tests for ballistics, projectile flight, area falloff, and bounds (8 tests)
├── abnormal.test.ts   # Unit tests for network serialization, packet corruption, and peer drop (6 tests)
└── e2e.test.ts        # Comprehensive Dual Track E2E suite covering Tiers 1-4 (51 tests)
```

**Total Active Test Count**: 88 passing tests across 5 test suites.

---

## 3. Feature Coverage Matrix (Tier 1 Checklist)

| Feature Area | Required Min | Implemented | Key Tests in `e2e.test.ts` |
|---|---|---|---|
| **Classes & Stats** | 5 | 6 | Fighter 130 HP/1.25x dmg, Healer 100 HP/4.5m aura/25 HP/s, Constructor 90 HP/8.2 m/s / 95% carry retention, cross-class speed comparison, knockout drop, 40% revive calculation |
| **Pad Recipes** | 5 | 6 | 1 Crate (Pistol), 2 Crates Stack (Grenade 320 DPS), 2 Crates Line (Shotgun 220 DPS), 3 Crates (Medic Buddy), 4 Crates Flat (Bazooka 450 DPS), 4 Crates Wall (Commando) & 8 Crates (Tank 980 DPS) |
| **Combat & Damage** | 5 | 5 | Direct hit damage, blast area damage with linear falloff, fatal damage zero-clamping, multi-target healer aura, grenade fuse timer and detonation |
| **Physics & Ballistics** | 5 | 5 | 64x64 arena bounds check, void fall detection (-5m / 38m threshold), 3D AABB overlap/separation, grenade trajectory/ground bounce/friction, crate free-fall/mounting/throwing/snapping |
| **Network & P2P Protocol** | 5 | 5 | Precision quantization (q1/q2), snapshot serialization & lossless deserialization, stale/out-of-order packet rejection, schema/corrupt record rejection, peer disconnect to AI bot conversion |
| **Bot AI State Machine** | 5 | 6 | State transition to RETURN_BASE on carry, state transition to ATTACK_ENEMY on weapon, SEEK_CRATE targeting & interact <=1.4m, RETURN_BASE delivery <=1.8m, ATTACK_ENEMY combat <=8.0m, knocked inactivity |
| **Bunker Health & Win Cond** | 5 | 5 | 1000 HP base bunker initialization, bunker damage/destruction <=0 HP, respawn allowance while bunker intact, team elimination (bunker destroyed + buddies wiped), last standing victory |

---

## 4. Boundary & Corner Cases (Tier 2 Checklist)

- **2.1 Empty inputs**: Empty pad (0 crates) returns `category: 'empty'`, `itemType: 'none'`, 0 DPS.
- **2.2 Zero and negative values**: Rejection of negative damage (`takeDamage(-100)` -> 0) and negative healing (`receiveHeal(-50)` -> 0). Zero/negative blast radius and zero/negative base damage return 0 without division by zero.
- **2.3 Out-of-bounds guards**: Pad slot indices `< 0` or `>= 8` explicitly throw `Error("Invalid slot index")`.
- **2.4 Maximum stack limit**: Exactly 8 crates evaluate to Heavy Battle Tank without array overflow.
- **2.5 Fatal damage clamping**: Extreme damage (e.g., 1,000,000) clamps HP to exactly 0 without negative underflow.
- **2.6 Knockdown state locking**: Knocked down buddies cannot receive direct healing without revive, and report 0 effective speed.

---

## 5. Cross-Feature Combinations (Tier 3 Checklist)

- **3.1 Healer under fire with crate**: Healer retains 85% carry speed (6.12 m/s), heals allies with aura while carrying, and drops crate immediately upon knockout.
- **3.2 Constructor crafting grenade**: Crafts 2-crate vertical stack, equips grenade, and launches projectile with 18.0 throw force covering extended distance across the arena.
- **3.3 Fighter in Heavy Battle Tank**: 8 crates constructed into tank vehicle, multiplied by Fighter's 1.25x damage boost to generate 1225 effective DPS, destroying 1000 HP base bunker.
- **3.4 Multi-team crossfire & rescue**: Red Fighter and Blue Constructor caught in grenade blast radius; Constructor knocked down while Fighter survives; Blue Healer rushes in and executes full revive.

---

## 6. Real-World Match Lifecycles (Tier 4 Checklist)

- **4.1 Opening Phase**: Central crate drops from sky -> Bot detects free crate -> moves to center -> interacts to carry -> navigates back to base pad -> places crate on pad -> pad evaluates recipe.
- **4.2 Mid-Game Siege**: Allied team stacks 4 crates as a wall -> constructs Commando Buddy -> moves to enemy base -> bombards enemy bunker with sustained weapon fire until destroyed.
- **4.3 Endgame Elimination**: Multilateral combat results in 3 bunkers destroyed -> last enemy squad members eliminated -> last team standing with active bunker declared winner.

---

## 7. Execution Commands

### Running the Test Suite
```bash
# Run all test files with Vitest
npm test

# Run Vitest in watch mode for development
npm run test:watch

# Run only E2E tests
npx vitest run tests/e2e.test.ts

# Run with coverage report
npx vitest run --coverage
```

### Build & Type Verification
```bash
# Verify TypeScript strict type-checking and production Vite bundle
npm run build
```
