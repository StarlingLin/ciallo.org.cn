window.ASTEROIDS_CONFIG = {
    canvas: {
        width: 800,
        height: 500,
        maxDevicePixelRatio: 2
    },

    game: {
        startingLives: 3,
        startingAsteroids: 4,
        asteroidsPerWave: 1,
        scoreDigits: 6,
        waveDigits: 2
    },

    ship: {
        radius: 18,
        drawWidth: 64,
        drawHeight: 64,
        image: "assets/images/nene-player.webp",
        imageRotationOffset: 0,
        rotationSpeed: 4.35,
        thrust: 275,
        maximumSpeed: 330,
        dragPerSecond: 0.55,
        invulnerabilityMs: 1800,
        fireCooldownMs: 175
    },

    bullet: {
        radius: 3,
        speed: 530,
        lifetimeMs: 1050,
        image: null,
        drawWidth: 12,
        drawHeight: 12
    },

    asteroids: {
        images: ["assets/images/detonator.webp"],
        sizes: {
            large: { radius: 42, speedMin: 34, speedMax: 58, score: 20, splitInto: "medium", drawSize: 88 },
            medium: { radius: 26, speedMin: 54, speedMax: 86, score: 50, splitInto: "small", drawSize: 56 },
            small: { radius: 14, speedMin: 82, speedMax: 124, score: 100, splitInto: null, drawSize: 32 }
        },
        splitCount: 2,
        safeSpawnRadius: 150
    },

    scene: {
        backgroundImage: null,
        backgroundTop: "#11152c",
        backgroundBottom: "#030611",
        starColor: "#dff8ff",
        accentColor: "#61ddff",
        shipColor: "#fff1f7",
        shipAccent: "#ff73b6",
        asteroidColor: "#dd7fa4",
        asteroidEdge: "#ffc2da",
        bulletColor: "#fff0a5"
    },

    audio: {
        bgm: null,
        shoot: null,
        hit: null,
        explode: "assets/audio/0721.ogg",
        lose: "assets/audio/0721.ogg",
        wave: null,
        volume: 0.5,
        bgmVolume: 0.18
    }
};
