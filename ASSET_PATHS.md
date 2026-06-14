# Useful Game Asset Paths

> All `pocketroll/…` paths below are relative to the real-game checkout at `~/Desktop/RougeLegend/pocketroll/`.

## Character Spine
```
pocketroll/Assets/PocketRoll/Character_Assets/Spine
```

## Board Assets
```
General pattern: `pocketroll/Assets/Gameplay/Board/Stage_<N>`
pocketroll/Assets/Gameplay/Board/Stage_1
pocketroll/Assets/Gameplay/Board/Stage_1/Textures/Battle_BG_Stage_1.png
```

## Enemy Spine (by stage)
General pattern: `pocketroll/Assets/Gameplay/BattleSystem/Enemies/Enemies_Stage_<N>/<EnemyName>/Spine/`
Each folder contains: `<EnemyName>.json`, `<EnemyName>.atlas.txt`, `<EnemyName>.png`
```
Enemies_Stage_1/SkeletonWarrior/Spine/
Enemies_Stage_1/Slime/Spine/
Enemies_Stage_1/SnowSpider/Spine/
Enemies_Stage_2/
Enemies_Stage_3/Red_Slime/Spine/   (has 2 atlas pages: Red_Slime.png, Red_Slime_2.png)
```

## Skill Icons
```
pocketroll/Assets/Gameplay/BattleSystem/Skills/Sprites/
  Shuriken.png, Deadly_Fireball.png, Bolt.png, Lightning_Shot.png, Meteor.png, Fuma_Shuriken.png
```

## Skill Projectile Textures
```
pocketroll/Assets/Gameplay/BattleSystem/BattleAnimations/Textures/
  Shuriken.png, Deadly Shuriken.png
```

## Skill VFX Spritesheets
```
pocketroll/Assets/Libraries/SprFX/Flame sprite effects/_textures/Normal/Fireball_2_loop_SpriteSheet.png  (2x2, 4 frames)
pocketroll/Assets/Libraries/SprFX/Flame sprite effects/_textures/Normal/Flame_3_loop_SpriteSheet.png     (4x2, 8 frames, 512x512/frame)
pocketroll/Assets/Libraries/SprFX/Electricity/_textures/Electricity_Splash_2_SpriteSheet.png             (4x2, 5 frames, 512x512/frame)
pocketroll/Assets/Libraries/SprFX/15 effects/_textures/lazer_yellow_SpriteSheet.png                      (4x4, 16 frames)
pocketroll/Assets/Libraries/SprFX/19 effects/_textures/explosion_5_SpriteSheet.png                       (4x2, 8 frames)
pocketroll/Assets/Gameplay/BattleSystem/BattleAnimations/Prefabs/VFX/LightningBurst_1.png                (6x6, 36 frames, 512x256/frame)
```

## Weapons
```
pocketroll/Assets/Equipment/Prefabs/Items/Weapons/New_Sprites
```

## Heroes
pocketroll/Assets/Heroes/Config/Heroes

## Roll Button Assets
```
pocketroll/Assets/Gameplay/HUD/Texture
```

## Battle UI
```
pocketroll/Assets/Gameplay/BattleSystem/Battle/Prefabs/
pocketroll/Assets/Gameplay/BattleSystem/Battle/Scripts/
```

## VFX / Glow / Particle Sprites
```
pocketroll/Assets/Graphics/Sprites/Particles_Sprites/SingleSpriteImages/  (Glow_Circle01, Glow_Circle02, RingGlow)
pocketroll/Assets/Libraries/Epic Toon FX/Textures/                        (glow1-6, lightray1-3, aura_soft01, portal_glow)
pocketroll/Assets/Libraries/AllIn1VfxToolkit/Demo & Assets/Textures/Shapes/ (Glow through Glow11)
pocketroll/Assets/Libraries/AssetKits/ParticleImage/Demo/Sprites/          (CircleGlow, Glow, GlowRays)
pocketroll/Assets/Libraries/Powerup FX/Textures/                           (glowatlas2)
pocketroll/Assets/Libraries/SprFX/Explosions/_textures/                    (Glow)
pocketroll/Assets/Libraries/Layer Lab/GUI Pro-FantasyHero/ResourcesData/Sptites/Demo/Demo_Image/ (Image_Glow_Circle_01-03, Image_Glow_Light_01, Image_Glow_Oval_01-02, Image_Star_Glow)
```
