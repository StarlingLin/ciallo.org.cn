window.SNAKE_CONFIG = {
    canvas: {
        width: 960,
        height: 600
    },

    world: {
        width: 2600,
        height: 1600,
        margin: 28,
        gridSize: 80
    },

    player: {
        initialSegments: 12,
        minimumBoostSegments: 9,
        segmentSpacing: 13,
        headRadius: 17,
        bodyRadius: 12,
        speed: 150,
        boostMultiplier: 1.62,
        boostDrainInterval: 0.42,
        turnRate: 3.75
    },

    bot: {
        firstSpawnDelay: 8,
        spawnIntervalMin: 18,
        spawnIntervalMax: 27,
        maximumAlive: 5,
        initialSegmentsMin: 10,
        initialSegmentsMax: 18,
        speedMin: 130,
        speedMax: 146,
        turnRateMin: 2.45,
        turnRateMax: 3.15,
        decisionIntervalMin: 0.09,
        decisionIntervalMax: 0.18,
        safeSpawnDistance: 620,
        edgeSoftDistance: 390,
        edgeHardDistance: 150,
        edgeLookAheadTime: 1.65,
        edgeWeight: 6.8,
        edgePredictionWeight: 9.4,
        edgeEmergencyTurnMultiplier: 1.7,
        edgeEmergencyInset: 8,
        frenzyAfterSeconds: 600,
        frenzySpeedMultiplier: 1.5
    },

    food: {
        initialCount: 150,
        minimumCount: 120,
        radiusMin: 4,
        radiusMax: 7,
        normalValue: 10,
        droppedValue: 16,
        growthEveryScore: 20,
        droppedStride: 2
    },

    score: {
        survivalPerSecond: 1,
        botDefeat: 120
    },

    skins: [
        {
            id: "ena",
            name: "惠凪",
            description: "柔粉与莓红色轨迹",
            head: "assets/images/skins/cropped/ena.webp",
            bodyA: "#f5a7c8",
            bodyB: "#b983d8",
            glow: "rgba(245, 144, 193, 0.48)"
        },
        {
            id: "anju",
            name: "杏珠",
            description: "灰紫与新绿色轨迹",
            head: "assets/images/skins/cropped/anju.webp",
            bodyA: "#9b91b4",
            bodyB: "#73cf91",
            glow: "rgba(132, 196, 157, 0.46)"
        },
        {
            id: "tsukimi",
            name: "月望",
            description: "明黄与暖橙色轨迹",
            head: "assets/images/skins/cropped/tsukimi.webp",
            bodyA: "#ffd968",
            bodyB: "#f1a061",
            glow: "rgba(255, 203, 92, 0.5)"
        },
        {
            id: "ririko",
            name: "莉莉子",
            description: "绯红与珊瑚色轨迹",
            head: "assets/images/skins/cropped/ririko.webp",
            bodyA: "#f16078",
            bodyB: "#f1a15f",
            glow: "rgba(242, 91, 121, 0.48)"
        },
        {
            id: "miku",
            name: "美玖",
            description: "薄荷与雾蓝色轨迹",
            head: "assets/images/skins/cropped/miku.webp",
            bodyA: "#c7e1d3",
            bodyB: "#93afd0",
            glow: "rgba(174, 219, 207, 0.48)"
        },
        {
            id: "nayuka",
            name: "那优花",
            description: "淡紫与樱粉色轨迹",
            head: "assets/images/skins/cropped/nayuka.webp",
            bodyA: "#c4a5ed",
            bodyB: "#ef9fc7",
            glow: "rgba(205, 153, 235, 0.5)"
        }
    ],

    personalities: [
        {
            id: "greedy",
            name: "贪吃型",
            foodWeight: 1.42,
            avoidWeight: 2.15,
            huntWeight: 0.12,
            wanderWeight: 0.28,
            turnRateMultiplier: 1,
            initialSpeedMultiplier: 1,
            maximumSpeedMultiplier: 1.8,
            speedRampSeconds: 300
        },
        {
            id: "careful",
            name: "谨慎型",
            foodWeight: 0.82,
            avoidWeight: 3.25,
            huntWeight: 0.08,
            wanderWeight: 0.34,
            turnRateMultiplier: 1.35,
            initialSpeedMultiplier: 1,
            maximumSpeedMultiplier: 1,
            speedRampSeconds: 300
        },
        {
            id: "hunter",
            name: "追猎型",
            foodWeight: 0.72,
            avoidWeight: 2.46,
            huntWeight: 1.15,
            wanderWeight: 0.22,
            turnRateMultiplier: 1,
            initialSpeedMultiplier: 1.4,
            maximumSpeedMultiplier: 2.3,
            speedRampSeconds: 300
        }
    ]
};
