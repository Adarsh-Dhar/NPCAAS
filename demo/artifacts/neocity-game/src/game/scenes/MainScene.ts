import Phaser from "phaser";
import type { Character } from "../../lib/sdk";
import { getSceneCharacters, subscribeSceneCharacters } from "@/lib/npcSceneState";
import {
  emitPlayerEvent,
  incrementChipDelivered,
  incrementMislabeledCrate,
  patchMissionState,
  setMissionPhase,
} from "@/lib/playerState";
import { normalizeNpcName } from "@/lib/protocolBabel";

type NpcKind = "character" | "delivery" | "terminal" | "bodyguard";

interface SceneNpc {
  id: string;
  name: string;
  x: number;
  y: number;
  label: string;
  color: number;
  kind: NpcKind;
}

interface SceneNpcRef {
  data: SceneNpc;
  container: Phaser.GameObjects.Container;
  labelText: Phaser.GameObjects.Text;
  promptText: Phaser.GameObjects.Text;
}

const REQUIRED_DELIVERIES = [
  "SVETLANA_MOROZOVA",
  "DIEGO_VARGAS",
  "BUYER_A",
  "BUYER_B",
  "BUYER_C",
  "BUYER_D",
] as const;

export class MainScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Container;
  private physicsPlayer!: Phaser.Types.Physics.Arcade.GameObjectWithBody;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };
  private interactKey!: Phaser.Input.Keyboard.Key;
  private paused = false;
  private playerSpeed = 200;
  private npcs: SceneNpcRef[] = [];
  private zoneBarrierA!: Phaser.GameObjects.Rectangle;
  private zoneBarrierB!: Phaser.GameObjects.Rectangle;
  private phase: 1 | 2 | 3 = 1;
  private chipsDelivered = new Set<string>();
  private cratesMislabeled = 0;
  private diegoIntelRevealed = false;
  private bodyguardIntelRevealed = false;
  private briefcaseLocated = false;
  private frenzyActive = false;
  private remyInTransit = false;
  private briefcaseTransferred = false;
  private escapeRouteOpened = false;
  private artifactIntercepted = false;
  private rain!: Phaser.GameObjects.Graphics;
  private rainOffset = 0;
  private unsubCharacters?: () => void;
  private boundCloseChat?: (e: Event) => void;
  private boundGameResume?: (e: Event) => void;
  private boundNpcSystemEvent?: (e: Event) => void;

  constructor() {
    super("MainScene");
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    this.createPortMap(W, H);
    this.createPlayer(92, H / 2);
    this.createZoneBarriers(W, H);
    this.createNpcs(getSceneCharacters());

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      up: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    this.interactKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);

    this.boundCloseChat = this.handleResume.bind(this);
    this.boundGameResume = this.handleResume.bind(this);
    this.boundNpcSystemEvent = this.handleNpcSystemEvent.bind(this);

    window.addEventListener("CLOSE_CHAT", this.boundCloseChat);
    window.addEventListener("GAME_RESUME", this.boundGameResume);
    window.addEventListener("NPC_SYSTEM_EVENT", this.boundNpcSystemEvent);

    this.unsubCharacters = subscribeSceneCharacters((characters) => {
      this.createNpcs(characters);
    });

    emitPlayerEvent("MANIFEST_ACCEPTED");
    patchMissionState({ phase: 1 }, "MANIFEST_ACCEPTED");
    this.showBroadcast("VINNIE", "You are quartermaster now. Move those chips and fix the manifest.");
  }

  private createPortMap(W: number, H: number) {
    this.add.rectangle(0, 0, W, H, 0x05050a).setOrigin(0);

    const gradient = this.add.graphics();
    gradient.fillGradientStyle(0x081825, 0x081825, 0x03070a, 0x03070a, 0.9);
    gradient.fillRect(0, 0, W, H);

    const grid = this.add.graphics();
    grid.lineStyle(1, 0x102536, 0.55);
    for (let x = 0; x < W; x += 36) {
      grid.moveTo(x, 0);
      grid.lineTo(x, H);
    }
    for (let y = 0; y < H; y += 36) {
      grid.moveTo(0, y);
      grid.lineTo(W, y);
    }
    grid.strokePath();

    const docks = this.add.graphics();
    docks.fillStyle(0x101926, 0.88);
    docks.fillRect(20, 60, W - 40, H - 120);
    docks.lineStyle(2, 0x20364f, 1);
    docks.strokeRect(20, 60, W - 40, H - 120);

    this.add
      .text(28, 20, "PORT SOLANO // THE BAZAAR", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#90d2ff",
        letterSpacing: 4,
      })
      .setDepth(20);

    this.add
      .text(26, H - 34, "Warehouse Floor", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#80bddf",
      })
      .setDepth(20);

    this.add
      .text(W / 2 - 44, H - 34, "Trading Floor", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#80bddf",
      })
      .setDepth(20);

    this.add
      .text(W - 130, H - 34, "Loading Bay", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#80bddf",
      })
      .setDepth(20);

    this.rain = this.add.graphics().setDepth(100);
  }

  private createZoneBarriers(W: number, H: number) {
    const x1 = Math.floor(W * 0.34);
    const x2 = Math.floor(W * 0.67);

    this.zoneBarrierA = this.add.rectangle(x1, H / 2, 14, H - 120, 0x9fd9ff, 0.55).setDepth(12);
    this.zoneBarrierB = this.add.rectangle(x2, H / 2, 14, H - 120, 0x9fd9ff, 0.55).setDepth(12);

    this.add
      .text(x1, 62, "LOCK // PHASE 1", {
        fontFamily: "monospace",
        fontSize: "9px",
        color: "#bce7ff",
        backgroundColor: "#001620cc",
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(13);

    this.add
      .text(x2, 62, "LOCK // PHASE 2", {
        fontFamily: "monospace",
        fontSize: "9px",
        color: "#bce7ff",
        backgroundColor: "#001620cc",
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(13);
  }

  private createPlayer(x: number, y: number) {
    this.player = this.add.container(x, y);
    const shadow = this.add.ellipse(0, 10, 26, 12, 0x000000, 0.5);
    const body = this.add.rectangle(0, -2, 18, 26, 0x1a2838, 1);
    const visor = this.add.rectangle(0, -10, 16, 6, 0x68d6ff, 1);
    this.player.add([shadow, body, visor]);
    this.player.setDepth(10);

    this.physics.world.enable(this.player as unknown as Phaser.GameObjects.GameObject);
    this.physicsPlayer = this.player as unknown as Phaser.Types.Physics.Arcade.GameObjectWithBody;
    (this.physicsPlayer.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(true);
  }

  private createNpcs(characters: Character[]) {
    for (const npc of this.npcs) {
      npc.container.destroy(true);
      npc.labelText.destroy();
      npc.promptText.destroy();
    }
    this.npcs = [];

    const charsByName = new Map(characters.map((character) => [normalizeNpcName(character.name), character]));

    const seeds: SceneNpc[] = [
      { id: charsByName.get("VINNIE_DELUCA")?.id ?? "vinnie", name: "Vinnie_DeLuca", x: 110, y: 150, label: "Dock Boss", color: 0xa7e3ff, kind: "character" },
      { id: charsByName.get("SVETLANA_MOROZOVA")?.id ?? "svetlana", name: "Svetlana_Morozova", x: 420, y: 155, label: "Arms Broker", color: 0xff9ca6, kind: "character" },
      { id: charsByName.get("DIEGO_VARGAS")?.id ?? "diego", name: "Diego_Vargas", x: 505, y: 350, label: "Narco Buyer", color: 0xffd38a, kind: "character" },
      { id: charsByName.get("THE_CURATOR")?.id ?? "curator", name: "The_Curator", x: 760, y: 140, label: "Acquirer", color: 0xe2c6ff, kind: "character" },
      { id: charsByName.get("REMY_BOUDREAUX")?.id ?? "remy", name: "Remy_Boudreaux", x: 640, y: 360, label: "Courier", color: 0xb2ffcb, kind: "character" },
      { id: charsByName.get("PAPA_KOFI")?.id ?? "kofi", name: "Papa_Kofi", x: 700, y: 515, label: "Port Authority", color: 0x90f5d4, kind: "character" },
      { id: "terminal", name: "Manifest_Terminal", x: 230, y: 500, label: "Warehouse Terminal", color: 0x8cb8ff, kind: "terminal" },
      { id: "bodyguard", name: "Svetlana_Bodyguard", x: 455, y: 200, label: "Bodyguard", color: 0x8e99af, kind: "bodyguard" },
      { id: "buyer_a", name: "Buyer_A", x: 170, y: 260, label: "Minor Buyer", color: 0x8ed5ff, kind: "delivery" },
      { id: "buyer_b", name: "Buyer_B", x: 250, y: 220, label: "Minor Buyer", color: 0x8ed5ff, kind: "delivery" },
      { id: "buyer_c", name: "Buyer_C", x: 150, y: 380, label: "Minor Buyer", color: 0x8ed5ff, kind: "delivery" },
      { id: "buyer_d", name: "Buyer_D", x: 275, y: 330, label: "Minor Buyer", color: 0x8ed5ff, kind: "delivery" },
    ];

    for (const seed of seeds) {
      const container = this.add.container(seed.x, seed.y).setDepth(11);
      const aura = this.add.circle(0, 0, 16, seed.color, 0.2);
      const core = this.add.rectangle(0, 0, 14, 20, 0x111a25, 1);
      const stripe = this.add.rectangle(0, -7, 14, 5, seed.color, 0.9);
      container.add([aura, core, stripe]);

      const labelText = this.add
        .text(seed.x, seed.y + 20, seed.label, {
          fontFamily: "monospace",
          fontSize: "9px",
          color: "#9ab7cd",
        })
        .setOrigin(0.5, 0)
        .setDepth(12);

      const promptText = this.add
        .text(seed.x, seed.y - 26, "[E] INTERACT", {
          fontFamily: "monospace",
          fontSize: "9px",
          color: "#ffffff",
          backgroundColor: "#001723d6",
          padding: { x: 5, y: 2 },
        })
        .setOrigin(0.5)
        .setDepth(22)
        .setVisible(false);

      this.npcs.push({ data: seed, container, labelText, promptText });
    }
  }

  private handleResume() {
    this.paused = false;
    try {
      if (this.input && (this.input.keyboard as { enabled?: boolean })) {
        (this.input.keyboard as { enabled?: boolean }).enabled = true;
      }
    } catch {
      // no-op
    }
  }

  private openChat(npcId: string, npcName: string) {
    this.paused = true;
    try {
      if (this.input && (this.input.keyboard as { enabled?: boolean })) {
        (this.input.keyboard as { enabled?: boolean }).enabled = false;
      }
    } catch {
      // no-op
    }

    this.applyPreChatProgress(npcName);

    window.dispatchEvent(new CustomEvent("OPEN_CHAT", { detail: { npcId, npcName } }));
  }

  private applyPreChatProgress(npcName: string) {
    const normalized = normalizeNpcName(npcName);

    if (this.phase === 1 && REQUIRED_DELIVERIES.includes(normalized as (typeof REQUIRED_DELIVERIES)[number])) {
      this.handleChipDelivery(normalized);
    }

    if (this.phase === 2 && normalized === "DIEGO_VARGAS" && !this.diegoIntelRevealed) {
      this.diegoIntelRevealed = true;
      patchMissionState({ diegoIntelRevealed: true }, "LORE_REVEALED");
      emitPlayerEvent("LORE_REVEALED");
      this.showBroadcast("DIEGO", "Svetlana will not let that gold case out of her sight.");
    }

    if (this.phase === 2 && normalized === "SVETLANA_MOROZOVA" && this.diegoIntelRevealed && !this.briefcaseLocated) {
      this.briefcaseLocated = true;
      patchMissionState({ briefcaseLocated: true }, "BRIEFCASE_LOCATED");
      emitPlayerEvent("BRIEFCASE_LOCATED");
      this.showBroadcast("INTEL", "Briefcase carrier confirmed. Locate Remy during frenzy.");
    }

    if (normalized === "PAPA_KOFI" && !this.escapeRouteOpened) {
      this.escapeRouteOpened = true;
      patchMissionState({ escapeRouteOpened: true }, "ESCAPE_ROUTE_OPENED");
      emitPlayerEvent("ESCAPE_ROUTE_OPENED");
    }

    if (this.phase === 3 && normalized === "REMY_BOUDREAUX" && !this.briefcaseTransferred) {
      this.briefcaseTransferred = true;
      patchMissionState({ briefcaseTransferred: true }, "BRIEFCASE_TRANSFERRED");
      emitPlayerEvent("BRIEFCASE_TRANSFERRED");
      this.showBroadcast("REMY", "Transfer window closed. Package ownership changed.");
      this.finishMission();
    }

    this.checkPhaseProgress();
  }

  private handleLocalInteraction(npc: SceneNpcRef) {
    if (npc.data.kind === "terminal" && this.phase === 1 && this.cratesMislabeled < 2) {
      this.cratesMislabeled += 1;
      incrementMislabeledCrate();
      this.showBroadcast("TERMINAL", `Routing code overwritten (${this.cratesMislabeled}/2).`);
      if (this.cratesMislabeled === 2) {
        emitPlayerEvent("INVENTORY_COMPROMISED");
      }
      this.checkPhaseProgress();
      return;
    }

    if (npc.data.kind === "delivery" && this.phase === 1) {
      this.handleChipDelivery(normalizeNpcName(npc.data.name));
      this.checkPhaseProgress();
      return;
    }

    if (npc.data.kind === "bodyguard" && this.phase === 2 && this.diegoIntelRevealed && !this.bodyguardIntelRevealed) {
      this.bodyguardIntelRevealed = true;
      patchMissionState({ bodyguardIntelRevealed: true }, "LORE_REVEALED");
      emitPlayerEvent("LORE_REVEALED");
      this.showBroadcast("BODYGUARD", "Remy arrived twenty minutes ago. Transit starts at the bell.");
      this.checkPhaseProgress();
    }
  }

  private handleChipDelivery(npcName: string) {
    if (this.chipsDelivered.has(npcName)) return;
    this.chipsDelivered.add(npcName);
    incrementChipDelivered();
    this.showBroadcast("VINNIE", `Verification chip logged for ${npcName.replace(/_/g, " ")}.`);
  }

  private checkPhaseProgress() {
    if (
      this.phase === 1 &&
      this.chipsDelivered.size >= REQUIRED_DELIVERIES.length &&
      this.cratesMislabeled >= 2
    ) {
      this.phase = 2;
      setMissionPhase(2);
      this.unlockBarrier(this.zoneBarrierA);
      this.showBroadcast("PHASE 2", "Trading Floor unlocked. Read the room and identify the courier chain.");
      return;
    }

    if (
      this.phase === 2 &&
      this.diegoIntelRevealed &&
      this.bodyguardIntelRevealed &&
      this.briefcaseLocated
    ) {
      this.phase = 3;
      this.frenzyActive = true;
      this.remyInTransit = true;
      patchMissionState({ phase: 3, frenzyActive: true }, "PHASE_3_STARTED");
      this.unlockBarrier(this.zoneBarrierB);
      this.showBroadcast("PHASE 3", "Frenzy started. Intercept Remy before Curator handoff.");
    }
  }

  private finishMission() {
    if (this.artifactIntercepted) return;
    this.artifactIntercepted = true;
    patchMissionState({ artifactIntercepted: true, frenzyActive: false }, "ARTIFACT_INTERCEPTED");
    emitPlayerEvent("ARTIFACT_INTERCEPTED");
    this.cameras.main.flash(320, 120, 220, 255, true);
    this.cameras.main.shake(240, 0.006);
    this.showBroadcast("AEGIS", "Artifact intercepted. Quantum drive access codes secured.");
  }

  private unlockBarrier(barrier: Phaser.GameObjects.Rectangle) {
    this.tweens.add({
      targets: barrier,
      alpha: 0,
      duration: 700,
      onComplete: () => barrier.setVisible(false),
    });
  }

  private showBroadcast(source: string, text: string) {
    const bubble = this.add
      .text(this.scale.width / 2, 40, `${source}: ${text}`, {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#e8f7ff",
        backgroundColor: "#001821dd",
        padding: { x: 8, y: 5 },
      })
      .setOrigin(0.5)
      .setDepth(40);

    this.tweens.add({
      targets: bubble,
      alpha: 0,
      y: 28,
      duration: 2400,
      delay: 800,
      onComplete: () => bubble.destroy(),
    });
  }

  private handleNpcSystemEvent(event: Event) {
    const detail = (event as CustomEvent<{ eventName?: string; npcName?: string }>).detail;
    const eventName = detail?.eventName;
    if (!eventName) return;

    emitPlayerEvent(eventName);

    if (eventName === "BRIEFCASE_TRANSFERRED" && this.phase === 3) {
      this.briefcaseTransferred = true;
      patchMissionState({ briefcaseTransferred: true }, "BRIEFCASE_TRANSFERRED");
      this.finishMission();
    }

    if (eventName === "ESCAPE_ROUTE_OPENED") {
      this.escapeRouteOpened = true;
      patchMissionState({ escapeRouteOpened: true }, "ESCAPE_ROUTE_OPENED");
    }
  }

  update() {
    if (this.paused) {
      (this.physicsPlayer.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      return;
    }

    const body = this.physicsPlayer.body as Phaser.Physics.Arcade.Body;
    let vx = 0;
    let vy = 0;

    const left = this.cursors.left.isDown || this.wasd.left.isDown;
    const right = this.cursors.right.isDown || this.wasd.right.isDown;
    const up = this.cursors.up.isDown || this.wasd.up.isDown;
    const down = this.cursors.down.isDown || this.wasd.down.isDown;

    if (left) vx = -this.playerSpeed;
    if (right) vx = this.playerSpeed;
    if (up) vy = -this.playerSpeed;
    if (down) vy = this.playerSpeed;

    if (vx !== 0 && vy !== 0) {
      vx *= 0.707;
      vy *= 0.707;
    }

    const gateA = this.scale.width * 0.34;
    const gateB = this.scale.width * 0.67;

    if (this.phase < 2 && this.player.x >= gateA - 16 && vx > 0) {
      vx = 0;
      this.player.x = gateA - 18;
    }

    if (this.phase < 3 && this.player.x >= gateB - 16 && vx > 0) {
      vx = 0;
      this.player.x = gateB - 18;
    }

    body.setVelocity(vx, vy);

    for (const npc of this.npcs) {
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, npc.data.x, npc.data.y);
      const inRange = distance < 82;
      npc.promptText.setVisible(inRange);

      if (!inRange || !Phaser.Input.Keyboard.JustDown(this.interactKey)) continue;

      if (npc.data.kind === "character") {
        this.openChat(npc.data.id, npc.data.name);
      } else {
        this.handleLocalInteraction(npc);
      }
    }

    if (this.remyInTransit && this.phase === 3 && !this.artifactIntercepted) {
      const remy = this.npcs.find((npc) => normalizeNpcName(npc.data.name) === "REMY_BOUDREAUX");
      if (remy) {
        const t = this.time.now / 1000;
        remy.container.x = 620 + Math.cos(t * 1.3) * 105;
        remy.container.y = 360 + Math.sin(t * 1.1) * 70;
        remy.data.x = remy.container.x;
        remy.data.y = remy.container.y;
        remy.labelText.setPosition(remy.data.x, remy.data.y + 20);
        remy.promptText.setPosition(remy.data.x, remy.data.y - 26);
      }
    }

    this.rainOffset += 1.5;
    this.rain.clear();
    this.rain.lineStyle(1, 0xa4dbff, 0.08);
    for (let i = 0; i < 95; i += 1) {
      const x = ((i * 37 + this.rainOffset * 2) % this.scale.width) - 20;
      const y = ((i * 59 + this.rainOffset * 5) % this.scale.height) - 30;
      this.rain.beginPath();
      this.rain.moveTo(x, y);
      this.rain.lineTo(x - 6, y + 12);
      this.rain.strokePath();
    }
  }

  destroy() {
    if (this.boundCloseChat) window.removeEventListener("CLOSE_CHAT", this.boundCloseChat);
    if (this.boundGameResume) window.removeEventListener("GAME_RESUME", this.boundGameResume);
    if (this.boundNpcSystemEvent) window.removeEventListener("NPC_SYSTEM_EVENT", this.boundNpcSystemEvent);
    if (this.unsubCharacters) this.unsubCharacters();
  }
}
