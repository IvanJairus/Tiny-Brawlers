import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { createChibiBuddyRig, ChibiRigInstance, TEAM_COLORS } from '../src/rendering/buddyRig';
import {
  updateBuddyProceduralAnimation,
  getBuddyAnimTracker,
  resetAllAnimTrackers,
  calculateCarryPose
} from '../src/rendering/animations';
import { BuddyEntity } from '../src/entities/buddy';
import { CrateEntity } from '../src/entities/crate';
import { BuddyClass, TeamId, WeaponType } from '../src/types';

describe('Empirical Stress Test: 3D Visual Weapon Models & Sockets', () => {
  const teams: TeamId[] = ['red', 'blue', 'yellow', 'cyan'];
  const classes: BuddyClass[] = ['fighter', 'healer', 'constructor'];

  it('1.1 verifies all 5 weapon models physically exist in the Three.js scene graph', () => {
    const rig = createChibiBuddyRig('red', 'fighter');

    expect(rig.weapons.pistol).not.toBeNull();
    expect(rig.weapons.shotgun).not.toBeNull();
    expect(rig.weapons.grenade).not.toBeNull();
    expect(rig.weapons.medic).not.toBeNull();
    expect(rig.weapons.bazooka).not.toBeNull();
    expect(rig.weapons.none).toBeNull();
    expect(rig.carriedCrateProp).not.toBeNull();
  });

  it('1.2 verifies socket hierarchy and attachment points in the scene graph', () => {
    const rig = createChibiBuddyRig('blue', 'healer');

    const handSocket = rig.weaponSockets.hand;
    const shoulderSocket = rig.weaponSockets.shoulder;
    const headSocket = rig.weaponSockets.head;

    expect(handSocket).toBeDefined();
    expect(shoulderSocket).toBeDefined();
    expect(headSocket).toBeDefined();

    // Verify handSocket is attached to rightHandPivot
    expect(handSocket.parent).toBe(rig.rightHandPivot);
    expect(rig.rightHandPivot.parent).toBe(rig.bodyMesh);
    expect(rig.bodyMesh.parent).toBe(rig.root);

    // Verify shoulderSocket is attached to bodyMesh
    expect(shoulderSocket.parent).toBe(rig.bodyMesh);

    // Verify headSocket is attached to bodyMesh
    expect(headSocket.parent).toBe(rig.bodyMesh);

    // Verify weapon placements in sockets
    const pistol = rig.weapons.pistol!;
    const shotgun = rig.weapons.shotgun!;
    const grenade = rig.weapons.grenade!;
    const syringe = rig.weapons.medic!;
    const bazooka = rig.weapons.bazooka!;
    const crateProp = rig.carriedCrateProp;

    expect(pistol.parent).toBe(handSocket);
    expect(shotgun.parent).toBe(handSocket);
    expect(grenade.parent).toBe(handSocket);
    expect(syringe.parent).toBe(handSocket);
    expect(bazooka.parent).toBe(shoulderSocket);
    expect(crateProp.parent).toBe(headSocket);
  });

  it('1.3 verifies non-empty meshes and genuine Three.js geometry primitives for all 5 weapons and crate', () => {
    const rig = createChibiBuddyRig('yellow', 'constructor');

    // 1. Pistol
    const pistol = rig.weapons.pistol!;
    const pistolMeshes = pistol.children.filter((c) => c instanceof THREE.Mesh) as THREE.Mesh[];
    expect(pistolMeshes.length).toBeGreaterThanOrEqual(3);
    const pistolGeoTypes = pistolMeshes.map((m) => m.geometry.type);
    expect(pistolGeoTypes).toContain('BoxGeometry');
    expect(pistolGeoTypes).toContain('CylinderGeometry');

    // 2. Shotgun
    const shotgun = rig.weapons.shotgun!;
    const shotgunMeshes = shotgun.children.filter((c) => c instanceof THREE.Mesh) as THREE.Mesh[];
    expect(shotgunMeshes.length).toBeGreaterThanOrEqual(5);
    const shotgunGeoTypes = shotgunMeshes.map((m) => m.geometry.type);
    expect(shotgunGeoTypes).toContain('CylinderGeometry');
    expect(shotgunGeoTypes).toContain('BoxGeometry');

    // 3. Grenade
    const grenade = rig.weapons.grenade!;
    const grenadeMeshes = grenade.children.filter((c) => c instanceof THREE.Mesh) as THREE.Mesh[];
    expect(grenadeMeshes.length).toBeGreaterThanOrEqual(3);
    const grenadeGeoTypes = grenadeMeshes.map((m) => m.geometry.type);
    expect(grenadeGeoTypes).toContain('SphereGeometry');
    expect(grenadeGeoTypes).toContain('CylinderGeometry');
    expect(grenadeGeoTypes).toContain('TorusGeometry');

    // 4. Medic Syringe
    const syringe = rig.weapons.medic!;
    const syringeMeshes = syringe.children.filter((c) => c instanceof THREE.Mesh) as THREE.Mesh[];
    expect(syringeMeshes.length).toBeGreaterThanOrEqual(5);
    const syringeGeoTypes = syringeMeshes.map((m) => m.geometry.type);
    expect(syringeGeoTypes).toContain('CylinderGeometry');
    expect(syringeGeoTypes).toContain('ConeGeometry');

    // 5. Bazooka
    const bazooka = rig.weapons.bazooka!;
    const bazookaMeshes = bazooka.children.filter((c) => c instanceof THREE.Mesh) as THREE.Mesh[];
    expect(bazookaMeshes.length).toBeGreaterThanOrEqual(4);
    const bazookaGeoTypes = bazookaMeshes.map((m) => m.geometry.type);
    expect(bazookaGeoTypes).toContain('CylinderGeometry');
    expect(bazookaGeoTypes).toContain('ConeGeometry');
    expect(bazookaGeoTypes).toContain('BoxGeometry');

    // 6. Carried Crate Prop
    const crateProp = rig.carriedCrateProp;
    const crateMeshes = crateProp.children.filter((c) => c instanceof THREE.Mesh) as THREE.Mesh[];
    expect(crateMeshes.length).toBeGreaterThanOrEqual(3);
    const crateGeoTypes = crateMeshes.map((m) => m.geometry.type);
    expect(crateGeoTypes).toContain('BoxGeometry');
  });

  it('1.4 verifies rig factory works consistently across all 4 teams and all 3 classes', () => {
    for (const team of teams) {
      for (const cls of classes) {
        const rig = createChibiBuddyRig(team, cls);
        expect(rig.team).toBe(team);
        expect(rig.classType).toBe(cls);

        // Check badge on helmet
        expect(rig.helmetGroup.children.length).toBeGreaterThanOrEqual(3);
        const badge = rig.helmetGroup.children.find((c) => c !== rig.helmetGroup.children[0] && c !== rig.helmetGroup.children[1]);
        expect(badge).toBeDefined();

        // Check weapon models
        expect(rig.weapons.pistol).not.toBeNull();
        expect(rig.weapons.bazooka).not.toBeNull();
      }
    }
  });
});

describe('Empirical Stress Test: Weapon Switching & Exclusivity', () => {
  it('2.1 ensures no weapons are visible on initial creation', () => {
    const rig = createChibiBuddyRig('red', 'fighter');

    expect(rig.currentWeapon).toBe('none');
    expect(rig.weapons.pistol!.visible).toBe(false);
    expect(rig.weapons.shotgun!.visible).toBe(false);
    expect(rig.weapons.grenade!.visible).toBe(false);
    expect(rig.weapons.medic!.visible).toBe(false);
    expect(rig.weapons.bazooka!.visible).toBe(false);
    expect(rig.carriedCrateProp.visible).toBe(false);
  });

  it('2.2 verifies strict exclusivity across each single weapon switch', () => {
    const rig = createChibiBuddyRig('red', 'fighter');
    const weaponKeys: (WeaponType | 'crate')[] = ['pistol', 'shotgun', 'grenade', 'medic', 'bazooka', 'crate', 'none'];

    const getVisibleCount = () => {
      let count = 0;
      if (rig.weapons.pistol!.visible) count++;
      if (rig.weapons.shotgun!.visible) count++;
      if (rig.weapons.grenade!.visible) count++;
      if (rig.weapons.medic!.visible) count++;
      if (rig.weapons.bazooka!.visible) count++;
      if (rig.carriedCrateProp.visible) count++;
      return count;
    };

    for (const wpn of weaponKeys) {
      rig.setEquippedWeapon(wpn);
      expect(rig.currentWeapon).toBe(wpn);

      if (wpn === 'none') {
        expect(getVisibleCount()).toBe(0);
      } else {
        expect(getVisibleCount()).toBe(1);
        if (wpn === 'crate') {
          expect(rig.carriedCrateProp.visible).toBe(true);
        } else {
          expect(rig.weapons[wpn]!.visible).toBe(true);
        }
      }
    }
  });

  it('2.3 performs 10,000 rapid random weapon switches (Monte Carlo stress test)', () => {
    const rig = createChibiBuddyRig('cyan', 'constructor');
    const weaponChoices: (WeaponType | 'crate')[] = ['none', 'pistol', 'shotgun', 'grenade', 'medic', 'bazooka', 'crate'];

    for (let i = 0; i < 10000; i++) {
      const choice = weaponChoices[Math.floor(Math.random() * weaponChoices.length)];
      rig.setEquippedWeapon(choice);

      // Verify exclusivity
      let visibleCount = 0;
      let activeItemName = 'none';

      if (rig.weapons.pistol!.visible) { visibleCount++; activeItemName = 'pistol'; }
      if (rig.weapons.shotgun!.visible) { visibleCount++; activeItemName = 'shotgun'; }
      if (rig.weapons.grenade!.visible) { visibleCount++; activeItemName = 'grenade'; }
      if (rig.weapons.medic!.visible) { visibleCount++; activeItemName = 'medic'; }
      if (rig.weapons.bazooka!.visible) { visibleCount++; activeItemName = 'bazooka'; }
      if (rig.carriedCrateProp.visible) { visibleCount++; activeItemName = 'crate'; }

      if (choice === 'none') {
        expect(visibleCount).toBe(0);
      } else {
        expect(visibleCount).toBe(1);
        expect(activeItemName).toBe(choice);
      }
      expect(rig.currentWeapon).toBe(choice);
    }
  });

  it('2.4 handles invalid or corrupted weapon inputs gracefully without throwing', () => {
    const rig = createChibiBuddyRig('blue', 'healer');

    const badInputs: any[] = ['unknown_gun', '', null, undefined, 12345, { weapon: 'laser' }];
    for (const bad of badInputs) {
      expect(() => rig.setEquippedWeapon(bad)).not.toThrow();

      // All weapons and crate must be hidden on invalid input
      expect(rig.weapons.pistol!.visible).toBe(false);
      expect(rig.weapons.shotgun!.visible).toBe(false);
      expect(rig.weapons.grenade!.visible).toBe(false);
      expect(rig.weapons.medic!.visible).toBe(false);
      expect(rig.weapons.bazooka!.visible).toBe(false);
      expect(rig.carriedCrateProp.visible).toBe(false);
    }
  });

  it('2.5 maintains strict state isolation across 16 concurrent rigs', () => {
    const rigs: ChibiRigInstance[] = [];
    for (let i = 0; i < 16; i++) {
      rigs.push(createChibiBuddyRig('red', 'fighter'));
    }

    // Set distinct weapon on each rig
    const weaponMap: (WeaponType | 'crate')[] = [
      'none', 'pistol', 'shotgun', 'grenade', 'medic', 'bazooka', 'crate', 'pistol',
      'shotgun', 'grenade', 'medic', 'bazooka', 'crate', 'none', 'pistol', 'bazooka'
    ];

    for (let i = 0; i < 16; i++) {
      rigs[i].setEquippedWeapon(weaponMap[i]);
    }

    // Verify no cross-talk
    for (let i = 0; i < 16; i++) {
      expect(rigs[i].currentWeapon).toBe(weaponMap[i]);
      if (weaponMap[i] === 'none') {
        expect(rigs[i].weapons.pistol!.visible).toBe(false);
      } else if (weaponMap[i] === 'crate') {
        expect(rigs[i].carriedCrateProp.visible).toBe(true);
      } else {
        expect(rigs[i].weapons[weaponMap[i] as WeaponType]!.visible).toBe(true);
      }
    }
  });
});

describe('Empirical Stress Test: Crate Carrying & Walking Bob Physics', () => {
  beforeEach(() => {
    resetAllAnimTrackers();
  });

  it('3.1 mounts crate to head socket when picked up and hides other weapons', () => {
    const buddy = new BuddyEntity('buddy_crate_test', 'red', 'fighter');
    buddy.weapon = 'shotgun';
    const rig = createChibiBuddyRig('red', 'fighter');

    // Initially equipped with shotgun
    rig.setEquippedWeapon(buddy.weapon);
    expect(rig.weapons.shotgun!.visible).toBe(true);
    expect(rig.carriedCrateProp.visible).toBe(false);

    // Pick up crate
    buddy.isCarryingCrate = true;
    updateBuddyProceduralAnimation(rig, buddy, 0.016, 0.5);

    // Rig must switch to crate
    expect(rig.currentWeapon).toBe('crate');
    expect(rig.carriedCrateProp.visible).toBe(true);
    expect(rig.weapons.shotgun!.visible).toBe(false);
    expect(rig.weapons.pistol!.visible).toBe(false);
    expect(rig.weapons.bazooka!.visible).toBe(false);

    // Arms must be raised overhead
    expect(rig.leftHandPivot.rotation.x).toBeLessThan(-1.5);
    expect(rig.rightHandPivot.rotation.x).toBeLessThan(-1.5);
  });

  it('3.2 verifies active dynamic walking bob physics on carried crate prop', () => {
    const buddy = new BuddyEntity('buddy_bob_test', 'blue', 'constructor');
    buddy.isCarryingCrate = true;
    buddy.velocity = { x: 5.0, y: 0, z: 0 }; // Moving
    const rig = createChibiBuddyRig('blue', 'constructor');

    const yPositions: number[] = [];
    const zRotations: number[] = [];

    // Simulate 120 frames (~2 seconds of walking)
    for (let i = 0; i < 120; i++) {
      updateBuddyProceduralAnimation(rig, buddy, 0.016, i * 0.016);
      yPositions.push(rig.carriedCrateProp.position.y);
      zRotations.push(rig.bodyMesh.rotation.z);
    }

    const minY = Math.min(...yPositions);
    const maxY = Math.max(...yPositions);
    const rangeY = maxY - minY;

    // Base Y is 1.05m; walk bob is sin(phase) * 0.05m => range ≈ 0.10m
    expect(minY).toBeLessThan(1.05);
    expect(maxY).toBeGreaterThan(1.05);
    expect(rangeY).toBeGreaterThanOrEqual(0.08);
    expect(rangeY).toBeLessThanOrEqual(0.12);

    // Torso waddle roll: must exhibit bilateral symmetry across a full walk cycle
    const minZ = Math.min(...zRotations);
    const maxZ = Math.max(...zRotations);
    expect(maxZ).toBeGreaterThan(0.04);
    expect(minZ).toBeLessThan(-0.04); // Fails due to phase % (Math.PI * 2) truncating sin(phase * 0.5) to [0, PI)
  });

  it('3.3 verifies stationary carry breathing bob', () => {
    const buddy = new BuddyEntity('buddy_idle_carry', 'yellow', 'healer');
    buddy.isCarryingCrate = true;
    buddy.velocity = { x: 0, y: 0, z: 0 }; // Stationary
    const rig = createChibiBuddyRig('yellow', 'healer');

    const yPositions: number[] = [];
    // Simulate 120 frames
    for (let i = 0; i < 120; i++) {
      updateBuddyProceduralAnimation(rig, buddy, 0.016, i * 0.016);
      yPositions.push(rig.carriedCrateProp.position.y);
    }

    const minY = Math.min(...yPositions);
    const maxY = Math.max(...yPositions);
    const rangeY = maxY - minY;

    // Stationary breathe bob is sin(t * 4) * 0.03 => range ≈ 0.06m
    expect(minY).toBeLessThan(1.05);
    expect(maxY).toBeGreaterThan(1.05);
    expect(rangeY).toBeGreaterThanOrEqual(0.05);
    expect(rangeY).toBeLessThanOrEqual(0.07);
  });

  it('3.4 restores previously equipped weapon when crate is dropped or thrown', () => {
    const buddy = new BuddyEntity('buddy_restore_test', 'cyan', 'fighter');
    buddy.weapon = 'bazooka';
    buddy.isCarryingCrate = true;
    const rig = createChibiBuddyRig('cyan', 'fighter');

    // Frame 1: carrying crate
    updateBuddyProceduralAnimation(rig, buddy, 0.016, 1.0);
    expect(rig.currentWeapon).toBe('crate');
    expect(rig.carriedCrateProp.visible).toBe(true);
    expect(rig.weapons.bazooka!.visible).toBe(false);

    // Frame 2: drop crate
    buddy.isCarryingCrate = false;
    updateBuddyProceduralAnimation(rig, buddy, 0.016, 1.016);

    expect(rig.currentWeapon).toBe('bazooka');
    expect(rig.carriedCrateProp.visible).toBe(false);
    expect(rig.weapons.bazooka!.visible).toBe(true);
  });

  it('3.5 verifies knockout immediately drops crate and triggers knockout collapse pose', () => {
    const buddy = new BuddyEntity('buddy_ko_crate', 'red', 'fighter');
    buddy.isCarryingCrate = true;
    const rig = createChibiBuddyRig('red', 'fighter');

    updateBuddyProceduralAnimation(rig, buddy, 0.016, 1.0);
    expect(rig.carriedCrateProp.visible).toBe(true);

    // Buddy takes fatal damage
    buddy.takeDamage(200);
    expect(buddy.isKnocked).toBe(true);
    expect(buddy.isCarryingCrate).toBe(false);

    // Update animation
    updateBuddyProceduralAnimation(rig, buddy, 0.016, 1.016);

    expect(rig.carriedCrateProp.visible).toBe(false);
    expect(rig.currentExpression).toBe('surprise');
    expect(rig.bodyMesh.position.y).toBeCloseTo(0.25, 2); // Down flat on the ground
    expect(rig.bodyMesh.rotation.x).toBeLessThan(-1.2); // Fallen backwards
  });
});
