window.RUNNER_CONFIG = {
    canvas: {
        width: 800,
        height: 300,
        maxDevicePixelRatio: 2
    },

    palette: {
        skyTop: "#0b1731",
        skyBottom: "#06101d",
        ground: "rgba(190, 224, 255, 0.68)",
        shadow: "rgba(0, 0, 0, 0.34)",
        fallbackPlayer: "#d6efb6",
        fallbackObstacle: "#4b0d38"
    },

    background: {
        image: "assets/images/forest-loop-v1.webp",
        scrollFactor: 0.16,
        tint: "rgba(4, 9, 20, 0.10)",
        groundShade: "rgba(3, 7, 15, 0.30)"
    },

    player: {
        image: "assets/images/muramasa-run.webp",
        frameWidth: 144,
        frameHeight: 156,
        frameY: 0,
        walkFrames: [0, 1, 2, 3, 4, 5, 6, 7],
        jumpFrame: 3,
        frameDurationMs: 85,
        drawWidth: 78,
        drawHeight: 85,
        x: 30,
        groundOverlap: 5,
        jumpVelocity: -650,
        gravity: 1800,
        hitbox: {
            left: 20,
            top: 12,
            right: 16,
            bottom: 6
        }
    },

    obstacle: {
        variants: [
            {
                id: "tatari-561",
                image: "assets/images/tatari-561.webp",
                aspectRatio: 761 / 1646,
                hitbox: { left: 0.17, top: 0.38, right: 0.16, bottom: 0.06 }
            },
            {
                id: "tatari-602",
                image: "assets/images/tatari-602.webp",
                aspectRatio: 1557 / 1643,
                hitbox: { left: 0.38, top: 0.40, right: 0.19, bottom: 0.05 }
            },
            {
                id: "tatari-0-561",
                image: "assets/images/tatari-0-561.webp",
                aspectRatio: 379 / 824,
                hitbox: { left: 0.17, top: 0.38, right: 0.16, bottom: 0.06 }
            },
            {
                id: "tatari-0-602",
                image: "assets/images/tatari-0-602.webp",
                aspectRatio: 780 / 823,
                hitbox: { left: 0.38, top: 0.40, right: 0.19, bottom: 0.05 }
            }
        ],
        drawHeight: 92,
        groundOverlap: 8,
        baseSpeed: 225,
        maxSpeed: 430,
        accelerationPerPoint: 0.45,
        firstGap: 470,
        minGap: 270,
        maxGap: 630
    },

    death: {
        image: "assets/images/death-shy.jpg",
        drawWidth: 82,
        drawHeight: 82,
        borderRadius: 12
    },

    specialScore: {
        value: 721,
        image: "assets/images/score-0721.gif",
        message: "恭喜你，正好在0721分死亡！"
    },

    scene: {
        groundY: 275,
        scorePerSecond: 10
    },

    audio: {
        bgm: "assets/audio/darkness-bgm.ogg",
        jump: null,
        hit: null,
        milestone: null,
        volume: 0.45,
        bgmVolume: 0.24
    }
};
