import Phaser from "phaser";

interface NpcData {
  id: string;
  name: string;
  x: number;
  y: number;
  color: number;
  glowColor: number;
  label: string;
}

interface NpcActionDetail {
  npcId?: string;
  npcName?: string;
  text?: string;
  action?: string;
}

interface SceneNpc {
  id: string;
  name: string;
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  promptText: Phaser.GameObjects.Text;
  pulse: Phaser.GameObjects.Ellipse;
  x: number;
  y: number;
}

export class MainScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Container;
  private playerBody!: Phaser.GameObjects.Rectangle;
  private playerSprite!: Phaser.GameObjects.Graphics;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };
  private interactKey!: Phaser.Input.Keyboard.Key;
  private npcs: SceneNpc[] = [];
  private promptGroup!: Phaser.GameObjects.Group;
  private paused = false;
  private boundCloseChat?: (e: Event) => void;
  private boundGameResume?: (e: Event) => void;
  private boundNpcAction?: (e: Event) => void;
  private playerSpeed = 200;
  private physicsPlayer!: Phaser.Types.Physics.Arcade.GameObjectWithBody;
  private tilemap!: Phaser.GameObjects.Group;
  private scanLine!: Phaser.GameObjects.Graphics;
  private scanLineY = 0;
  private lastPlayerX = 0;
  private lastPlayerY = 0;
  private playerDirection: "up" | "down" | "left" | "right" = "down";
  private npcData: NpcData[] = [
    {
      id: "SILAS_VANCE",
      name: "SILAS_VANCE",
      x: 220,
      y: 200,
      color: 0xff6600,
      glowColor: 0xff4400,
      label: "The Wire Scavenger",
    },
    {
      id: "ARCHIVE_NODE_819",
      name: "ARCHIVE_NODE_819",
      x: 680,
      y: 380,
      color: 0x00ffcc,
      glowColor: 0x00ddaa,
      label: "The Root-Key Crafter",
    },
    {
      id: "SCRAP_ENFORCER",
      name: "SCRAP_ENFORCER",
      x: 440,
      y: 520,
      color: 0xff0066,
      glowColor: 0xcc0044,
      label: "The Rival Hunter",
    },
  ];

  constructor() {
    super("MainScene");
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    this.createCyberpunkMap(W, H);
    this.createPlayer(W / 2, H / 2);
    this.createNpcs();
    this.createScanlines(W, H);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      up: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    this.interactKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.E
    );

    this.promptGroup = this.add.group();
    this.boundCloseChat = this.handleCloseChat.bind(this);
    this.boundGameResume = this.handleGameResume.bind(this);
    this.boundNpcAction = this.handleNpcAction.bind(this);
    window.addEventListener("CLOSE_CHAT", this.boundCloseChat);
    window.addEventListener("GAME_RESUME", this.boundGameResume);
    window.addEventListener("npc-action", this.boundNpcAction);
  }

  private createCyberpunkMap(W: number, H: number) {
    const bg = this.add.rectangle(0, 0, W, H, 0x05050f).setOrigin(0);

    const gridGraphics = this.add.graphics();
    gridGraphics.lineStyle(1, 0x0a0a2a, 1);
    const gridSize = 40;
    for (let x = 0; x < W; x += gridSize) {
      gridGraphics.moveTo(x, 0);
      gridGraphics.lineTo(x, H);
    }
    for (let y = 0; y < H; y += gridSize) {
      gridGraphics.moveTo(0, y);
      gridGraphics.lineTo(W, y);
    }
    gridGraphics.strokePath();

    const buildings = [
      { x: 30, y: 30, w: 120, h: 140, color: 0x0d0d1a },
      { x: 180, y: 40, w: 80, h: 100, color: 0x0a0a18 },
      { x: 580, y: 20, w: 150, h: 160, color: 0x0d0d1a },
      { x: 750, y: 50, w: 100, h: 120, color: 0x0a0a18 },
      { x: 20, y: 500, w: 110, h: 140, color: 0x0d0d1a },
      { x: 680, y: 480, w: 140, h: 120, color: 0x0a0a18 },
    ];

    const buildingGraphics = this.add.graphics();
    for (const b of buildings) {
      buildingGraphics.fillStyle(b.color, 1);
      buildingGraphics.fillRect(b.x, b.y, b.w, b.h);
      buildingGraphics.lineStyle(1, 0x111133, 1);
      buildingGraphics.strokeRect(b.x, b.y, b.w, b.h);

      const rows = Math.floor(b.h / 18);
      const cols = Math.floor(b.w / 14);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (Math.random() > 0.5) {
            const winColors = [0x334455, 0x445533, 0x553344, 0x444422];
            buildingGraphics.fillStyle(
              winColors[Math.floor(Math.random() * winColors.length)],
              0.8
            );
            buildingGraphics.fillRect(
              b.x + 2 + c * 14,
              b.y + 4 + r * 18,
              10,
              12
            );
          }
        }
      }
    }

    const neonLines = [
      { x1: 0, y1: 300, x2: W, y2: 300, color: 0x0022ff, alpha: 0.15 },
      { x1: 400, y1: 0, x2: 400, y2: H, color: 0xff0066, alpha: 0.08 },
    ];
    const neonGraphics = this.add.graphics();
    for (const l of neonLines) {
      neonGraphics.lineStyle(2, l.color, l.alpha);
      neonGraphics.moveTo(l.x1, l.y1);
      neonGraphics.lineTo(l.x2, l.y2);
      neonGraphics.strokePath();
    }

    this.add
      .text(W / 2, 20, "NEOCITY DISTRICT-7", {
        fontSize: "11px",
        color: "#334466",
        letterSpacing: 6,
        fontFamily: "monospace",
      })
      .setOrigin(0.5, 0);

    const streetGraphics = this.add.graphics();
    streetGraphics.lineStyle(3, 0x111122, 1);
    streetGraphics.strokeRect(160, 160, 540, 360);
    streetGraphics.lineStyle(1, 0x0a0a1a, 1);
    streetGraphics.moveTo(160, 340);
    streetGraphics.lineTo(700, 340);
    streetGraphics.moveTo(430, 160);
    streetGraphics.lineTo(430, 520);
    streetGraphics.strokePath();
  }

  private createPlayer(x: number, y: number) {
    this.player = this.add.container(x, y);

    const shadow = this.add.ellipse(0, 10, 24, 10, 0x000000, 0.5);

    const glow = this.add.ellipse(0, 0, 32, 32, 0x00ffff, 0.12);

    const body = this.add.graphics();
    body.fillStyle(0x1a1a3a, 1);
    body.fillRect(-10, -14, 20, 28);
    body.fillStyle(0x00eeff, 1);
    body.fillRect(-10, -14, 20, 6);
    body.fillStyle(0x003344, 1);
    body.fillRect(-8, -6, 16, 16);
    body.fillStyle(0x00eeff, 0.6);
    body.fillRect(-6, -4, 12, 12);
    body.fillStyle(0x00eeff, 1);
    body.fillCircle(-4, 10, 4);
    body.fillCircle(4, 10, 4);

    const visor = this.add.graphics();
    visor.fillStyle(0x00eeff, 0.8);
    visor.fillRect(-8, -13, 16, 5);

    this.player.add([shadow, glow, body, visor]);
    this.player.setDepth(10);

    this.physics.world.enable(this.player as unknown as Phaser.GameObjects.GameObject);
    this.physicsPlayer = this.player as unknown as Phaser.Types.Physics.Arcade.GameObjectWithBody;
    (this.physicsPlayer.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(true);
  }

  private createNpcs() {
    for (const npc of this.npcData) {
      const container = this.add.container(npc.x, npc.y);

      const aura = this.add.ellipse(0, 0, 60, 60, npc.color, 0.05);

      const pulse = this.add.ellipse(0, 0, 50, 50, npc.color, 0.1);

      const body = this.add.graphics();
      body.fillStyle(0x1a1a2e, 1);
      body.fillRect(-12, -16, 24, 32);
      body.fillStyle(npc.color, 1);
      body.fillRect(-12, -16, 24, 7);
      body.fillStyle(npc.glowColor, 0.3);
      body.fillRect(-10, -7, 20, 18);
      body.lineStyle(2, npc.color, 1);
      body.strokeRect(-12, -16, 24, 32);

      const head = this.add.graphics();
      head.fillStyle(npc.color, 0.9);
      head.fillEllipse(0, -22, 18, 16);
      head.fillStyle(0x000000, 0.5);
      head.fillRect(-6, -26, 12, 8);

      const nameText = this.add
        .text(0, -40, npc.name, {
          fontSize: "9px",
          color: Phaser.Display.Color.IntegerToColor(npc.color).rgba,
          fontFamily: "monospace",
          stroke: "#000000",
          strokeThickness: 2,
        })
        .setOrigin(0.5, 1);

      container.add([aura, pulse, body, head, nameText]);
      container.setDepth(9);

      const labelText = this.add
        .text(npc.x, npc.y + 30, npc.label, {
          fontSize: "8px",
          color: "#445566",
          fontFamily: "monospace",
        })
        .setOrigin(0.5, 0)
        .setDepth(9);

      const promptText = this.add
        .text(npc.x, npc.y - 55, "[E] INTERACT", {
          fontSize: "10px",
          color: "#ffffff",
          fontFamily: "monospace",
          backgroundColor: "#000000cc",
          padding: { x: 5, y: 3 },
        })
        .setOrigin(0.5, 1)
        .setDepth(20)
        .setVisible(false);

      this.tweens.add({
        targets: pulse,
        scaleX: 1.4,
        scaleY: 1.4,
        alpha: 0,
        duration: 1500,
        ease: "Sine.easeOut",
        repeat: -1,
        yoyo: false,
      });

      this.npcs.push({
        id: npc.id,
        name: npc.name,
        container,
        body,
        label: labelText,
        promptText,
        pulse,
        x: npc.x,
        y: npc.y,
      });
    }
  }

  private createScanlines(W: number, H: number) {
    this.scanLine = this.add.graphics();
    this.scanLine.setDepth(100);
    this.scanLine.setAlpha(0.03);

    const scanGraphics = this.add.graphics();
    scanGraphics.setDepth(99);
    for (let y = 0; y < H; y += 4) {
      scanGraphics.lineStyle(1, 0x000000, 0.15);
      scanGraphics.moveTo(0, y);
      scanGraphics.lineTo(W, y);
    }
    scanGraphics.strokePath();
  }

  private handleCloseChat() {
    this.paused = false;
    try {
      if (this.input && (this.input.keyboard as any)) {
        (this.input.keyboard as any).enabled = true;
      }
    } catch (err) {
      // ignore
    }
  }

  private handleGameResume() {
    this.paused = false;
    try {
      if (this.input && (this.input.keyboard as any)) {
        (this.input.keyboard as any).enabled = true;
      }
    } catch (err) {
      // ignore
    }
  }

  private handleNpcAction(event: Event) {
    const detail = (event as CustomEvent<NpcActionDetail>).detail;
    if (!detail) return;

    const npcKey = detail.npcId ?? detail.npcName;
    if (!npcKey) return;

    this.triggerNpcAction(
      npcKey,
      detail.text ?? "...",
      detail.action ?? "speaks"
    );
  }

  private findNpcByKey(npcKey: string) {
    return this.npcs.find((npc) => npc.id === npcKey || npc.name === npcKey);
  }

  private syncNpcWorldPosition(npc: SceneNpc) {
    npc.x = npc.container.x;
    npc.y = npc.container.y;
    npc.label.setPosition(npc.x, npc.y + 30);
    npc.promptText.setPosition(npc.x, npc.y - 55);
  }

  private animateNpcMove(npc: SceneNpc, toX: number, toY: number, duration = 850) {
    const clampedX = Phaser.Math.Clamp(toX, 32, this.scale.width - 32);
    const clampedY = Phaser.Math.Clamp(toY, 32, this.scale.height - 32);

    this.tweens.killTweensOf(npc.container);
    this.tweens.add({
      targets: npc.container,
      x: clampedX,
      y: clampedY,
      ease: "Sine.easeInOut",
      duration,
      onUpdate: () => this.syncNpcWorldPosition(npc),
      onComplete: () => this.syncNpcWorldPosition(npc),
    });
  }

  triggerNpcAction(npcKey: string, text: string, action: string) {
    const npc = this.findNpcByKey(npcKey);
    if (!npc) return;

    this.createSpeechBubble(npc.container.x, npc.container.y - 10, 220, 92, text);
    this.executePhysicalGesture(npc, action);

    const actionText = this.add
      .text(npc.container.x, npc.container.y + 24, `*${action}*`, {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#aaaaaa",
        fontStyle: "italic",
      })
      .setOrigin(0.5)
      .setDepth(32);

    this.tweens.add({
      targets: actionText,
      alpha: 0,
      y: npc.container.y + 34,
      duration: 1500,
      delay: 500,
      onComplete: () => actionText.destroy(),
    });
  }

  private setNpcTint(
    npc: {
      container: Phaser.GameObjects.Container;
    },
    tint: number
  ) {
    for (const child of npc.container.list) {
      const tintable = child as Phaser.GameObjects.GameObject & {
        setTint?: (color: number) => void;
      };
      tintable.setTint?.(tint);
    }
  }

  private clearNpcTint(npc: { container: Phaser.GameObjects.Container }) {
    for (const child of npc.container.list) {
      const tintable = child as Phaser.GameObjects.GameObject & {
        clearTint?: () => void;
      };
      tintable.clearTint?.();
    }
  }

  executePhysicalGesture(npc: SceneNpc, actionText: string) {
    const act = actionText.toLowerCase();
    const originalX = npc.container.x;
    const originalY = npc.container.y;

    if (act.includes("nod") || act.includes("agree") || act.includes("bow")) {
      this.tweens.add({
        targets: npc.container,
        scaleY: 0.8,
        scaleX: 1.1,
        y: originalY + 5,
        yoyo: true,
        duration: 150,
        repeat: 1,
        onComplete: () => {
          npc.container.y = originalY;
          npc.container.setScale(1, 1);
        },
      });
      return;
    }

    if (
      act.includes("attention") ||
      act.includes("straightens") ||
      act.includes("alert")
    ) {
      this.tweens.add({
        targets: npc.container,
        scaleY: 1.2,
        scaleX: 0.9,
        y: originalY - 10,
        yoyo: true,
        duration: 200,
        ease: "Sine.easeOut",
        onComplete: () => {
          npc.container.y = originalY;
          npc.container.setScale(1, 1);
        },
      });
      return;
    }

    if (
      act.includes("shake") ||
      act.includes("disagree") ||
      act.includes("refuse")
    ) {
      this.tweens.add({
        targets: npc.container,
        x: originalX + 4,
        yoyo: true,
        duration: 50,
        repeat: 3,
        onComplete: () => {
          npc.container.x = originalX;
        },
      });
      return;
    }

    if (
      act.includes("angry") ||
      act.includes("glare") ||
      act.includes("threaten")
    ) {
      this.setNpcTint(npc, 0xffaaaa);
      this.tweens.add({
        targets: npc.container,
        x: originalX + 2,
        yoyo: true,
        duration: 30,
        repeat: 5,
        onComplete: () => {
          npc.container.x = originalX;
          window.setTimeout(() => this.clearNpcTint(npc), 2000);
        },
      });
      return;
    }

    if (act.includes("think") || act.includes("ponder")) {
      const questionMark = this.add
        .text(npc.container.x, npc.container.y - 34, "?", {
          fontSize: "20px",
          color: "#ffff00",
          fontFamily: "monospace",
        })
        .setOrigin(0.5)
        .setDepth(32);

      this.tweens.add({
        targets: questionMark,
        y: questionMark.y - 20,
        alpha: 0,
        duration: 1500,
        onComplete: () => questionMark.destroy(),
      });
      return;
    }

    if (
      act.includes("walk away") ||
      act.includes("walks away") ||
      act.includes("retreat") ||
      act.includes("backs away") ||
      act.includes("leave")
    ) {
      const awayAngle = Phaser.Math.Angle.Between(
        this.player.x,
        this.player.y,
        npc.container.x,
        npc.container.y
      );
      const distance = 78;
      const targetX = npc.container.x + Math.cos(awayAngle) * distance;
      const targetY = npc.container.y + Math.sin(awayAngle) * distance;
      this.animateNpcMove(npc, targetX, targetY, 920);
      return;
    }

    if (
      act.includes("approach") ||
      act.includes("steps closer") ||
      act.includes("walks to") ||
      act.includes("move to player")
    ) {
      const towardAngle = Phaser.Math.Angle.Between(
        npc.container.x,
        npc.container.y,
        this.player.x,
        this.player.y
      );
      const distance = 60;
      const targetX = npc.container.x + Math.cos(towardAngle) * distance;
      const targetY = npc.container.y + Math.sin(towardAngle) * distance;
      this.animateNpcMove(npc, targetX, targetY, 860);
      return;
    }

    if (act.includes("door") || act.includes("exit") || act.includes("walks off")) {
      this.animateNpcMove(npc, this.scale.width - 40, npc.container.y, 980);
      return;
    }

    this.tweens.add({
      targets: npc.container,
      y: originalY - 2,
      yoyo: true,
      duration: 100,
      repeat: 2,
      onComplete: () => {
        npc.container.y = originalY;
      },
    });
  }

  createSpeechBubble(
    x: number,
    y: number,
    width: number,
    height: number,
    quote: string
  ) {
    const bubblePadding = 10;
    const bubbleContainer = this.add.container(x, y).setDepth(31);

    const bubble = this.add.graphics();
    bubble.fillStyle(0xffffff, 1);
    bubble.fillRoundedRect(-width / 2, -height, width, height, 10);
    bubble.fillTriangle(0, 0, -10, -10, 10, -10);

    const content = this.add
      .text(-width / 2 + bubblePadding, -height + bubblePadding, quote, {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#000000",
        wordWrap: { width: width - bubblePadding * 2 },
      })
      .setDepth(1);

    bubbleContainer.add([bubble, content]);

    this.tweens.add({
      targets: bubbleContainer,
      alpha: 0,
      duration: 500,
      delay: 4000,
      onComplete: () => bubbleContainer.destroy(true),
    });
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

    if (left) { vx = -this.playerSpeed; this.playerDirection = "left"; }
    if (right) { vx = this.playerSpeed; this.playerDirection = "right"; }
    if (up) { vy = -this.playerSpeed; this.playerDirection = "up"; }
    if (down) { vy = this.playerSpeed; this.playerDirection = "down"; }

    if (vx !== 0 && vy !== 0) {
      vx *= 0.707;
      vy *= 0.707;
    }

    body.setVelocity(vx, vy);

    const px = this.player.x;
    const py = this.player.y;

    for (const npc of this.npcs) {
      const dist = Phaser.Math.Distance.Between(px, py, npc.x, npc.y);
      const inRange = dist < 90;
      npc.promptText.setVisible(inRange);

      if (inRange && Phaser.Input.Keyboard.JustDown(this.interactKey)) {
        this.openChat(npc.id, npc.name);
      }
    }

    this.scanLineY = (this.scanLineY + 0.5) % this.scale.height;
    this.scanLine.clear();
    this.scanLine.fillStyle(0x00ffff, 1);
    this.scanLine.fillRect(0, this.scanLineY, this.scale.width, 2);
  }

  private openChat(npcId: string, npcName: string) {
    this.paused = true;
    try {
      if (this.input && (this.input.keyboard as any)) {
        (this.input.keyboard as any).enabled = false;
      }
    } catch (err) {
      // ignore
    }
    window.dispatchEvent(
      new CustomEvent("OPEN_CHAT", {
        detail: { npcId, npcName },
      })
    );
  }

  destroy() {
    if (this.boundCloseChat) {
      window.removeEventListener("CLOSE_CHAT", this.boundCloseChat);
    }
    if (this.boundGameResume) {
      window.removeEventListener("GAME_RESUME", this.boundGameResume);
    }
    if (this.boundNpcAction) {
      window.removeEventListener("npc-action", this.boundNpcAction);
    }
  }
}
