window.BREAKOUT_CONFIG = {
    canvas: {
        width: 800,
        height: 500,
        maxDevicePixelRatio: 2
    },

    game: {
        startingLives: 3,
        scoreDigits: 5,
        nextLevelDelayMs: 900
    },

    paddle: {
        width: 206,
        height: 28,
        bottom: 126,
        speed: 570,
        image: "assets/images/nanami-paddle.webp",
        drawWidth: 240,
        drawHeight: 160,
        drawOffsetY: 118
    },

    ball: {
        radius: 11,
        startingSpeed: 350,
        maximumSpeed: 570,
        speedGainPerBrick: 1.006,
        image: "assets/images/dumpling-ball.webp",
        sourceCrop: { x: 16, y: 32, width: 96, height: 62 },
        drawWidth: 34,
        drawHeight: 22,
        rotationSpeed: 7.2
    },

    bricks: {
        columns: 10,
        gap: 8,
        sideMargin: 42,
        top: 54,
        height: 27,
        rowGap: 8,
        cornerRadius: 7,
        portraits: {
            image: "assets/images/riddle-joker-heads.webp",
            opacity: 0.42,
            maximumWidth: 34,
            maximumHeight: 24,
            crops: [
                { x: 9, y: 9, width: 110, height: 110 },
                { x: 137, y: 20, width: 110, height: 88 },
                { x: 270, y: 8, width: 100, height: 111 },
                { x: 393, y: 12, width: 110, height: 104 },
                { x: 521, y: 14, width: 110, height: 101 }
            ]
        },
        types: {
            P: { score: 40, hitPoints: 1, colorA: "#ff78bb", colorB: "#e653a5", portraitIndex: 1, image: null },
            V: { score: 30, hitPoints: 1, colorA: "#aa96ff", colorB: "#7b67df", portraitIndex: 2, image: null },
            B: { score: 20, hitPoints: 1, colorA: "#72d8ff", colorB: "#419fd6", portraitIndex: 3, image: null },
            G: { score: 10, hitPoints: 1, colorA: "#92e6c2", colorB: "#4db68a", portraitIndex: 4, image: null },
            X: { score: 60, hitPoints: 2, colorA: "#ffd486", colorB: "#dc8b49", portraitIndex: 0, image: null }
        }
    },

    levels: [
        [
            "PPPPPPPPPP",
            "VVVVVVVVVV",
            "BBBBBBBBBB",
            "GGGGGGGGGG",
            "PPVVBBGGPP",
            "VBGPPGGBVV"
        ],
        [
            "P.P.VV.P.P",
            ".V.BBB.V..",
            "BBGXXXXGBB",
            ".VBGXXGBV.",
            "P.BGVVGB.P",
            ".PP....PP."
        ],
        [
            "XXXXXXXXXX",
            "PVBGXXGBVP",
            "VBGXXXXGBV",
            "BGXXPPXXGB",
            "GXXPVVPXXG",
            "XPPVBBVPPX"
        ]
    ],

    scene: {
        backgroundImage: null,
        backgroundTop: "#16132a",
        backgroundBottom: "#090b16",
        gridColor: "rgba(183, 171, 255, 0.045)",
        wallGlow: "rgba(142, 124, 255, 0.32)",
        paddleColorA: "#ff7cbc",
        paddleColorB: "#8877ff",
        ballColor: "#fff7fc"
    },

    audio: {
        bgm: null,
        launch: null,
        wall: null,
        paddle: null,
        brick: "assets/audio/desk-thud.ogg",
        lose: null,
        clear: null,
        gameOver: null,
        volume: 0.55,
        bgmVolume: 0.2
    }
};
